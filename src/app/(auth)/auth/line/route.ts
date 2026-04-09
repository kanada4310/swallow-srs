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
  const email = `line_${lineUserId}@tsubame-srs.local`
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

  // 3. Find or create Supabase user (admin client)
  const adminClient = createSupabaseClient(supabaseUrl, serviceRoleKey)
  const validRole = role === 'teacher' || role === 'admin' ? role : 'student'

  try {
    // Try to create user (will fail with "already registered" if exists)
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { line_user_id: lineUserId, name, role: validRole },
    })

    if (newUser?.user) {
      // New user — create profile
      const { error: profileError } = await adminClient
        .from('profiles')
        .insert({
          id: newUser.user.id,
          email,
          name,
          role: validRole,
        })

      if (profileError) {
        console.error('[LINE Auth] Failed to create profile:', profileError)
      }
    } else if (createError) {
      // User already exists — update profile name if changed
      const { data: existingProfile } = await adminClient
        .from('profiles')
        .select('id, name')
        .eq('email', email)
        .single()

      if (existingProfile && existingProfile.name !== name) {
        await adminClient
          .from('profiles')
          .update({ name })
          .eq('id', existingProfile.id)
      }
    }
  } catch (err) {
    console.error('[LINE Auth] User management error:', err)
    return NextResponse.redirect(`${origin}/login?error=server_error`)
  }

  // 4. Sign in with SSR client (sets session cookies)
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

  const { data: session, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (signInError || !session.user) {
    console.error('[LINE Auth] Sign-in failed:', signInError)
    return NextResponse.redirect(`${origin}/login?error=server_error`)
  }

  // 5. Set has_profile cookie (skip middleware DB check)
  response.cookies.set('has_profile', session.user.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24,
    path: '/',
  })

  return response
}
