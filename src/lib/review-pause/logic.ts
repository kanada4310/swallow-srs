/**
 * デッキ単位の「復習通知の停止」純ロジック。
 *
 * 停止の単位は「ルートデッキ × 生徒」。保存先は user_deck_settings.settings
 * （JSONB）の reviewPaused / reviewPausedAt キー。card_states には一切触れない
 * （停止＝通知集計から外すだけ。アプリ内での学習は妨げない）。
 *
 * 自動解除: 停止時刻より後にそのデッキ（配下含む）の review_logs が届いたら
 * 停止を解除する。判定はサーバー側（server.ts）が集計時に行う。
 */

export const REVIEW_PAUSED_KEY = 'reviewPaused'
export const REVIEW_PAUSED_AT_KEY = 'reviewPausedAt'

export type JsonSettings = Record<string, unknown>

export interface PauseState {
  paused: boolean
  pausedAt: string | null
}

/** settings JSONB から停止状態を読み取る */
export function readPauseState(settings: JsonSettings | null | undefined): PauseState {
  if (!settings) return { paused: false, pausedAt: null }
  const paused = settings[REVIEW_PAUSED_KEY] === true
  const rawAt = settings[REVIEW_PAUSED_AT_KEY]
  const pausedAt = typeof rawAt === 'string' && rawAt ? rawAt : null
  return { paused, pausedAt }
}

/** 停止フラグを立てた新しい settings を返す（他のキーは保持） */
export function applyPause(settings: JsonSettings | null | undefined, nowIso: string): JsonSettings {
  return {
    ...(settings || {}),
    [REVIEW_PAUSED_KEY]: true,
    [REVIEW_PAUSED_AT_KEY]: nowIso,
  }
}

/** 停止フラグを取り除いた新しい settings を返す（他のキーは保持） */
export function applyResume(settings: JsonSettings | null | undefined): JsonSettings {
  const next = { ...(settings || {}) }
  delete next[REVIEW_PAUSED_KEY]
  delete next[REVIEW_PAUSED_AT_KEY]
  return next
}

/**
 * 学習設定の保存（settings 丸ごと上書き）で停止フラグが消えないよう、
 * 既存 settings の停止キーを最優先で残したマージ結果を返す。
 * incoming に紛れ込んだ停止キー（GET の merged を編集画面が往復させた場合など）
 * は古い可能性があるため捨て、existing の値を採用する。
 */
export function mergePreservingPause(
  incoming: JsonSettings | null | undefined,
  existing: JsonSettings | null | undefined
): JsonSettings {
  const base = { ...(incoming || {}) }
  delete base[REVIEW_PAUSED_KEY]
  delete base[REVIEW_PAUSED_AT_KEY]
  const { paused, pausedAt } = readPauseState(existing)
  if (paused) {
    base[REVIEW_PAUSED_KEY] = true
    if (pausedAt) base[REVIEW_PAUSED_AT_KEY] = pausedAt
  }
  return base
}

/** settings が停止キーだけを残した「空」かどうか（DELETE 時の行温存判定用） */
export function extractPauseOnly(settings: JsonSettings | null | undefined): JsonSettings | null {
  const { paused, pausedAt } = readPauseState(settings)
  if (!paused) return null
  const kept: JsonSettings = { [REVIEW_PAUSED_KEY]: true }
  if (pausedAt) kept[REVIEW_PAUSED_AT_KEY] = pausedAt
  return kept
}

/**
 * デッキ一覧（id, parent_deck_id）から「任意のデッキID → ルートデッキID」の
 * 解決関数を作る。親が見つからない・循環がある場合は安全側でそのIDを返す。
 */
export function buildRootResolver(
  decks: Array<{ id: string; parent_deck_id: string | null }>
): (deckId: string) => string {
  const parentOf = new Map<string, string | null>()
  for (const d of decks) parentOf.set(d.id, d.parent_deck_id)

  const rootCache = new Map<string, string>()
  return (deckId: string): string => {
    const cached = rootCache.get(deckId)
    if (cached) return cached
    let current = deckId
    const seen = new Set<string>()
    while (true) {
      if (seen.has(current)) break // 循環ガード
      seen.add(current)
      const parent = parentOf.get(current)
      if (!parent) break // ルート到達 or 未知のデッキ
      current = parent
    }
    for (const id of Array.from(seen)) rootCache.set(id, current)
    return current
  }
}

/** ルートデッキID → 配下（自身含む）の全デッキID のマップを作る */
export function buildSubtreeMap(
  decks: Array<{ id: string; parent_deck_id: string | null }>
): Map<string, string[]> {
  const rootOf = buildRootResolver(decks)
  const subtree = new Map<string, string[]>()
  for (const d of decks) {
    const root = rootOf(d.id)
    const list = subtree.get(root) || []
    list.push(d.id)
    subtree.set(root, list)
  }
  return subtree
}

export interface DueGroup {
  dueCount: number
  /** 代表カード抽選用のサンプル（最大10枚） */
  sampleCardIds: string[]
}

/** 期限切れカード行（card_id, deck_id）をルートデッキ単位に集計する */
export function groupDueByRoot(
  rows: Array<{ card_id: string; deck_id: string }>,
  rootOf: (deckId: string) => string
): Map<string, DueGroup> {
  const groups = new Map<string, DueGroup>()
  for (const row of rows) {
    const root = rootOf(row.deck_id)
    let group = groups.get(root)
    if (!group) {
      group = { dueCount: 0, sampleCardIds: [] }
      groups.set(root, group)
    }
    group.dueCount++
    if (group.sampleCardIds.length < 10) {
      group.sampleCardIds.push(row.card_id)
    }
  }
  return groups
}
