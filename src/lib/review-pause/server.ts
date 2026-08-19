/**
 * デッキ単位の「復習通知の停止」サーバーヘルパー。
 *
 * - due-cards-summary（billing への通知集計）と講師画面 API の両方から使う
 * - Supabase クライアントは呼び出し元が渡す（admin=service role / 講師=RLS）
 * - 自動解除は「停止時刻より後にそのデッキ（配下含む）の review_logs がある」を
 *   集計時に判定し、見つかったらフラグをその場で消す（次回以降も一貫する）
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  type JsonSettings,
  type DueGroup,
  readPauseState,
  applyPause,
  applyResume,
  buildRootResolver,
  buildSubtreeMap,
  groupDueByRoot,
} from './logic'

const PAGE_SIZE = 1000
/** 暴走ガード（1ユーザー or 1バッチで読む期限切れカード行の上限） */
const MAX_DUE_PAGES = 50

export interface DeckMaps {
  /** 任意のデッキID → ルートデッキID */
  rootOf: (deckId: string) => string
  /** ルートデッキID → 配下（自身含む）の全デッキID */
  subtreeOf: Map<string, string[]>
  /** デッキID → デッキ名 */
  nameOf: Map<string, string>
}

/** 全デッキの親子関係と名前を1回で取得してマップ化する */
export async function fetchDeckMaps(supabase: SupabaseClient): Promise<DeckMaps> {
  const decks: Array<{ id: string; name: string; parent_deck_id: string | null }> = []
  for (let page = 0; page < MAX_DUE_PAGES; page++) {
    const { data, error } = await supabase
      .from('decks')
      .select('id, name, parent_deck_id')
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    if (error) throw error
    decks.push(...(data || []))
    if (!data || data.length < PAGE_SIZE) break
  }
  return {
    rootOf: buildRootResolver(decks),
    subtreeOf: buildSubtreeMap(decks),
    nameOf: new Map(decks.map(d => [d.id, d.name])),
  }
}

/**
 * 生徒の期限切れカードをルートデッキ単位で集計する（1000件ずつ全件取得）。
 * フィルタは既存の due-cards-summary と同一（suspended 以外・due 到来）。
 */
export async function fetchDueGroupsForUser(
  supabase: SupabaseClient,
  userId: string,
  nowIso: string,
  rootOf: (deckId: string) => string
): Promise<Map<string, DueGroup>> {
  const rows: Array<{ card_id: string; deck_id: string }> = []
  for (let page = 0; page < MAX_DUE_PAGES; page++) {
    const { data, error } = await supabase
      .from('card_states')
      .select('card_id, cards!inner(deck_id)')
      .eq('user_id', userId)
      .neq('state', 'suspended')
      .lte('due', nowIso)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    if (error) throw error
    for (const row of data || []) {
      const card = row.cards as unknown as { deck_id: string } | { deck_id: string }[]
      const deckId = Array.isArray(card) ? card[0]?.deck_id : card?.deck_id
      if (deckId) rows.push({ card_id: row.card_id as string, deck_id: deckId })
    }
    if (!data || data.length < PAGE_SIZE) break
  }
  return groupDueByRoot(rows, rootOf)
}

export interface PauseEntry {
  userId: string
  rootDeckId: string
  pausedAt: string | null
  settings: JsonSettings
}

/** 指定ユーザー群の停止中エントリ（reviewPaused=true）を取得する */
export async function fetchPauseEntries(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<PauseEntry[]> {
  if (userIds.length === 0) return []
  const { data, error } = await supabase
    .from('user_deck_settings')
    .select('user_id, deck_id, settings')
    .in('user_id', userIds)
    .eq('settings->>reviewPaused', 'true')
  if (error) throw error
  return (data || []).map(row => {
    const settings = (row.settings || {}) as JsonSettings
    return {
      userId: row.user_id as string,
      rootDeckId: row.deck_id as string,
      pausedAt: readPauseState(settings).pausedAt,
      settings,
    }
  })
}

/**
 * 停止エントリの自動解除判定。停止時刻より後にそのデッキ（配下含む）の
 * review_logs があれば DB のフラグを消し、false（=もう停止していない）を返す。
 * 停止時刻が欠けている場合は安全側で停止を維持する。
 */
export async function checkAndAutoRelease(
  supabase: SupabaseClient,
  entry: PauseEntry,
  subtreeOf: Map<string, string[]>
): Promise<boolean> {
  if (!entry.pausedAt) return true // 時刻不明 → 停止維持（解除は手動 or 再停止で時刻が入る）

  const subtree = subtreeOf.get(entry.rootDeckId) || [entry.rootDeckId]
  const { data, error } = await supabase
    .from('review_logs')
    .select('id, cards!inner(deck_id)')
    .eq('user_id', entry.userId)
    .gt('reviewed_at', entry.pausedAt)
    .in('cards.deck_id', subtree)
    .limit(1)
  if (error) {
    console.error('review-pause auto-release check failed:', error)
    return true // 判定不能 → 停止維持（通知を誤送しない側に倒す）
  }
  if (!data || data.length === 0) return true // 学習なし → 停止継続

  // 停止後に学習あり → 自動解除
  const { error: updateError } = await supabase
    .from('user_deck_settings')
    .update({ settings: applyResume(entry.settings) })
    .eq('user_id', entry.userId)
    .eq('deck_id', entry.rootDeckId)
  if (updateError) {
    console.error('review-pause auto-release update failed:', updateError)
    // 書き込みに失敗しても「学習した事実」は確定しているので通知対象に戻す
  }
  return false
}

/**
 * ユーザー群の「現に有効な」停止デッキ集合を返す（自動解除も実施）。
 * 戻り値: Map<userId, Set<rootDeckId>>
 */
export async function resolveActivePauses(
  supabase: SupabaseClient,
  userIds: string[],
  subtreeOf: Map<string, string[]>
): Promise<Map<string, Set<string>>> {
  const entries = await fetchPauseEntries(supabase, userIds)
  const result = new Map<string, Set<string>>()
  for (const entry of entries) {
    const stillPaused = await checkAndAutoRelease(supabase, entry, subtreeOf)
    if (!stillPaused) continue
    let set = result.get(entry.userId)
    if (!set) {
      set = new Set()
      result.set(entry.userId, set)
    }
    set.add(entry.rootDeckId)
  }
  return result
}

/** parent_deck_id をたどってルートデッキIDに解決する（最大深度4） */
export async function resolveRootDeckId(
  supabase: SupabaseClient,
  deckId: string
): Promise<{ id: string; name: string } | null> {
  let currentId = deckId
  for (let depth = 0; depth < 5; depth++) {
    const { data: deck } = await supabase
      .from('decks')
      .select('id, name, parent_deck_id')
      .eq('id', currentId)
      .maybeSingle()
    if (!deck) return null
    if (!deck.parent_deck_id) return { id: deck.id, name: deck.name }
    currentId = deck.parent_deck_id
  }
  return null
}

/**
 * 停止/再開の実体。deckId はルートに解決してから read-modify-write する。
 * billing の postback（admin client）と講師画面（RLS client）の両方から使う。
 */
export async function setReviewPause(
  supabase: SupabaseClient,
  userId: string,
  deckId: string,
  action: 'pause' | 'resume'
): Promise<{ rootDeckId: string; deckName: string; paused: boolean }> {
  const root = await resolveRootDeckId(supabase, deckId)
  if (!root) throw new Error('Deck not found')

  const { data: existing, error: readError } = await supabase
    .from('user_deck_settings')
    .select('settings')
    .eq('user_id', userId)
    .eq('deck_id', root.id)
    .maybeSingle()
  if (readError) throw readError

  const current = (existing?.settings || {}) as JsonSettings
  const next =
    action === 'pause' ? applyPause(current, new Date().toISOString()) : applyResume(current)

  const { error: upsertError } = await supabase
    .from('user_deck_settings')
    .upsert({ user_id: userId, deck_id: root.id, settings: next })
  if (upsertError) throw upsertError

  return { rootDeckId: root.id, deckName: root.name, paused: action === 'pause' }
}
