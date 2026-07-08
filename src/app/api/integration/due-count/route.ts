/**
 * GET /api/integration/due-count?lineUserId=U...
 *
 * CMS（課題管理システム）が生徒ホームに「今日の復習◯件」を出すための件数取得 API。
 * CMS と SRS は別 Supabase プロジェクトのため、CMS は line_user_id をキーに呼ぶ
 * （SRS 側で profiles.id に解決する）。CMS 側 ADR: 20260708-srs-integration-link。
 *
 * 「今日の件数」= 期限到来の復習カード + 未学習の新規カード（デッキごとに new_cards_per_day で頭打ち）。
 * 課題完了で解禁したばかりのデッキは全カードが新規（card_state 未作成）なので、これを数えないと
 * ホームに 0 と出てしまう。新規は日次上限で頭打ちして「20分で終わる床」を崩さない。
 *
 * 認証: SRS_AUTH_SECRET を Bearer トークンとして検証（billing-sync と同じ機械間認証）
 *
 * Response: { data: { dueCount: number } } / { error: string }
 * 生徒が SRS 未登録・カード無しの場合は dueCount=0 を返す（エラーにしない）
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { deriveLineEmail } from '@/lib/auth/line-user'

const DEFAULT_NEW_CARDS_PER_DAY = 20

// 生徒の「今日やるべき件数」を概算する。
// 復習（card_state が期限到来）+ 割当デッキの新規カード（デッキ日次上限で頭打ち）。
// 厳密なセッション組成は SRS 本体が行う。ここは CMS ホーム表示用の目安。
async function computeStudyCount(supabase: SupabaseClient, userId: string): Promise<number> {
  const now = new Date().toISOString()

  // 1. 期限到来の復習（全デッキ横断。suspended は除外）
  const { count: dueReviews } = await supabase
    .from('card_states')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .neq('state', 'suspended')
    .lte('due', now)

  // 2. 個別割当デッキの新規カード（= card_state が無いカード）を日次上限で頭打ちして合算
  const { data: assignments } = await supabase
    .from('deck_assignments')
    .select('deck_id')
    .eq('user_id', userId)

  let newTotal = 0
  for (const assignment of assignments ?? []) {
    const { data: deck } = await supabase
      .from('decks')
      .select('settings')
      .eq('id', assignment.deck_id)
      .maybeSingle()
    const settings = (deck?.settings ?? null) as { new_cards_per_day?: number } | null
    const perDay = Number(settings?.new_cards_per_day ?? DEFAULT_NEW_CARDS_PER_DAY)

    // 子孫デッキも含めて数える（new_cards_per_day はルートで共有）
    const { data: descendants } = await supabase.rpc('get_descendant_deck_ids', {
      p_deck_id: assignment.deck_id,
    })
    const deckIds = [assignment.deck_id, ...((descendants ?? []) as unknown[]).map((d) => String(d))]

    const { count: totalCards } = await supabase
      .from('cards')
      .select('*', { count: 'exact', head: true })
      .in('deck_id', deckIds)

    const { count: withState } = await supabase
      .from('card_states')
      .select('cards!inner(deck_id)', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('cards.deck_id', deckIds)

    const newInDeck = Math.max(0, (totalCards ?? 0) - (withState ?? 0))
    newTotal += Math.min(newInDeck, Math.max(0, perDay))
  }

  return (dueReviews ?? 0) + newTotal
}

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

    const dueCount = await computeStudyCount(supabase, profile.id)
    return NextResponse.json({ data: { dueCount } })
  } catch (error) {
    console.error('Error in due-count:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
