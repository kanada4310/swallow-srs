/**
 * 実書き蓄積の純ロジックのテスト（検査・圧縮・間引き・合成）。
 */

import { describe, expect, it } from 'vitest'
import type { PenStroke } from './types'
import {
  ACCUMULATABLE_SYMBOLS,
  DEDUP_DISTANCE,
  isAccumulatable,
  mergeStores,
  PERSONAL_CAP,
  planAddition,
  rowsToStore,
  sanitizeSampleStrokes,
} from './sample-store'
import { cloudDistance, toCloud } from './pdollar'
import { drawShape, jitter, mulberry32 } from './synthetic-strokes'

describe('sanitizeSampleStrokes（検査と圧縮）', () => {
  it('正しい線は通り、座標が丸められ・時刻が落ちる', () => {
    const strokes: PenStroke[] = [
      [
        { x: 10.123, y: 20.987, t: 1234 },
        { x: 30.5, y: 40.5, t: 1250 },
      ],
    ]
    const out = sanitizeSampleStrokes(strokes)
    expect(out).not.toBeNull()
    expect(out![0][0]).toEqual({ x: 10.1, y: 21 })
    expect('t' in out![0][0]).toBe(false)
  })

  it('長い線は等間隔32点に間引かれ、点群の形はほぼ変わらない', () => {
    const rng = mulberry32(1)
    const strokes = drawShape('brace-close', rng).map((s) => {
      // 200点に増やした長い線を模す
      const dense: PenStroke = []
      for (let i = 0; i < s.length - 1; i++) {
        for (let k = 0; k < 8; k++) {
          const t = k / 8
          dense.push({
            x: s[i].x + (s[i + 1].x - s[i].x) * t,
            y: s[i].y + (s[i + 1].y - s[i].y) * t,
          })
        }
      }
      dense.push(s[s.length - 1])
      return dense
    })
    const out = sanitizeSampleStrokes(strokes)
    expect(out).not.toBeNull()
    expect(out![0].length).toBeLessThanOrEqual(48)
    // 形を保つ間引きなので、圧縮の前後で点群距離がほぼゼロ＝照合への影響なし
    // （等間隔の打ち直しだと標本の位相ずれで 0.2〜0.3 の下駄が付く。上の実装コメント参照）
    expect(cloudDistance(toCloud(strokes), toCloud(out!))).toBeLessThan(0.08)
  })

  it('不正な形（空・数値でない・大きすぎる座標・画数過多）は弾く', () => {
    expect(sanitizeSampleStrokes([])).toBeNull()
    expect(sanitizeSampleStrokes([[{ x: 'a', y: 0 }]])).toBeNull()
    expect(sanitizeSampleStrokes([[{ x: 1e9, y: 0 }]])).toBeNull()
    expect(sanitizeSampleStrokes([[{ x: Number.NaN, y: 0 }]])).toBeNull()
    expect(sanitizeSampleStrokes('x')).toBeNull()
    const tooMany = Array.from({ length: 13 }, () => [{ x: 0, y: 0 }, { x: 1, y: 1 }])
    expect(sanitizeSampleStrokes(tooMany)).toBeNull()
  })
})

describe('planAddition（間引きと上限）', () => {
  const rng = mulberry32(2)
  const base = drawShape('paren-open', rng)

  it('ほぼ同じ線は足さない（skip）', () => {
    const nearly = base.map((s) => s.map((p) => ({ x: p.x + 0.2, y: p.y - 0.2 })))
    expect(planAddition([base], nearly, PERSONAL_CAP)).toEqual({ action: 'skip' })
  })

  it('形の違う線は足し、上限を超えたら古いものから消す', () => {
    const different = drawShape('square-open', rng)
    const plan = planAddition([base], different, PERSONAL_CAP)
    expect(plan).toEqual({ action: 'add', removeOldest: 0 })
    const full = Array.from({ length: PERSONAL_CAP }, (_, i) =>
      jitter(drawShape('paren-open', mulberry32(100 + i)), mulberry32(200 + i), { size: 40 }),
    )
    const plan2 = planAddition(full, different, PERSONAL_CAP)
    expect(plan2).toEqual({ action: 'add', removeOldest: 1 })
  })

  it('間引きのしきい値: 同じ記号の別の書き方（揺れ）は足せる', () => {
    // 種の違う生成は十分離れている＝DEDUP_DISTANCE より遠い
    const a = drawShape('angle-close', mulberry32(11))
    const b = drawShape('angle-close', mulberry32(12))
    expect(cloudDistance(toCloud(a), toCloud(b))).toBeGreaterThan(DEDUP_DISTANCE)
  })
})

describe('mergeStores / rowsToStore（合成とDB行の変換）', () => {
  it('共通・本人・端末内を1つにまとめる', () => {
    const s1 = { S: [[[{ x: 0, y: 0 }, { x: 1, y: 1 }]]] } as never
    const s2 = { S: [[[{ x: 2, y: 2 }, { x: 3, y: 3 }]]], V: [[[{ x: 4, y: 4 }, { x: 5, y: 5 }]]] } as never
    const merged = mergeStores(s1, s2, null)
    expect(merged['S']?.length).toBe(2)
    expect(merged['V']?.length).toBe(1)
  })

  it('DB行のうち台帳外の記号・壊れた線は捨てる', () => {
    const good = [[{ x: 0, y: 0 }, { x: 5, y: 5 }]]
    const store = rowsToStore([
      { symbol: 'S', strokes: good },
      { symbol: 'circle', strokes: good }, // 台帳外（蓄積対象外）
      { symbol: 'S', strokes: 'broken' },
    ])
    expect(store['S']?.length).toBe(1)
    expect(store['circle']).toBeUndefined()
  })

  it('蓄積対象は台帳の実書き記号だけ', () => {
    expect(isAccumulatable('S')).toBe(true)
    expect(isAccumulatable('paren-open')).toBe(true)
    expect(isAccumulatable('circle')).toBe(false)
    expect(isAccumulatable('同')).toBe(false)
    expect(ACCUMULATABLE_SYMBOLS.length).toBeGreaterThan(20)
  })
})

describe('蓄積がたまると判別が本人の字に寄る（結合の確認）', () => {
  it('癖のある閉じ括弧: 別の回に書いた同じ癖の線が蓄積にあると一発で当たる', async () => {
    const { classifyShape } = await import('./shapes')
    const { quirkClose } = await import('./synthetic-strokes')
    // 蓄積（お手本）と評価は別の種＝出どころを分ける
    const enrollRng = mulberry32(31)
    const store = {
      'angle-close': [quirkClose('angle-close', enrollRng), quirkClose('angle-close', enrollRng)],
      'square-close': [quirkClose('square-close', enrollRng), quirkClose('square-close', enrollRng)],
      'brace-close': [quirkClose('brace-close', enrollRng), quirkClose('brace-close', enrollRng)],
      'paren-close': [drawShape('paren-close', enrollRng), drawShape('paren-close', enrollRng)],
    }
    const evalRng = mulberry32(32)
    let okWith = 0
    let okWithout = 0
    let containWith = 0
    for (let i = 0; i < 20; i++) {
      const strokes = quirkClose('square-close', evalRng)
      const withStore = classifyShape(strokes, store)
      if (withStore.best?.symbol === 'square-close') okWith++
      if (
        withStore.best?.symbol === 'square-close' ||
        withStore.candidates.some((c) => c.symbol === 'square-close')
      ) {
        containWith++
      }
      if (classifyShape(strokes, null).best?.symbol === 'square-close') okWithout++
    }
    // 蓄積があれば最有力が悪化せず、候補（上位3）にはほぼ必ず正解が入る
    expect(okWith).toBeGreaterThanOrEqual(okWithout)
    expect(containWith).toBeGreaterThan(15)
  })
})
