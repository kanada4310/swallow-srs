import { describe, it, expect } from 'vitest'
import {
  readPauseState,
  applyPause,
  applyResume,
  mergePreservingPause,
  extractPauseOnly,
  buildRootResolver,
  buildSubtreeMap,
  groupDueByRoot,
} from './logic'

describe('readPauseState', () => {
  it('null/undefined/空オブジェクトは停止していない', () => {
    expect(readPauseState(null)).toEqual({ paused: false, pausedAt: null })
    expect(readPauseState(undefined)).toEqual({ paused: false, pausedAt: null })
    expect(readPauseState({})).toEqual({ paused: false, pausedAt: null })
  })

  it('reviewPaused=true と時刻を読み取れる', () => {
    expect(
      readPauseState({ reviewPaused: true, reviewPausedAt: '2026-08-19T00:00:00.000Z' })
    ).toEqual({ paused: true, pausedAt: '2026-08-19T00:00:00.000Z' })
  })

  it('true 以外の値（"true"・1）は停止扱いにしない', () => {
    expect(readPauseState({ reviewPaused: 'true' }).paused).toBe(false)
    expect(readPauseState({ reviewPaused: 1 }).paused).toBe(false)
  })
})

describe('applyPause / applyResume', () => {
  it('既存の学習設定キーを保持したまま停止フラグを立てる', () => {
    const next = applyPause({ new_cards_per_day: 5 }, '2026-08-19T00:00:00.000Z')
    expect(next).toEqual({
      new_cards_per_day: 5,
      reviewPaused: true,
      reviewPausedAt: '2026-08-19T00:00:00.000Z',
    })
  })

  it('applyResume は停止キーだけを取り除く', () => {
    const next = applyResume({
      new_cards_per_day: 5,
      reviewPaused: true,
      reviewPausedAt: '2026-08-19T00:00:00.000Z',
    })
    expect(next).toEqual({ new_cards_per_day: 5 })
  })

  it('元のオブジェクトを破壊しない', () => {
    const original = { reviewPaused: true }
    applyResume(original)
    expect(original.reviewPaused).toBe(true)
  })
})

describe('mergePreservingPause', () => {
  it('既存に停止フラグがあれば、上書き保存後も停止が残る', () => {
    const merged = mergePreservingPause(
      { new_cards_per_day: 10 },
      { reviewPaused: true, reviewPausedAt: '2026-08-01T00:00:00.000Z', tts_speed: 1.5 }
    )
    expect(merged).toEqual({
      new_cards_per_day: 10,
      reviewPaused: true,
      reviewPausedAt: '2026-08-01T00:00:00.000Z',
    })
  })

  it('既存が停止していなければ、incoming に紛れた古い停止キーを捨てる', () => {
    const merged = mergePreservingPause(
      { new_cards_per_day: 10, reviewPaused: true, reviewPausedAt: '2026-07-01T00:00:00.000Z' },
      { tts_speed: 1.5 }
    )
    expect(merged).toEqual({ new_cards_per_day: 10 })
  })

  it('既存が null でも動く', () => {
    expect(mergePreservingPause({ new_cards_per_day: 3 }, null)).toEqual({ new_cards_per_day: 3 })
  })
})

describe('extractPauseOnly', () => {
  it('停止中なら停止キーだけ残す', () => {
    expect(
      extractPauseOnly({ new_cards_per_day: 5, reviewPaused: true, reviewPausedAt: 'X' })
    ).toEqual({ reviewPaused: true, reviewPausedAt: 'X' })
  })

  it('停止していなければ null', () => {
    expect(extractPauseOnly({ new_cards_per_day: 5 })).toBeNull()
    expect(extractPauseOnly(null)).toBeNull()
  })
})

describe('buildRootResolver', () => {
  const decks = [
    { id: 'root', parent_deck_id: null },
    { id: 'child', parent_deck_id: 'root' },
    { id: 'grandchild', parent_deck_id: 'child' },
    { id: 'other-root', parent_deck_id: null },
  ]

  it('孫デッキもルートに解決する', () => {
    const rootOf = buildRootResolver(decks)
    expect(rootOf('grandchild')).toBe('root')
    expect(rootOf('child')).toBe('root')
    expect(rootOf('root')).toBe('root')
    expect(rootOf('other-root')).toBe('other-root')
  })

  it('未知のデッキIDはそのまま返す', () => {
    const rootOf = buildRootResolver(decks)
    expect(rootOf('unknown')).toBe('unknown')
  })

  it('循環があっても無限ループしない', () => {
    const rootOf = buildRootResolver([
      { id: 'a', parent_deck_id: 'b' },
      { id: 'b', parent_deck_id: 'a' },
    ])
    expect(typeof rootOf('a')).toBe('string')
  })
})

describe('buildSubtreeMap', () => {
  it('ルートごとに配下（自身含む）を列挙する', () => {
    const map = buildSubtreeMap([
      { id: 'root', parent_deck_id: null },
      { id: 'child', parent_deck_id: 'root' },
      { id: 'solo', parent_deck_id: null },
    ])
    expect(map.get('root')?.sort()).toEqual(['child', 'root'])
    expect(map.get('solo')).toEqual(['solo'])
  })
})

describe('groupDueByRoot', () => {
  it('サブデッキのカードもルートに合算する', () => {
    const rootOf = buildRootResolver([
      { id: 'root', parent_deck_id: null },
      { id: 'child', parent_deck_id: 'root' },
    ])
    const groups = groupDueByRoot(
      [
        { card_id: 'c1', deck_id: 'root' },
        { card_id: 'c2', deck_id: 'child' },
        { card_id: 'c3', deck_id: 'child' },
      ],
      rootOf
    )
    expect(groups.get('root')?.dueCount).toBe(3)
    expect(groups.get('root')?.sampleCardIds).toEqual(['c1', 'c2', 'c3'])
  })

  it('サンプルは最大10枚で頭打ち', () => {
    const rootOf = buildRootResolver([{ id: 'r', parent_deck_id: null }])
    const rows = Array.from({ length: 25 }, (_, i) => ({ card_id: `c${i}`, deck_id: 'r' }))
    const groups = groupDueByRoot(rows, rootOf)
    expect(groups.get('r')?.dueCount).toBe(25)
    expect(groups.get('r')?.sampleCardIds).toHaveLength(10)
  })
})
