/**
 * Tests for streak/heatmap derivation (Phase 10.5).
 * 4時区切り（getStudyDayStart）の境界も検証する。
 */

import { describe, it, expect } from 'vitest'
import { studyDayKey, levelFor, computeStreak, buildHeatmap } from './streak'

/** ローカル時刻で Date を作る（テストのタイムゾーン依存を避ける） */
function at(y: number, mo: number, d: number, h = 12, mi = 0): Date {
  return new Date(y, mo - 1, d, h, mi, 0, 0)
}

describe('studyDayKey', () => {
  it('uses calendar date for times at/after 4am', () => {
    expect(studyDayKey(at(2026, 6, 15, 4, 0))).toBe('2026-06-15')
    expect(studyDayKey(at(2026, 6, 15, 23, 59))).toBe('2026-06-15')
  })

  it('counts before-4am as the previous study day', () => {
    expect(studyDayKey(at(2026, 6, 15, 3, 59))).toBe('2026-06-14')
    expect(studyDayKey(at(2026, 6, 15, 0, 10))).toBe('2026-06-14')
  })
})

describe('levelFor', () => {
  it('maps counts to 0..4 buckets', () => {
    expect(levelFor(0)).toBe(0)
    expect(levelFor(5)).toBe(1)
    expect(levelFor(10)).toBe(2)
    expect(levelFor(45)).toBe(3)
    expect(levelFor(100)).toBe(4)
  })
})

describe('computeStreak', () => {
  it('returns 0/0 with no reviews', () => {
    expect(computeStreak([], at(2026, 6, 15))).toEqual({ current: 0, longest: 0 })
  })

  it('counts consecutive days up to today', () => {
    const reviews = [at(2026, 6, 13), at(2026, 6, 14), at(2026, 6, 15)]
    expect(computeStreak(reviews, at(2026, 6, 15, 20)).current).toBe(3)
  })

  it('does not break the streak when today has no reviews yet', () => {
    // 学習は昨日まで。今日（15日）はまだ。ストリークは継続中とみなす。
    const reviews = [at(2026, 6, 13), at(2026, 6, 14)]
    expect(computeStreak(reviews, at(2026, 6, 15, 10)).current).toBe(2)
  })

  it('breaks the streak after a missed day', () => {
    const reviews = [at(2026, 6, 10), at(2026, 6, 13), at(2026, 6, 14), at(2026, 6, 15)]
    expect(computeStreak(reviews, at(2026, 6, 15, 20)).current).toBe(3)
  })

  it('computes the longest run independent of current', () => {
    // 5連続(1-5) → 中断 → 2連続(8-9)
    const reviews = [
      at(2026, 6, 1), at(2026, 6, 2), at(2026, 6, 3), at(2026, 6, 4), at(2026, 6, 5),
      at(2026, 6, 8), at(2026, 6, 9),
    ]
    const { current, longest } = computeStreak(reviews, at(2026, 6, 15, 20))
    expect(longest).toBe(5)
    expect(current).toBe(0)
  })

  it('treats multiple reviews on the same day as one streak day', () => {
    const reviews = [at(2026, 6, 14, 10), at(2026, 6, 14, 11), at(2026, 6, 15, 9)]
    expect(computeStreak(reviews, at(2026, 6, 15, 20)).current).toBe(2)
  })

  it('respects the 4am boundary (a 2am review belongs to the previous day)', () => {
    // 6/15 02:00 の復習は学習日 6/14。6/16 中に確認すると current は0（6/15は未学習）。
    const reviews = [at(2026, 6, 15, 2, 0)]
    const { current } = computeStreak(reviews, at(2026, 6, 16, 12))
    expect(current).toBe(0)
  })
})

describe('buildHeatmap', () => {
  it('returns `weeks` columns of 7 days each, aligned Sun..Sat', () => {
    const grid = buildHeatmap([], 12, at(2026, 6, 15, 12))
    expect(grid).toHaveLength(12)
    for (const week of grid) {
      expect(week).toHaveLength(7)
      expect(week[0].date.getDay()).toBe(0) // Sunday
      expect(week[6].date.getDay()).toBe(6) // Saturday
    }
  })

  it('places review counts on the right study day', () => {
    const grid = buildHeatmap([at(2026, 6, 15, 9), at(2026, 6, 15, 10)], 4, at(2026, 6, 15, 12))
    const cell = grid.flat().find((c) => c.key === '2026-06-15')
    expect(cell?.count).toBe(2)
    expect(cell?.level).toBe(1)
  })

  it('marks days after today as future placeholders', () => {
    const grid = buildHeatmap([], 4, at(2026, 6, 15, 12))
    const flat = grid.flat()
    expect(flat.some((c) => c.future)).toBe(true)
    expect(flat.find((c) => c.key === '2026-06-15')?.future).toBe(false)
  })
})
