/**
 * Tests for achievement evaluation (Phase 10.5).
 */

import { describe, it, expect } from 'vitest'
import { ACHIEVEMENTS, evaluateAchievements, countEarned, type AchievementInput } from './achievements'

const ZERO: AchievementInput = {
  totalReviews: 0,
  streakLongest: 0,
  bloomingCount: 0,
  totalPlants: 0,
  varietyCount: 0,
}

describe('achievements catalog', () => {
  it('has unique ids', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('evaluateAchievements', () => {
  it('earns nothing with zero input', () => {
    const result = evaluateAchievements(ZERO)
    expect(result.every((a) => !a.earned)).toBe(true)
    expect(result.every((a) => a.value === 0)).toBe(true)
  })

  it('earns a badge when the metric reaches its target', () => {
    const result = evaluateAchievements({ ...ZERO, bloomingCount: 1 })
    const firstBloom = result.find((a) => a.id === 'firstBloom')!
    expect(firstBloom.earned).toBe(true)
    expect(firstBloom.value).toBe(1)
  })

  it('caps value at target but reports earned past it', () => {
    const result = evaluateAchievements({ ...ZERO, totalReviews: 5000 })
    const r100 = result.find((a) => a.id === 'reviews100')!
    const r1000 = result.find((a) => a.id === 'reviews1000')!
    expect(r100.earned).toBe(true)
    expect(r100.value).toBe(100) // capped
    expect(r1000.earned).toBe(true)
    expect(r1000.value).toBe(1000)
  })

  it('uses streakLongest for streak badges (tiered)', () => {
    const result = evaluateAchievements({ ...ZERO, streakLongest: 7 })
    expect(result.find((a) => a.id === 'streak3')!.earned).toBe(true)
    expect(result.find((a) => a.id === 'streak7')!.earned).toBe(true)
    expect(result.find((a) => a.id === 'streak30')!.earned).toBe(false)
  })

  it('shows partial progress below target', () => {
    const result = evaluateAchievements({ ...ZERO, totalPlants: 40 })
    const p = result.find((a) => a.id === 'plants100')!
    expect(p.earned).toBe(false)
    expect(p.value).toBe(40)
  })
})

describe('countEarned', () => {
  it('counts earned vs total', () => {
    const result = evaluateAchievements({ ...ZERO, bloomingCount: 1, streakLongest: 3 })
    const { earned, total } = countEarned(result)
    expect(total).toBe(ACHIEVEMENTS.length)
    expect(earned).toBe(2) // firstBloom + streak3
  })
})
