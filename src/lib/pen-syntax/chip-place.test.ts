import { describe, expect, it } from 'vitest'
import { placeChipBox, type ChipPlaceInput } from './chip-place'

/** 本文の行が y=100〜130 にある枠（幅400・高さ300） */
const base: ChipPlaceInput = {
  stroke: { left: 150, right: 180, top: 135, bottom: 160 },
  row: { top: 100, bottom: 130 },
  lane: 'below',
  container: { width: 400, height: 300 },
  chip: { width: 220, height: 60 },
}

function overlaps(
  p: { left: number; top: number },
  chip: { width: number; height: number },
  r: { left: number; right: number; top: number; bottom: number },
): boolean {
  return (
    p.left < r.right && p.left + chip.width > r.left && p.top < r.bottom && p.top + chip.height > r.top
  )
}

describe('候補の枠の置き場所', () => {
  it('働きの段に書いたら行より上に出る（書いた線にも本文にも重ならない）', () => {
    const p = placeChipBox(base)
    expect(p.top + base.chip.height).toBeLessThanOrEqual(base.row!.top)
    expect(overlaps(p, base.chip, base.stroke)).toBe(false)
  })

  it('品詞の段に書いたら行より下に出る', () => {
    const input: ChipPlaceInput = {
      ...base,
      lane: 'above',
      stroke: { left: 150, right: 180, top: 70, bottom: 95 },
    }
    const p = placeChipBox(input)
    expect(p.top).toBeGreaterThanOrEqual(input.row!.bottom)
    expect(overlaps(p, input.chip, input.stroke)).toBe(false)
  })

  it('上に入らなければ下へ折り返す（一番上の行の働きの段）', () => {
    const input: ChipPlaceInput = {
      ...base,
      row: { top: 10, bottom: 40 },
      stroke: { left: 150, right: 180, top: 42, bottom: 60 },
    }
    const p = placeChipBox(input)
    expect(p.top).toBeGreaterThanOrEqual(60)
    expect(p.top + input.chip.height).toBeLessThanOrEqual(input.container.height)
  })

  it('下に入らなければ上へ折り返す（一番下の行の品詞の段）', () => {
    const input: ChipPlaceInput = {
      ...base,
      lane: 'above',
      row: { top: 250, bottom: 280 },
      stroke: { left: 150, right: 180, top: 225, bottom: 245 },
    }
    const p = placeChipBox(input)
    expect(p.top).toBeGreaterThanOrEqual(0)
    expect(p.top + input.chip.height).toBeLessThanOrEqual(225)
  })

  it('右端・左端で書いても枠からはみ出さない', () => {
    const right = placeChipBox({ ...base, stroke: { left: 380, right: 398, top: 135, bottom: 160 } })
    expect(right.left).toBeGreaterThanOrEqual(0)
    expect(right.left + base.chip.width).toBeLessThanOrEqual(base.container.width)
    const left = placeChipBox({ ...base, stroke: { left: 2, right: 20, top: 135, bottom: 160 } })
    expect(left.left).toBeGreaterThanOrEqual(0)
  })

  it('枠より候補が広い狭い画面では左端に寄せる', () => {
    const p = placeChipBox({
      ...base,
      container: { width: 180, height: 300 },
      chip: { width: 220, height: 60 },
    })
    expect(p.left).toBe(0)
  })

  it('枠に余白が無いとき（1行だけの短い文）は、枠の外（下）へはみ出させる', () => {
    // 書いた場所や本文を隠すくらいなら、枠からはみ出して見せるほうがよい
    const input: ChipPlaceInput = {
      ...base,
      lane: 'above',
      container: { width: 400, height: 129 },
      row: { top: 45, bottom: 80 },
      stroke: { left: 150, right: 180, top: 21, bottom: 34 },
      chip: { width: 220, height: 69 },
    }
    const p = placeChipBox(input)
    expect(p.top).toBeGreaterThanOrEqual(input.row!.bottom)
    expect(p.top + input.chip.height).toBeGreaterThan(input.container.height)
  })

  it('行が分からないときは書いた線だけを避ける', () => {
    const p = placeChipBox({ ...base, row: null })
    expect(p.top + base.chip.height).toBeLessThanOrEqual(base.stroke.top)
  })
})
