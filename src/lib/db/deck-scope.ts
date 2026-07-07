import { db } from './schema'

/**
 * デッキの「表示・集計スコープ」を解決する。
 *
 * フィルタサブデッキ（filter_tags あり・非ルート）はノート実体を持たず、
 * 親（ルート）ツリーのノートをタグで絞ったものが中身。
 * getStudyCardsOffline / getDecksWithStatsOffline と同じ解決規則を
 * デッキ詳細・単語帳でも使えるように切り出したもの。
 */
export interface DeckScope {
  /** ノート・カードを読むべきデッキID群（自分を含む） */
  allDeckIds: string[]
  /** ノートをタグで絞る場合のタグ（空配列なら絞りなし） */
  filterTags: string[]
  /** フィルタサブデッキか（実体は親ツリーにある） */
  isFilterDeck: boolean
  /** ルートデッキID */
  rootDeckId: string
}

export interface DeckScopeInput {
  id: string
  parent_deck_id?: string | null
  filter_tags?: string[] | null
}

/**
 * 純ロジック版: 全デッキ行からスコープを解決する（テスト対象）。
 */
export function resolveDeckScopeFromDecks(deckId: string, decks: DeckScopeInput[]): DeckScope {
  const deckMap = new Map(decks.map(d => [d.id, d]))
  const deck = deckMap.get(deckId)

  // ルートまで遡る（循環防止に訪問済み集合）
  let rootDeckId = deckId
  const visited = new Set<string>()
  while (true) {
    if (visited.has(rootDeckId)) break
    visited.add(rootDeckId)
    const current = deckMap.get(rootDeckId)
    if (!current || !current.parent_deck_id) break
    rootDeckId = current.parent_deck_id
  }
  const isRootDeck = rootDeckId === deckId

  const filterTags = deck?.filter_tags || []
  const isFilterDeck = filterTags.length > 0 && !isRootDeck

  const collectDescendants = (id: string): string[] => {
    const result: string[] = []
    const seen = new Set<string>([id])
    const queue = [id]
    while (queue.length > 0) {
      const currentId = queue.shift()!
      for (const d of decks) {
        if (d.parent_deck_id === currentId && !seen.has(d.id)) {
          seen.add(d.id)
          result.push(d.id)
          queue.push(d.id)
        }
      }
    }
    return result
  }

  const allDeckIds = isFilterDeck
    ? [rootDeckId, ...collectDescendants(rootDeckId)] // フィルタデッキ: ルートツリー全体からタグで絞る
    : [deckId, ...collectDescendants(deckId)] // 通常デッキ: 自分＋子孫

  return { allDeckIds, filterTags: isFilterDeck ? filterTags : [], isFilterDeck, rootDeckId }
}

/** Dexie 版: IndexedDB の decks 全件からスコープを解決する */
export async function resolveDeckScope(deckId: string): Promise<DeckScope> {
  const decks = await db.decks.toArray()
  return resolveDeckScopeFromDecks(deckId, decks)
}

/**
 * ノートのタグがフィルタタグのいずれかに一致するか（OR）。
 * filterTags が空なら常に true（絞りなし）。
 */
export function noteMatchesFilterTags(noteTags: string[] | undefined, filterTags: string[]): boolean {
  if (filterTags.length === 0) return true
  return (noteTags || []).some(t => filterTags.includes(t))
}
