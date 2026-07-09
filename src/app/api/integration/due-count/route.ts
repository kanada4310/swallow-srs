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
// SRS の「1日」の開始（4:00 JST）を UTC ISO で返す。今日すでに導入した新規枚数の集計に使う
// （SRS 本体のオフライン集計と境界を合わせる）。
function srsDayStartIso(now: Date): string {
  const JST_MS = 9 * 60 * 60 * 1000
  const jst = new Date(now.getTime() + JST_MS)
  const jst4amAsUtc = Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate(), 4, 0, 0)
  let boundary = jst4amAsUtc - JST_MS
  if (now.getTime() < boundary) boundary -= 24 * 60 * 60 * 1000
  return new Date(boundary).toISOString()
}

// 復習（card_state が期限到来）+ 割当デッキの「まだ残っている今日の新規カード」。
// 新規は「未学習枚数」を日次上限で頭打ちし、さらに「今日すでに導入した枚数」を差し引く。
// これで復習を終えると件数が減る（＝実際の実施と連動する）。厳密な組成は SRS 本体が行う目安値。
async function computeStudyCount(supabase: SupabaseClient, userId: string): Promise<number> {
  const now = new Date()
  const nowIso = now.toISOString()
  const dayStart = srsDayStartIso(now)

  // 1. 期限到来の復習（学習中/復習/再学習のみ。未学習 new と suspended は別扱い）
  const { count: dueReviews } = await supabase
    .from('card_states')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('state', ['learning', 'review', 'relearning'])
    .lte('due', nowIso)

  // 2. 個別割当デッキの新規カード（= card_state が無いカード）。
  //    上限 = new_cards_per_day − 今日この root で導入済みの新規枚数（distinct card）
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
    if (perDay <= 0) continue

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

    // 今日この root で導入した新規（last_interval=0 のログの distinct card 数）
    const { data: newLogs } = await supabase
      .from('review_logs')
      .select('card_id, cards!inner(deck_id)')
      .eq('user_id', userId)
      .eq('last_interval', 0)
      .gte('reviewed_at', dayStart)
      .in('cards.deck_id', deckIds)
    const introducedToday = new Set((newLogs ?? []).map((l) => l.card_id as string)).size

    const newInDeck = Math.max(0, (totalCards ?? 0) - (withState ?? 0))
    const remainingToday = Math.max(0, perDay - introducedToday)
    newTotal += Math.min(newInDeck, remainingToday)
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
