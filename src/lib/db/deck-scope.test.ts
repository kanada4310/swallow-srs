import { describe, it, expect } from 'vitest'
import { resolveDeckScopeFromDecks, noteMatchesFilterTags } from './deck-scope'

// deck-scope.ts が schema.ts (Dexie) を import するためモック
import { vi } from 'vitest'
vi.mock('./schema', () => ({ db: { decks: { toArray: () => Promise.resolve([]) } } }))

const decks = [
  { id: 'root', parent_deck_id: null, filter_tags: [] },
  { id: 'child-normal', parent_deck_id: 'root', filter_tags: [] },
  { id: 'grandchild', parent_deck_id: 'child-normal', filter_tags: [] },
  { id: 'child-filter', parent_deck_id: 'root', filter_tags: ['品詞:動詞'] },
  { id: 'other-root', parent_deck_id: null, filter_tags: [] },
]

describe('resolveDeckScopeFromDecks', () => {
  it('ルートデッキ: 自分＋全子孫・絞りなし', () => {
    const scope = resolveDeckScopeFromDecks('root', decks)
    expect(scope.isFilterDeck).toBe(false)
    expect(scope.rootDeckId).toBe('root')
    expect(scope.filterTags).toEqual([])
    expect(new Set(scope.allDeckIds)).toEqual(new Set(['root', 'child-normal', 'grandchild', 'child-filter']))
  })

  it('通常サブデッキ: 自分＋子孫のみ', () => {
    const scope = resolveDeckScopeFromDecks('child-normal', decks)
    expect(scope.isFilterDeck).toBe(false)
    expect(scope.rootDeckId).toBe('root')
    expect(new Set(scope.allDeckIds)).toEqual(new Set(['child-normal', 'grandchild']))
  })

  it('フィルタサブデッキ: ルートツリー全体＋タグ', () => {
    const scope = resolveDeckScopeFromDecks('child-filter', decks)
    expect(scope.isFilterDeck).toBe(true)
    expect(scope.rootDeckId).toBe('root')
    expect(scope.filterTags).toEqual(['品詞:動詞'])
    expect(new Set(scope.allDeckIds)).toEqual(new Set(['root', 'child-normal', 'grandchild', 'child-filter']))
  })

  it('filter_tags を持つルートデッキはフィルタデッキ扱いしない', () => {
    const withTaggedRoot = [
      { id: 'r2', parent_deck_id: null, filter_tags: ['x'] },
      { id: 'c2', parent_deck_id: 'r2', filter_tags: [] },
    ]
    const scope = resolveDeckScopeFromDecks('r2', withTaggedRoot)
    expect(scope.isFilterDeck).toBe(false)
    expect(scope.filterTags).toEqual([])
  })

  it('未知のデッキIDでも落ちない（自分のみ）', () => {
    const scope = resolveDeckScopeFromDecks('missing', decks)
    expect(scope.allDeckIds).toEqual(['missing'])
    expect(scope.isFilterDeck).toBe(false)
  })

  it('親の循環参照でも無限ループしない', () => {
    const cyclic = [
      { id: 'a', parent_deck_id: 'b', filter_tags: [] },
      { id: 'b', parent_deck_id: 'a', filter_tags: [] },
    ]
    const scope = resolveDeckScopeFromDecks('a', cyclic)
    expect(scope.allDeckIds.length).toBeGreaterThan(0)
  })
})

describe('noteMatchesFilterTags', () => {
  it('タグが1つでも一致すれば true（OR）', () => {
    expect(noteMatchesFilterTags(['品詞:動詞', 'イディオム'], ['品詞:動詞'])).toBe(true)
  })
  it('一致がなければ false', () => {
    expect(noteMatchesFilterTags(['品詞:名詞'], ['品詞:動詞'])).toBe(false)
  })
  it('ノートにタグが無ければ false', () => {
    expect(noteMatchesFilterTags([], ['品詞:動詞'])).toBe(false)
    expect(noteMatchesFilterTags(undefined, ['品詞:動詞'])).toBe(false)
  })
  it('filterTags が空なら常に true', () => {
    expect(noteMatchesFilterTags(undefined, [])).toBe(true)
    expect(noteMatchesFilterTags(['x'], [])).toBe(true)
  })
})
