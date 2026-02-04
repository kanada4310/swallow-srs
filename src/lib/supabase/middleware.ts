import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// 認証不要のパス
const publicPaths = ['/login', '/callback']

// プロフィール設定ページ
const setupPath = '/setup'

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl

  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // セッションを取得
  const { data: { user } } = await supabase.auth.getUser()

  // 公開パスはそのまま通す
  if (publicPaths.some(path => pathname.startsWith(path))) {
    // ログイン済みでログインページにアクセスした場合はリダイレクト
    if (user && pathname.startsWith('/login')) {
      const url = request.nextUrl.clone()
      url.pathname = '/'
      return NextResponse.redirect(url)
    }
    return supabaseResponse
  }

  // 未認証の場合はログインページへリダイレクト
  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // セットアップページの場合はプロフィールチェックをスキップ
  if (pathname.startsWith(setupPath)) {
    return supabaseResponse
  }

  // Cookieにプロフィール確認済みフラグがあればDBクエリをスキップ
  const hasProfileCookie = request.cookies.get('has_profile')?.value
  if (hasProfileCookie === user.id) {
    return supabaseResponse
  }

  // プロフィールが存在するかチェック（初回のみ）
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .single()

  // プロフィールがない場合はセットアップページへリダイレクト
  if (!profile) {
    const url = request.nextUrl.clone()
    url.pathname = '/setup'
    return NextResponse.redirect(url)
  }

  // プロフィール確認済みフラグをCookieにセット（24時間有効）
  supabaseResponse.cookies.set('has_profile', user.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24, // 24 hours
    path: '/',
  })

  return supabaseResponse
}
