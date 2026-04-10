import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')
  const origin = request.nextUrl.origin

  if (!token) {
    return NextResponse.redirect(`${origin}/login?error=missing_token`)
  }

  const authSecret = process.env.SRS_AUTH_SECRET
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!authSecret || !supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    console.error('[LINE Auth] Missing environment variables')
    return NextResponse.redirect(`${origin}/login?error=server_error`)
  }

  // 1. Validate JWT
  const secret = new TextEncoder().encode(authSecret)
  let lineUserId: string
  let name: string
  let role: string

  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] })
    lineUserId = payload.sub as string
    name = payload.name as string
    role = (payload.role as string) || 'student'

    if (!lineUserId || !name) {
      return NextResponse.redirect(`${origin}/login?error=invalid_token`)
    }
  } catch (err) {
    console.error('[LINE Auth] JWT verification failed:', err)
    return NextResponse.redirect(`${origin}/login?error=invalid_token`)
  }

  // 2. Derive deterministic credentials from LINE user ID
  const lineEmail = `line_${lineUserId}@tsubame-srs.local`
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    secret,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const passwordBytes = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    new TextEncoder().encode(lineUserId)
  )
  const password = Array.from(new Uint8Array(passwordBytes))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  const adminClient = createSupabaseClient(supabaseUrl, serviceRoleKey)
  const validRole = role === 'teacher' || role === 'admin' ? role : 'student'

  // 3. Find existing user: try signInWithPassword first (fast path for normal users),
  //    then fall back to metadata search (for users whose email was changed)
  const response = NextResponse.redirect(`${origin}/`)
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name: cookieName, value, options }) => {
          response.cookies.set(cookieName, value, options)
        })
      },
    },
  })

  // Try A: Sign in with LINE-derived email + password (works for most users)
  const { data: passwordSession } = await supabase.auth.signInWithPassword({
    email: lineEmail,
    password,
  })

  if (passwordSession?.user) {
    // Success — update profile name if needed
    await updateProfileName(supabaseUrl, serviceRoleKey, passwordSession.user.id, name)
    response.cookies.set('has_profile', passwordSession.user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24,
      path: '/',
    })
    return response
  }

  // Try B: Search by line_user_id in metadata (handles email-changed users like teachers)
  console.log('[LINE Auth] Password sign-in failed, searching by metadata for', lineUserId)
  try {
    const { data: { users: allUsers } } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
    const existingUser = allUsers.find(
      (u) => u.user_metadata?.line_user_id === lineUserId
    )

    if (existingUser) {
      console.log('[LINE Auth] Found existing user by metadata:', existingUser.id, existingUser.email)

      // Generate magic link to create session without password
      const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
        type: 'magiclink',
        email: existingUser.email!,
      })

      if (linkError || !linkData.properties?.hashed_token) {
        console.error('[LINE Auth] Failed to generate magic link:', linkError)
        return NextResponse.redirect(`${origin}/login?error=server_error`)
      }

      const { data: otpSession, error: otpError } = await supabase.auth.verifyOtp({
        token_hash: linkData.properties.hashed_token,
        type: 'magiclink',
      })

      if (otpError || !otpSession.user) {
        console.error('[LINE Auth] OTP verification failed:', otpError)
        return NextResponse.redirect(`${origin}/login?error=server_error`)
      }

      await updateProfileName(supabaseUrl, serviceRoleKey, otpSession.user.id, name)
      response.cookies.set('has_profile', otpSession.user.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24,
        path: '/',
      })
      return response
    }
  } catch (err) {
    console.error('[LINE Auth] Metadata search failed, proceeding to create new user:', err)
  }

  // Try C: New user — create account
  console.log('[LINE Auth] Creating new user for', lineUserId)
  const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
    email: lineEmail,
    password,
    email_confirm: true,
    user_metadata: { line_user_id: lineUserId, name, role: validRole },
  })

  if (createError || !newUser?.user) {
    console.error('[LINE Auth] Failed to create user:', createError)
    return NextResponse.redirect(`${origin}/login?error=server_error`)
  }

  // Create profile
  const { error: profileError } = await adminClient
    .from('profiles')
    .insert({
      id: newUser.user.id,
      email: lineEmail,
      name,
      role: validRole,
    })

  if (profileError) {
    console.error('[LINE Auth] Failed to create profile:', profileError)
  }

  // Sign in the new user
  const { data: newSession, error: newSignInError } = await supabase.auth.signInWithPassword({
    email: lineEmail,
    password,
  })

  if (newSignInError || !newSession.user) {
    console.error('[LINE Auth] New user sign-in failed:', newSignInError)
    return NextResponse.redirect(`${origin}/login?error=server_error`)
  }

  response.cookies.set('has_profile', newSession.user.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24,
    path: '/',
  })

  return response
}

async function updateProfileName(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
  newName: string,
) {
  const client = createSupabaseClient(supabaseUrl, serviceRoleKey)
  const { data: profile } = await client
    .from('profiles')
    .select('id, name')
    .eq('id', userId)
    .single()

  if (profile && profile.name !== newName) {
    await client
      .from('profiles')
      .update({ name: newName })
      .eq('id', profile.id)
  }
}
