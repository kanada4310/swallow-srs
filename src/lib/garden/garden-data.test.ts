/**
 * Tests for getWitheredPlants (Phase 10.3 枯れ株一覧).
 * Dexie の db をモックして、全デッキ横断の枯れ株抽出・付与・並びを検証する。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

type Row = Record<string, unknown>

// In-memory tables backing the mocked Dexie db
let cardStatesData: Row[] = []
let cardsData: Row[] = []
let notesData: Row[] = []
let decksData: Row[] = []
let reviewLogsData: Row[] = []

/** Minimal Dexie query stub: .where(field).equals(v)|.anyOf(arr).toArray() */
function makeTable(getData: () => Row[]) {
  return {
    where: (field: string) => ({
      equals: (value: unknown) => ({
        toArray: async () => getData().filter((r) => r[field] === value),
      }),
      anyOf: (values: unknown[]) => ({
        toArray: async () => getData().filter((r) => values.includes(r[field])),
      }),
    }),
  }
}

vi.mock('@/lib/db/schema', () => ({
  db: {
    cardStates: makeTable(() => cardStatesData),
    cards: makeTable(() => cardsData),
    notes: makeTable(() => notesData),
    decks: makeTable(() => decksData),
    reviewLogs: makeTable(() => reviewLogsData),
  },
  getDescendantDeckIds: vi.fn().mockResolvedValue([]),
  getCreatureStatesMap: vi.fn().mockResolvedValue(new Map()),
}))

import { getWitheredPlants, getDailyMission } from './garden-data'

const NOW = new Date('2026-06-15T12:00:00Z')

/** due を「N日前」にした card_state を作るヘルパー（review 状態・FSRS） */
function makeState(
  cardId: string,
  overdueDays: number,
  interval = 10,
  extra: Record<string, unknown> = {}
) {
  return {
    id: `u1:${cardId}`,
    user_id: 'u1',
    card_id: cardId,
    state: 'review',
    interval,
    stability: interval,
    difficulty: 5,
    lapses: 0,
    due: new Date(NOW.getTime() - overdueDays * 86_400_000),
    ...extra,
  }
}

beforeEach(() => {
  cardStatesData = []
  cardsData = []
  notesData = []
  decksData = []
  reviewLogsData = []
  vi.clearAllMocks()
})

describe('getWitheredPlants', () => {
  it('returns empty array when the user has no card_states', async () => {
    expect(await getWitheredPlants('u1', NOW)).toEqual([])
  })

  it('keeps only withered plants (long-overdue) and drops healthy/mildly-overdue ones', async () => {
    // interval 10 → withered は overdue >= 40日（CARE_THRESHOLDS.dryingOut=4倍）
    cardStatesData = [
      makeState('healthy', 0), // 健やか
      makeState('thirsty', 3), // 乾き気味
      makeState('drying', 30), // 枯れかけ（3倍）
      makeState('dead', 60), // 枯れ（6倍）
    ]
    cardsData = [{ id: 'dead', note_id: 'n1', deck_id: 'd1' }]
    notesData = [{ id: 'n1', field_values: { 見出し語: 'wither' } }]
    decksData = [{ id: 'd1', name: '英単語' }]

    const result = await getWitheredPlants('u1', NOW)
    expect(result).toHaveLength(1)
    expect(result[0].cardId).toBe('dead')
    expect(result[0].deckId).toBe('d1')
    expect(result[0].deckName).toBe('英単語')
    expect(result[0].label).toBe('wither')
    expect(result[0].plant.isDead).toBe(true)
  })

  it('sorts withered plants by overdueDays descending (most neglected first)', async () => {
    cardStatesData = [makeState('a', 50), makeState('b', 200), makeState('c', 90)]
    cardsData = [
      { id: 'a', note_id: 'na', deck_id: 'd1' },
      { id: 'b', note_id: 'nb', deck_id: 'd1' },
      { id: 'c', note_id: 'nc', deck_id: 'd1' },
    ]
    notesData = [
      { id: 'na', field_values: { 見出し語: 'a' } },
      { id: 'nb', field_values: { 見出し語: 'b' } },
      { id: 'nc', field_values: { 見出し語: 'c' } },
    ]
    decksData = [{ id: 'd1', name: 'D' }]

    const result = await getWitheredPlants('u1', NOW)
    expect(result.map((p) => p.cardId)).toEqual(['b', 'c', 'a'])
  })

  it('spans multiple decks and falls back to a default deck name when missing', async () => {
    cardStatesData = [makeState('a', 80), makeState('b', 80)]
    cardsData = [
      { id: 'a', note_id: 'na', deck_id: 'd1' },
      { id: 'b', note_id: 'nb', deck_id: 'd2' }, // d2 は decksData に無い
    ]
    notesData = [
      { id: 'na', field_values: { 見出し語: 'a' } },
      { id: 'nb', field_values: {} }, // 名札なし
    ]
    decksData = [{ id: 'd1', name: 'デッキ1' }]

    const result = await getWitheredPlants('u1', NOW)
    const byCard = Object.fromEntries(result.map((p) => [p.cardId, p]))
    expect(byCard.a.deckName).toBe('デッキ1')
    expect(byCard.b.deckName).toBe('デッキ')
    expect(byCard.b.label).toBe('')
  })

  it('excludes a withered state whose card body is not synced locally', async () => {
    cardStatesData = [makeState('orphan', 90)]
    cardsData = [] // 対応する card が無い
    const result = await getWitheredPlants('u1', NOW)
    expect(result).toEqual([])
  })
})

/** reviewLog を作る（reviewed_at は NOW からの相対日数） */
function makeLog(cardId: string, daysAgo: number): Row {
  return {
    user_id: 'u1',
    card_id: cardId,
    reviewed_at: new Date(NOW.getTime() - daysAgo * 86_400_000),
  }
}

describe('getDailyMission', () => {
  it('returns an empty goal when there is nothing to do today', async () => {
    const m = await getDailyMission('u1', NOW)
    expect(m).toEqual({ wateredToday: 0, dueNow: 0, goal: 0, done: false })
  })

  it('counts due plants and distinct cards watered today', async () => {
    cardStatesData = [makeState('a', 5), makeState('b', 5)] // 2株が要水やり
    reviewLogsData = [
      makeLog('x', 0), // 今日
      makeLog('x', 0), // 同じカード（distinct で1）
      makeLog('y', 0), // 今日・別カード
      makeLog('z', 3), // 3日前（今日ではない）
    ]
    const m = await getDailyMission('u1', NOW)
    expect(m.dueNow).toBe(2)
    expect(m.wateredToday).toBe(2) // x, y（z は対象外）
    expect(m.goal).toBe(4)
    expect(m.done).toBe(false)
  })

  it('marks the mission done when nothing is due but there was activity today', async () => {
    cardStatesData = [makeState('a', -1)] // due は未来 → 要水やりではない
    reviewLogsData = [makeLog('a', 0)]
    const m = await getDailyMission('u1', NOW)
    expect(m.dueNow).toBe(0)
    expect(m.wateredToday).toBe(1)
    expect(m.goal).toBe(1)
    expect(m.done).toBe(true)
  })
})
