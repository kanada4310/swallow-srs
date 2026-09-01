/**
 * 判別のしきい値（tuning）と、似た記号の見分け強化（項目2）の純関数のテスト。
 */

import { describe, expect, it } from 'vitest'
import { autoConfirmFloor, DEFAULT_TUNING, LEGACY_TUNING } from './tuning'
import { posRuleScores, roleRuleScores } from './letters'
import { ROLE_STROKE_SOURCES, POS_STROKE_SOURCES } from './templates'
import { classifyShape } from './shapes'
import { jitter, mulberry32, rand } from './synthetic-strokes'
import type { PenPoint, PenStroke } from './types'

describe('autoConfirmFloor（続け書きの自動確定の下限）', () => {
  it('形（band）は confirmMinShape・文字は confirmMinLetter を使う', () => {
    expect(autoConfirmFloor('band')).toBe(DEFAULT_TUNING.confirmMinShape)
    expect(autoConfirmFloor('above')).toBe(DEFAULT_TUNING.confirmMinLetter)
    expect(autoConfirmFloor('below')).toBe(DEFAULT_TUNING.confirmMinLetter)
  })

  it('着手前（LEGACY）は下限なし（0）＝以前の挙動を再現できる', () => {
    expect(autoConfirmFloor('band', LEGACY_TUNING)).toBe(0)
    expect(autoConfirmFloor('below', LEGACY_TUNING)).toBe(0)
  })
})

describe('roleRuleScores（働きの文字の幾何特徴）', () => {
  const src = (symbol: string): PenStroke[] =>
    ROLE_STROKE_SOURCES.find((s) => s.symbol === symbol)!.strokes

  it('S=前後半で膨らみが逆・▷=閉じて角あり・＋=直線の交差 を裏付ける', () => {
    const rng = mulberry32(41)
    const s = jitter(src('S'), rng, { size: 24, noise: 0.8, rotDeg: 3 })
    expect(roleRuleScores(s).S ?? 0).toBeGreaterThan(0.5)
    const tri = jitter(src('▷'), rng, { size: 24, noise: 0.8, rotDeg: 3 })
    expect(roleRuleScores(tri)['▷'] ?? 0).toBeGreaterThan(0.5)
    const plus = jitter(src('＋'), rng, { size: 24, noise: 0.8, rotDeg: 3 })
    expect(roleRuleScores(plus)['＋'] ?? 0).toBeGreaterThan(0.5)
  })

  it('Po=右下の小さな丸が違いの出る部分（P には裏付けを出さない）', () => {
    const rng = mulberry32(42)
    const po = jitter(src('Po'), rng, { size: 26, noise: 0.8, rotDeg: 3 })
    const scores = roleRuleScores(po)
    expect(scores.Po ?? 0).toBeGreaterThan(0.5)
    expect(scores.P ?? 0).toBe(0)
  })
})

describe('posRuleScores（品詞の文字の幾何特徴）', () => {
  const src = (symbol: string): PenStroke[] =>
    POS_STROKE_SOURCES.find((s) => s.symbol === symbol)!.strokes

  it('ad=3〜4画で横長・aux=5画以上（a との見分け）', () => {
    const rng = mulberry32(43)
    const ad = jitter(src('ad'), rng, { size: 28, noise: 0.8, rotDeg: 3 })
    expect(posRuleScores(ad).ad ?? 0).toBeGreaterThan(0.5)
    const aux = jitter(src('aux'), rng, { size: 30, noise: 0.8, rotDeg: 3 })
    expect(posRuleScores(aux).aux ?? 0).toBeGreaterThan(0.5)
    const a = jitter(src('a'), rng, { size: 24, noise: 0.8, rotDeg: 3 })
    const scores = posRuleScores(a)
    expect(scores.ad ?? 0).toBe(0)
    expect(scores.aux ?? 0).toBe(0)
  })
})

describe('波線の緩和（項目2・候補に挙がる前に弾かれる問題）', () => {
  /** 山が浅く2回しか反転しない波線（実機で拾えなかった書き方の模擬） */
  function shallowWavy(rng: () => number): PenStroke[] {
    const amp = rand(rng, 5, 8)
    const len = rand(rng, 60, 100)
    const pts: PenPoint[] = []
    for (let i = 0; i <= 30; i++) {
      const t = i / 30
      pts.push({ x: len * t, y: amp * Math.sin(t * 1.5 * 2 * Math.PI) })
    }
    return jitter([pts], rng, { size: len, rotDeg: 2, noise: 0.6 })
  }

  it('浅い波線でも候補に挙がる（着手前は挙がらないことがある）', () => {
    const rng = mulberry32(44)
    let hitNew = 0
    for (let i = 0; i < 20; i++) {
      const strokes = shallowWavy(rng)
      const r = classifyShape(strokes, null, DEFAULT_TUNING)
      if (r.best?.symbol === 'wavy' || r.candidates.some((c) => c.symbol === 'wavy')) hitNew++
    }
    expect(hitNew).toBeGreaterThanOrEqual(16)
  })
})
