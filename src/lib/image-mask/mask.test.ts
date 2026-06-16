import { describe, it, expect } from 'vitest'
import { resolveMaskCount, pickMaskIndices, buildMaskHtml, type MaskRegion } from './mask'

describe('resolveMaskCount', () => {
  it('returns 0 when no regions', () => {
    expect(resolveMaskCount(0)).toBe(0)
    expect(resolveMaskCount(0, 5)).toBe(0)
  })

  it('uses configured count, capped at total', () => {
    expect(resolveMaskCount(10, 3)).toBe(3)
    expect(resolveMaskCount(2, 5)).toBe(2)
    expect(resolveMaskCount(10, 1)).toBe(1)
  })

  it('floors fractional configured values', () => {
    expect(resolveMaskCount(10, 2.9)).toBe(2)
  })

  it('falls back to ~30% (min 1) when unconfigured or invalid', () => {
    expect(resolveMaskCount(10)).toBe(3) // round(3.0)
    expect(resolveMaskCount(10, null)).toBe(3)
    expect(resolveMaskCount(10, 0)).toBe(3) // 0 is invalid → default
    expect(resolveMaskCount(2)).toBe(1) // round(0.6)=1
    expect(resolveMaskCount(1)).toBe(1)
    expect(resolveMaskCount(10, -2)).toBe(3) // negative → default
  })
})

describe('pickMaskIndices', () => {
  it('returns empty for count 0 or empty total', () => {
    expect(pickMaskIndices(5, 0)).toEqual([])
    expect(pickMaskIndices(0, 3)).toEqual([])
  })

  it('returns distinct, sorted, in-range indices', () => {
    const seq = [0.99, 0.5, 0.0]
    let i = 0
    const rng = () => seq[i++ % seq.length]
    const out = pickMaskIndices(5, 3, rng)
    expect(out.length).toBe(3)
    expect(new Set(out).size).toBe(3)
    expect(out).toEqual([...out].sort((a, b) => a - b))
    out.forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(5)
    })
  })

  it('caps count at total and returns all indices', () => {
    const out = pickMaskIndices(3, 10)
    expect(out).toEqual([0, 1, 2])
  })

  it('is deterministic with a fixed rng', () => {
    const rng = () => 0 // always pick first remaining
    expect(pickMaskIndices(4, 2, rng)).toEqual([0, 1])
  })
})

describe('buildMaskHtml', () => {
  const regions: MaskRegion[] = [
    { id: 'a', x: 10, y: 20, w: 30, h: 15, answer: '細胞核' },
    { id: 'b', x: 50, y: 60, w: 20, h: 10, answer: 'Golgi & co' },
  ]

  it('returns empty string without image', () => {
    expect(buildMaskHtml('', regions, new Set(['a']), 'front')).toBe('')
  })

  it('front: opaque box only over masked regions', () => {
    const html = buildMaskHtml('https://x.com/i.png', regions, new Set(['a']), 'front')
    expect(html).toContain('<img src="https://x.com/i.png"')
    expect(html).toContain('left:10%')
    expect(html).toContain('?')
    // region b not masked → its coords should not appear as an overlay box
    expect(html).not.toContain('left:50%')
  })

  it('back: outlines masked regions and lists escaped answers below the image (no overlay text)', () => {
    const html = buildMaskHtml('https://x.com/i.png', regions, new Set(['b']), 'back')
    // 答えは画像下の番号付きリストに（重なり防止）
    expect(html).toContain('<ol')
    expect(html).toContain('<li')
    expect(html).toContain('Golgi &amp; co')
    expect(html).toContain('left:50%') // region b の枠
    expect(html).not.toContain('?')
  })

  it('back: numbers masked regions top-to-bottom and matches list order', () => {
    const rs = [
      { id: 'low', x: 10, y: 80, w: 10, h: 5, answer: 'B' },
      { id: 'high', x: 10, y: 10, w: 10, h: 5, answer: 'A' },
    ]
    const html = buildMaskHtml('https://x.com/i.png', rs, new Set(['low', 'high']), 'back')
    // 上にある high(A) が①、下の low(B) が②。リストは A→B の順
    expect(html.indexOf('>A<')).toBeLessThan(html.indexOf('>B<'))
    expect(html).toContain('>1</span>')
    expect(html).toContain('>2</span>')
  })

  it('escapes the image URL', () => {
    const html = buildMaskHtml('https://x.com/a"b.png', regions, new Set(), 'front')
    expect(html).toContain('a&quot;b.png')
  })
})
