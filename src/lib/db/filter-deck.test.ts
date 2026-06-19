/**
 * Tests for filter deck logic
 * - getRootDeckId: walks up parent chain to find root
 * - New card tag filtering in getStudyCardsOffline
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Dexie before importing
const mockDecks = new Map<string, { id: string; parent_deck_id: string | null; filter_tags: string[] }>()

vi.mock('dexie', () => {
  class MockDexie {
    version() {
      const versionObj = {
        stores: vi.fn(() => versionObj),
        upgrade: vi.fn(() => versionObj),
      }
      return versionObj
    }
    transaction = vi.fn(async (_mode: string, _tables: unknown[], fn: () => Promise<void>) => fn())
    decks = {
      get: vi.fn((id: string) => Promise.resolve(mockDecks.get(id) || undefined)),
      where: vi.fn(() => ({
        equals: vi.fn((parentId: string) => ({
          toArray: vi.fn(() => {
            const children = Array.from(mockDecks.values()).filter(d => d.parent_deck_id === parentId)
            return Promise.resolve(children)
          }),
        })),
        anyOf: vi.fn(() => ({
          toArray: vi.fn().mockResolvedValue([]),
          modify: vi.fn().mockResolvedValue(0),
        })),
      })),
      toCollection: vi.fn(() => ({
        modify: vi.fn().mockResolvedValue(0),
      })),
      toArray: vi.fn().mockResolvedValue([]),
      bulkPut: vi.fn(),
      put: vi.fn(),
    }
    profiles = { toCollection: vi.fn(() => ({ first: vi.fn() })) }
    noteTypes = { where: vi.fn(() => ({ anyOf: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })) })) }
    cardTemplates = { where: vi.fn(() => ({ anyOf: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })) })) }
    notes = { where: vi.fn(() => ({ anyOf: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })) })) }
    cards = { where: vi.fn(() => ({ anyOf: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })) })) }
    cardStates = {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          filter: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
          toArray: vi.fn().mockResolvedValue([]),
        })),
      })),
    }
    reviewLogs = {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          filter: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
        })),
      })),
    }
    syncQueue = { add: vi.fn(), where: vi.fn() }
    syncMetadata = { get: vi.fn(), put: vi.fn() }
    audioCache = { get: vi.fn(), put: vi.fn() }
    userDeckSettings = { get: vi.fn().mockResolvedValue(undefined) }
    classes = { toArray: vi.fn().mockResolvedValue([]) }
    classMembers = { toArray: vi.fn().mockResolvedValue([]) }
    deckAssignments = { toArray: vi.fn().mockResolvedValue([]) }
    open = vi.fn().mockResolvedValue(undefined)
  }

  return { default: MockDexie }
})

import { getRootDeckId, getDescendantDeckIds } from './schema'

describe('getRootDeckId', () => {
  beforeEach(() => {
    mockDecks.clear()
  })

  it('should return the same ID for a root deck (no parent)', async () => {
    mockDecks.set('deck-root', { id: 'deck-root', parent_deck_id: null, filter_tags: [] })

    const result = await getRootDeckId('deck-root')
    expect(result).toBe('deck-root')
  })

  it('should return root for a direct child', async () => {
    mockDecks.set('deck-root', { id: 'deck-root', parent_deck_id: null, filter_tags: [] })
    mockDecks.set('deck-child', { id: 'deck-child', parent_deck_id: 'deck-root', filter_tags: ['tag1'] })

    const result = await getRootDeckId('deck-child')
    expect(result).toBe('deck-root')
  })

  it('should return root for a deeply nested deck', async () => {
    mockDecks.set('deck-root', { id: 'deck-root', parent_deck_id: null, filter_tags: [] })
    mockDecks.set('deck-mid', { id: 'deck-mid', parent_deck_id: 'deck-root', filter_tags: [] })
    mockDecks.set('deck-leaf', { id: 'deck-leaf', parent_deck_id: 'deck-mid', filter_tags: ['tag1'] })

    const result = await getRootDeckId('deck-leaf')
    expect(result).toBe('deck-root')
  })

  it('should return the deck itself if not found in DB', async () => {
    const result = await getRootDeckId('nonexistent')
    expect(result).toBe('nonexistent')
  })
})

describe('getDescendantDeckIds', () => {
  beforeEach(() => {
    mockDecks.clear()
  })

  it('should return empty for a deck with no children', async () => {
    mockDecks.set('deck-root', { id: 'deck-root', parent_deck_id: null, filter_tags: [] })

    const result = await getDescendantDeckIds('deck-root')
    expect(result).toEqual([])
  })

  it('should return child IDs', async () => {
    mockDecks.set('deck-root', { id: 'deck-root', parent_deck_id: null, filter_tags: [] })
    mockDecks.set('deck-child1', { id: 'deck-child1', parent_deck_id: 'deck-root', filter_tags: ['tag1'] })
    mockDecks.set('deck-child2', { id: 'deck-child2', parent_deck_id: 'deck-root', filter_tags: ['tag2'] })

    const result = await getDescendantDeckIds('deck-root')
    expect(result).toContain('deck-child1')
    expect(result).toContain('deck-child2')
    expect(result).toHaveLength(2)
  })
})

describe('Filter deck tag matching', () => {
  // Test the pure filtering logic used in getStudyCardsOffline.
  // フィルタサブデッキでは新規・復習(due)カードの両方にこの同じロジックを適用する
  // （以前は新規のみだった）。これによりサブデッキ学習で親デッキの無関係な復習が出なくなる。
  const filterCardsByTags = (
    cards: Array<{ noteId: string }>,
    noteMap: Map<string, { tags?: string[] }>,
    filterTags: string[]
  ) => {
    if (filterTags.length === 0) return cards
    return cards.filter(card => {
      const note = noteMap.get(card.noteId)
      const noteTags = note?.tags || []
      return noteTags.some(t => filterTags.includes(t))
    })
  }

  it('should return all cards when no filter tags', () => {
    const cards = [{ noteId: 'n1' }, { noteId: 'n2' }]
    const noteMap = new Map([
      ['n1', { tags: ['tag1'] }],
      ['n2', { tags: ['tag2'] }],
    ])

    const result = filterCardsByTags(cards, noteMap, [])
    expect(result).toHaveLength(2)
  })

  it('should filter new cards by matching tags', () => {
    const cards = [{ noteId: 'n1' }, { noteId: 'n2' }, { noteId: 'n3' }]
    const noteMap = new Map([
      ['n1', { tags: ['SVO', 'verb'] }],
      ['n2', { tags: ['SVC'] }],
      ['n3', { tags: ['SVO', 'adjective'] }],
    ])

    const result = filterCardsByTags(cards, noteMap, ['SVO'])
    expect(result).toHaveLength(2)
    expect(result.map(c => c.noteId)).toEqual(['n1', 'n3'])
  })

  it('should filter review/due cards by the same tags (new behavior)', () => {
    // 復習カードもフィルタされることを明示的に固定する
    const dueCards = [{ noteId: 'n1' }, { noteId: 'n2' }, { noteId: 'n3' }]
    const noteMap = new Map([
      ['n1', { tags: ['SVO'] }],
      ['n2', { tags: ['SVC'] }],
      ['n3', { tags: ['SVO'] }],
    ])

    const result = filterCardsByTags(dueCards, noteMap, ['SVO'])
    expect(result.map(c => c.noteId)).toEqual(['n1', 'n3'])
  })

  it('should match any of the filter tags (OR logic)', () => {
    const cards = [{ noteId: 'n1' }, { noteId: 'n2' }, { noteId: 'n3' }]
    const noteMap = new Map([
      ['n1', { tags: ['SVO'] }],
      ['n2', { tags: ['SVC'] }],
      ['n3', { tags: ['SVOO'] }],
    ])

    const result = filterCardsByTags(cards, noteMap, ['SVO', 'SVC'])
    expect(result).toHaveLength(2)
    expect(result.map(c => c.noteId)).toEqual(['n1', 'n2'])
  })

  it('should exclude cards with no tags', () => {
    const cards = [{ noteId: 'n1' }, { noteId: 'n2' }]
    const noteMap = new Map([
      ['n1', { tags: ['tag1'] }],
      ['n2', { tags: [] }],
    ])

    const result = filterCardsByTags(cards, noteMap, ['tag1'])
    expect(result).toHaveLength(1)
    expect(result[0].noteId).toBe('n1')
  })

  it('should handle notes without tags property', () => {
    const cards = [{ noteId: 'n1' }, { noteId: 'n2' }]
    const noteMap = new Map([
      ['n1', { tags: ['tag1'] }],
      ['n2', {}],
    ])

    const result = filterCardsByTags(cards, noteMap, ['tag1'])
    expect(result).toHaveLength(1)
    expect(result[0].noteId).toBe('n1')
  })

  it('should return empty when no cards match filter', () => {
    const cards = [{ noteId: 'n1' }, { noteId: 'n2' }]
    const noteMap = new Map([
      ['n1', { tags: ['tag1'] }],
      ['n2', { tags: ['tag2'] }],
    ])

    const result = filterCardsByTags(cards, noteMap, ['nonexistent'])
    expect(result).toHaveLength(0)
  })
})
