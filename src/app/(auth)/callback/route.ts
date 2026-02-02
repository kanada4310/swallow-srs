import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // セッション確立後、プロフィール確認へ
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        // プロフィールが存在するか確認
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', user.id)
          .single()

        if (!profile) {
          // プロフィール未作成 → 初回設定ページへ
          return NextResponse.redirect(`${origin}/setup`)
        }
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // エラー時はログインページへ
  return NextResponse.redirect(`${origin}/login?error=auth`)
}
