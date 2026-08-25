/**
 * スパルタプログラム管理 — サーバー側の集計ヘルパー。
 *
 * - 進捗は既存の card_states（定着度）と review_logs（日々の実施）から集計時に導出する
 * - Supabase クライアントは呼び出し元が渡す（講師API・生徒APIとも service role で集計し、
 *   認可はセッション認証＋対象生徒チェックで担保する。復習通知の管理と同じ型
 *   ＝RLS 経由だと生徒の個人デッキ配下が講師から見えず集計がズレるのを避ける）
 * - デッキの親子解決は復習通知の管理（review-pause）の DeckMaps を再利用する
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { MasteryCardInput } from '@/lib/wordbook/mastery'
import type { DeckMaps } from '@/lib/review-pause/server'
import {
  deriveSpartaProgress,
  countAchieved,
  periodStart,
  periodEndExclusive,
  type SpartaGoalMastery,
  type SpartaProgress,
} from './logic'

const PAGE_SIZE = 1000
/** 暴走ガード（1プログラムで読む行数の上限 = 5万行） */
const MAX_PAGES = 50

/** sparta_programs の行（DB スキーマと対応） */
export interface SpartaProgramRow {
  id: string
  user_id: string
  deck_ids: string[]
  start_date: string
  end_date: string
  target_card_count: number | null
  goal_mastery: SpartaGoalMastery
  baseline_achieved_count: number
  status: 'active' | 'canceled'
  memo: string | null
  created_at: string
}

/** API が返す、進捗つきのプログラム */
export interface SpartaProgramWithProgress {
  id: string
  userId: string
  deckIds: string[]
  deckNames: string[]
  startDate: string
  endDate: string
  targetCardCount: number | null
  goalMastery: SpartaGoalMastery
  status: 'active' | 'canceled'
  memo: string | null
  progress: SpartaProgress
}

/** 対象ルートデッキ群の配下（自身含む）デッキID集合 */
export function collectSubtree(deckMaps: DeckMaps, deckIds: string[]): string[] {
  const all = new Set<string>()
  for (const id of deckIds) {
    for (const d of deckMaps.subtreeOf.get(id) || [id]) all.add(d)
  }
  return Array.from(all)
}

/**
 * 対象デッキ群の全カード数と、生徒の学習状態（定着度導出に必要な列のみ）を取得する。
 * 未学習カードは card_states に行が無いので、総数との差を null で埋めて返す。
 */
export async function fetchCardStatesForDecks(
  supabase: SupabaseClient,
  userId: string,
  subtree: string[]
): Promise<Array<MasteryCardInput | null>> {
  const { count, error: countError } = await supabase
    .from('cards')
    .select('id', { count: 'exact', head: true })
    .in('deck_id', subtree)
  if (countError) throw countError
  const totalCards = count ?? 0

  const states: MasteryCardInput[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await supabase
      .from('card_states')
      .select('state, stability, interval, lapses, cards!inner(deck_id)')
      .eq('user_id', userId)
      .in('cards.deck_id', subtree)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    if (error) throw error
    for (const row of data || []) {
      states.push({
        state: row.state as string,
        stability: (row.stability as number | null) ?? null,
        interval: (row.interval as number) ?? 0,
        lapses: (row.lapses as number) ?? 0,
      })
    }
    if (!data || data.length < PAGE_SIZE) break
  }

  const result: Array<MasteryCardInput | null> = [...states]
  for (let i = states.length; i < totalCards; i++) result.push(null)
  return result
}

/** 期間内・対象デッキの復習日時を取得する */
export async function fetchReviewDatesForDecks(
  supabase: SupabaseClient,
  userId: string,
  subtree: string[],
  startDate: string,
  endDate: string
): Promise<Date[]> {
  const startIso = periodStart(startDate).toISOString()
  const endIso = periodEndExclusive(endDate).toISOString()
  const dates: Date[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await supabase
      .from('review_logs')
      .select('reviewed_at, cards!inner(deck_id)')
      .eq('user_id', userId)
      .gte('reviewed_at', startIso)
      .lt('reviewed_at', endIso)
      .in('cards.deck_id', subtree)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    if (error) throw error
    for (const row of data || []) dates.push(new Date(row.reviewed_at as string))
    if (!data || data.length < PAGE_SIZE) break
  }
  return dates
}

/** 登録・編集時の「現時点で既に習得済みの数」（進捗の起点）を計算する */
export async function computeBaseline(
  supabase: SupabaseClient,
  deckMaps: DeckMaps,
  userId: string,
  deckIds: string[],
  goalMastery: SpartaGoalMastery
): Promise<number> {
  const subtree = collectSubtree(deckMaps, deckIds)
  const cardStates = await fetchCardStatesForDecks(supabase, userId, subtree)
  return countAchieved(cardStates, goalMastery)
}

/** プログラム1件に進捗とデッキ名を付けて返す */
export async function enrichProgram(
  supabase: SupabaseClient,
  deckMaps: DeckMaps,
  row: SpartaProgramRow,
  now: Date = new Date()
): Promise<SpartaProgramWithProgress> {
  const subtree = collectSubtree(deckMaps, row.deck_ids)
  const [cardStates, reviewDates] = await Promise.all([
    fetchCardStatesForDecks(supabase, row.user_id, subtree),
    fetchReviewDatesForDecks(supabase, row.user_id, subtree, row.start_date, row.end_date),
  ])

  const progress = deriveSpartaProgress(
    {
      startDate: row.start_date,
      endDate: row.end_date,
      targetCardCount: row.target_card_count,
      goalMastery: row.goal_mastery,
      baselineAchievedCount: row.baseline_achieved_count,
      status: row.status,
    },
    cardStates,
    reviewDates,
    now
  )

  return {
    id: row.id,
    userId: row.user_id,
    deckIds: row.deck_ids,
    deckNames: row.deck_ids.map(id => deckMaps.nameOf.get(id) || '(削除されたデッキ)'),
    startDate: row.start_date,
    endDate: row.end_date,
    targetCardCount: row.target_card_count,
    goalMastery: row.goal_mastery,
    status: row.status,
    memo: row.memo,
    progress,
  }
}

/**
 * 指定デッキ群をルートデッキIDに解決して重複を除く。
 * 実在しないデッキIDが混ざっていたら null を返す（登録を弾く）。
 */
export function resolveRootDeckIds(deckMaps: DeckMaps, deckIds: string[]): string[] | null {
  const roots = new Set<string>()
  for (const id of deckIds) {
    if (!deckMaps.nameOf.has(id)) return null
    roots.add(deckMaps.rootOf(id))
  }
  return Array.from(roots)
}
