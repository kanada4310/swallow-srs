import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import {
  deriveLineEmail,
  deriveLinePassword,
  findOrCreateSRSUser,
  type ValidRole,
} from '@/lib/auth/line-user'
import { safeNext } from '@/lib/auth/safe-next'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')
  const next = safeNext(searchParams.get('next'))
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
  let lineUserId: string
  let name: string
  let role: string

  try {
    const secret = new TextEncoder().encode(authSecret)
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

  const validRole: ValidRole = role === 'teacher' || role === 'admin' ? role : 'student'
  const adminClient = createSupabaseClient(supabaseUrl, serviceRoleKey)

  // 2. Find or create user via shared utility
  const result = await findOrCreateSRSUser(adminClient, lineUserId, name, validRole, authSecret)

  if (result.error || !result.userId) {
    console.error('[LINE Auth] findOrCreateSRSUser failed:', result.error)
    return NextResponse.redirect(`${origin}/login?error=server_error`)
  }

  // 3. Establish session — sign in with LINE-derived credentials
  const lineEmail = deriveLineEmail(lineUserId)
  const password = await deriveLinePassword(lineUserId, authSecret)

  const response = NextResponse.redirect(`${origin}${next}`)
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

  // Try password sign-in first
  const { data: passwordSession } = await supabase.auth.signInWithPassword({
    email: lineEmail,
    password,
  })

  if (passwordSession?.user) {
    response.cookies.set('has_profile', passwordSession.user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24,
      path: '/',
    })
    return response
  }

  // Fallback: magic link for email-changed users
  console.log('[LINE Auth] Password sign-in failed, trying magic link for', result.userId)
  try {
    const { data: { users: allUsers } } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
    const existingUser = allUsers.find(u => u.id === result.userId)

    if (existingUser?.email) {
      const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
        type: 'magiclink',
        email: existingUser.email,
      })

      if (!linkError && linkData.properties?.hashed_token) {
        const { data: otpSession, error: otpError } = await supabase.auth.verifyOtp({
          token_hash: linkData.properties.hashed_token,
          type: 'magiclink',
        })

        if (!otpError && otpSession.user) {
          response.cookies.set('has_profile', otpSession.user.id, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24,
            path: '/',
          })
          return response
        }
      }
    }
  } catch (err) {
    console.error('[LINE Auth] Magic link fallback failed:', err)
  }

  console.error('[LINE Auth] All sign-in methods failed for', lineUserId)
  return NextResponse.redirect(`${origin}/login?error=server_error`)
}
