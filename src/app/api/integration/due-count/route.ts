/**
 * GET /api/integration/due-count?lineUserId=U...
 *
 * CMS（課題管理システム）が生徒ホームに「今日の復習◯件」を出すための件数取得 API。
 * CMS と SRS は別 Supabase プロジェクトのため、CMS は line_user_id をキーに呼ぶ
 * （SRS 側で profiles.id に解決する）。CMS 側 ADR: 20260708-srs-integration-link。
 *
 * 認証: SRS_AUTH_SECRET を Bearer トークンとして検証（billing-sync と同じ機械間認証）
 *
 * Response: { data: { dueCount: number } } / { error: string }
 * 生徒が SRS 未登録・カード無しの場合は dueCount=0 を返す（エラーにしない）
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { deriveLineEmail } from '@/lib/auth/line-user'

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const authSecret = process.env.SRS_AUTH_SECRET
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!authSecret || !supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }
    if (authHeader !== `Bearer ${authSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const lineUserId = request.nextUrl.searchParams.get('lineUserId')
    if (!lineUserId) {
      return NextResponse.json({ error: 'lineUserId is required' }, { status: 400 })
    }

    const supabase = createSupabaseClient(supabaseUrl, serviceRoleKey)

    // line_user_id -> profiles.id。未登録なら 0 件（カードが無いのと同じ扱い。CMS は非表示にするだけ）
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', deriveLineEmail(lineUserId))
      .maybeSingle()
    if (!profile) {
      return NextResponse.json({ data: { dueCount: 0 } })
    }

    // 期限到来（due <= now）かつ suspended でないカード枚数（due-cards-summary と同じ条件）
    const { count } = await supabase
      .from('card_states')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', profile.id)
      .neq('state', 'suspended')
      .lte('due', new Date().toISOString())

    return NextResponse.json({ data: { dueCount: count ?? 0 } })
  } catch (error) {
    console.error('Error in due-count:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
