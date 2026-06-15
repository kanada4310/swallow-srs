/**
 * Tests for the variety catalog (Phase 10.4 品種インプリント).
 */

import { describe, it, expect } from 'vitest'
import { VARIETIES, VARIETY_MAP, getVariety, pickVarietyByHash } from './varieties'

describe('variety catalog', () => {
  it('has unique ids and both tree and flower kinds', () => {
    const ids = VARIETIES.map((v) => v.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(VARIETIES.some((v) => v.kind === 'tree')).toBe(true)
    expect(VARIETIES.some((v) => v.kind === 'flower')).toBe(true)
  })

  it('VARIETY_MAP indexes every variety by id', () => {
    for (const v of VARIETIES) {
      expect(VARIETY_MAP[v.id]).toBe(v)
    }
  })

  describe('getVariety', () => {
    it('returns the variety for a known id', () => {
      expect(getVariety('apple')?.name).toBe('りんご')
    })
    it('returns undefined for null/undefined/unknown ids', () => {
      expect(getVariety(null)).toBeUndefined()
      expect(getVariety(undefined)).toBeUndefined()
      expect(getVariety('does-not-exist')).toBeUndefined()
    })
  })

  describe('pickVarietyByHash', () => {
    it('is deterministic for the same seed', () => {
      const a = pickVarietyByHash('note-123')
      const b = pickVarietyByHash('note-123')
      expect(a.id).toBe(b.id)
    })

    it('always returns a catalog variety', () => {
      for (const seed of ['', 'a', 'apple', 'note-xyz', '日本語シード']) {
        expect(VARIETIES).toContain(pickVarietyByHash(seed))
      }
    })

    it('distributes across more than one variety for varied seeds', () => {
      const picked = new Set(
        Array.from({ length: 50 }, (_, i) => pickVarietyByHash(`seed-${i}`).id)
      )
      expect(picked.size).toBeGreaterThan(1)
    })
  })
})
