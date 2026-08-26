/**
 * 判別率・吸着精度の機械計測（作業指示書の「二車線の計測」の自動化部分）。
 *
 * 手書きの揺れを乱数で模した線（大きさ・傾き・歪み・点のばらつきを変えたもの）を
 * 記号ごとに何十本も生成し、判別器に通して数える。乱数は種を固定してあり毎回同じ結果になる。
 *
 * ※ これは「機械生成の線」に対する実測であり、実機のペンで書いた線の実測は
 *    /reading/syntax/pen-lab ページで人の手により行う（完了報告に区別して記載）。
 */

import { describe, expect, it } from 'vitest'
import type { PenPoint, PenStroke, ShapeKind, SymbolId, TokenBox } from './types'
import { classifyShape } from './shapes'
import { classifyPosLetter, classifyRoleLetter } from './letters'
import { POS_STROKE_SOURCES, ROLE_STROKE_SOURCES } from './templates'
import { snapCloseBracket, snapHorizontalRange, snapNearestToken, snapOpenBracket } from './snap'
import { strokesBBox, resample } from './geometry'

/* ---------- 種固定の乱数 ---------- */
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
type Rng = () => number
const rand = (rng: Rng, lo: number, hi: number) => lo + rng() * (hi - lo)
const gauss = (rng: Rng, sigma: number) => {
  // Box-Muller
  const u = Math.max(rng(), 1e-9)
  const v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * sigma
}

/* ---------- 手書きの揺れの模擬 ---------- */

/** 回転・伸縮・平行移動・点ノイズを加える。size は外接箱の長辺（px 相当） */
function jitter(strokes: PenStroke[], rng: Rng, opts: { size: number; noise?: number; rotDeg?: number }): PenStroke[] {
  const b = strokesBBox(strokes)
  const base = Math.max(b.width, b.height) || 1
  const scale = (opts.size / base) * rand(rng, 0.85, 1.15)
  const sx = scale * rand(rng, 0.85, 1.15)
  const sy = scale * rand(rng, 0.85, 1.15)
  const rot = ((opts.rotDeg ?? 6) * (rng() * 2 - 1) * Math.PI) / 180
  const cos = Math.cos(rot)
  const sin = Math.sin(rot)
  const noise = opts.noise ?? opts.size * 0.03
  const dx = rand(rng, -5, 5)
  const dy = rand(rng, -5, 5)
  return strokes.map((stroke) =>
    resample(stroke, Math.max(8, Math.min(40, stroke.length * 4))).map((p) => {
      const x0 = (p.x - b.cx) * sx
      const y0 = (p.y - b.cy) * sy
      return {
        x: x0 * cos - y0 * sin + dx + gauss(rng, noise),
        y: x0 * sin + y0 * cos + dy + gauss(rng, noise),
      }
    }),
  )
}

function line(...pts: Array<[number, number]>): PenStroke {
  return pts.map(([x, y]) => ({ x, y }))
}

function arcPts(cx: number, cy: number, r: number, deg0: number, deg1: number, steps = 24): PenStroke {
  const out: PenPoint[] = []
  for (let i = 0; i <= steps; i++) {
    const a = ((deg0 + ((deg1 - deg0) * i) / steps) * Math.PI) / 180
    out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) })
  }
  return out
}

/** 形の記号を、お手本の写しではなくパラメータからその都度描く（より厳しい条件） */
function drawShape(kind: ShapeKind, rng: Rng): PenStroke[] {
  switch (kind) {
    case 'paren-open': {
      const r = rand(rng, 18, 32)
      const a0 = rand(rng, 100, 125)
      const a1 = rand(rng, 235, 260)
      return [jitter([arcPts(0, 0, r, a0, a1)], rng, { size: rand(rng, 34, 58), rotDeg: 5 })[0]]
    }
    case 'paren-close': {
      const r = rand(rng, 18, 32)
      const a0 = rand(rng, -80, -55)
      const a1 = rand(rng, 55, 80)
      return [jitter([arcPts(0, 0, r, a0, a1)], rng, { size: rand(rng, 34, 58), rotDeg: 5 })[0]]
    }
    case 'square-open': {
      const d = rand(rng, 10, 20)
      const h = rand(rng, 40, 70)
      return jitter([line([d, 0], [0, 0], [0, h], [d, h])], rng, { size: rand(rng, 36, 60), rotDeg: 4 })
    }
    case 'square-close': {
      const d = rand(rng, 10, 20)
      const h = rand(rng, 40, 70)
      return jitter([line([0, 0], [d, 0], [d, h], [0, h])], rng, { size: rand(rng, 36, 60), rotDeg: 4 })
    }
    case 'angle-open': {
      const d = rand(rng, 16, 30)
      const h = rand(rng, 36, 60)
      return jitter([line([d, 0], [0, h / 2], [d, h])], rng, { size: rand(rng, 34, 56), rotDeg: 5 })
    }
    case 'angle-close': {
      const d = rand(rng, 16, 30)
      const h = rand(rng, 36, 60)
      return jitter([line([0, 0], [d, h / 2], [0, h])], rng, { size: rand(rng, 34, 56), rotDeg: 5 })
    }
    case 'brace-open': {
      const w = rand(rng, 10, 16)
      return jitter(
        [
          line(
            [w * 2, 0], [w, 4], [w * 0.8, 22], [w * 0.8, 40], [0, 47], [w * 0.8, 54], [w * 0.8, 72],
            [w, 90], [w * 2, 94],
          ),
        ],
        rng,
        { size: rand(rng, 40, 62), rotDeg: 3 },
      )
    }
    case 'brace-close': {
      const w = rand(rng, 10, 16)
      return jitter(
        [
          line(
            [0, 0], [w, 4], [w * 1.2, 22], [w * 1.2, 40], [w * 2, 47], [w * 1.2, 54], [w * 1.2, 72],
            [w, 90], [0, 94],
          ),
        ],
        rng,
        { size: rand(rng, 40, 62), rotDeg: 3 },
      )
    }
    case 'hline':
      return jitter([line([0, 0], [100, rand(rng, -4, 4)])], rng, { size: rand(rng, 50, 140), rotDeg: 3 })
    case 'circle': {
      const start = rand(rng, 0, 360)
      const span = rand(rng, 330, 360)
      return jitter([arcPts(0, 0, 30, start, start + span)], rng, { size: rand(rng, 26, 48), rotDeg: 8 })
    }
    case 'wavy': {
      const periods = Math.round(rand(rng, 3, 4))
      const amp = rand(rng, 6, 12)
      const len = rand(rng, 70, 130)
      const pts: PenPoint[] = []
      for (let i = 0; i <= 40; i++) {
        const x = (len * i) / 40
        pts.push({ x, y: amp * Math.sin((i / 40) * periods * 2 * Math.PI) })
      }
      return jitter([pts], rng, { size: len, rotDeg: 3 })
    }
    case 'question': {
      const withDot = rng() > 0.5
      const hook = [...arcPts(0, 0, 14, 180, 380, 12), ...line([13, 5], [2, 20], [0, 30])]
      const strokes: PenStroke[] = withDot ? [hook, line([0, 42], [0.5, 45])] : [hook]
      return jitter(strokes, rng, { size: rand(rng, 28, 44), rotDeg: 5 })
    }
    case 'tick':
      return jitter([line([10, 0], [0, 18])], rng, { size: rand(rng, 10, 22), rotDeg: 8 })
    case 'slash':
      return jitter([line([40, 0], [0, 60])], rng, { size: rand(rng, 40, 70), rotDeg: 6 })
    case 'null-sign': {
      const r = rand(rng, 12, 20)
      return jitter([arcPts(0, 0, r, -90, 268), line([r * 0.9, -r * 1.2], [-r * 0.9, r * 1.2])], rng, {
        size: rand(rng, 26, 44),
        rotDeg: 6,
      })
    }
    case 'triangle':
      return jitter([line([0, 0], [0, 60], [40, 30], [0, 0])], rng, { size: rand(rng, 22, 38), rotDeg: 5 })
  }
}

interface Tally {
  total: number
  top1: number
  rescued: number // 最有力では外したが候補チップ（上位3）には入っていた
  failed: number
  confusions: Map<string, number>
}

function tally(): Tally {
  return { total: 0, top1: 0, rescued: 0, failed: 0, confusions: new Map() }
}

function record(t: Tally, intended: SymbolId, result: { best: { symbol: SymbolId } | null; candidates: Array<{ symbol: SymbolId }> }) {
  t.total++
  if (result.best?.symbol === intended) {
    t.top1++
    return
  }
  if (result.candidates.some((c) => c.symbol === intended)) {
    t.rescued++
  } else {
    t.failed++
  }
  const key = `${intended}→${result.best?.symbol ?? '（なし）'}`
  t.confusions.set(key, (t.confusions.get(key) ?? 0) + 1)
}

function pct(n: number, d: number): string {
  return d === 0 ? '-' : `${((n / d) * 100).toFixed(1)}%`
}

function report(label: string, t: Tally) {
  const conf = Array.from(t.confusions.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k, v]) => `${k}×${v}`)
    .join(' / ')
  console.log(
    `[計測] ${label}: 一発判別 ${pct(t.top1, t.total)} ・候補タップで確定 ${pct(t.rescued, t.total)} ` +
      `・拾えず ${pct(t.failed, t.total)}（n=${t.total}）${conf ? ` 主な取り違え: ${conf}` : ''}`,
  )
}

const N = 40

describe('判別率の機械計測（種固定・毎回同じ結果）', () => {
  it('群A（括弧4種＋下線）: 一発判別 90% 以上・救済込み 97% 以上', () => {
    const rng = mulberry32(20260825)
    const kinds: ShapeKind[] = [
      'paren-open', 'paren-close', 'square-open', 'square-close',
      'angle-open', 'angle-close', 'brace-open', 'brace-close', 'hline',
    ]
    const t = tally()
    const perKind = new Map<string, Tally>()
    for (const kind of kinds) {
      const kt = tally()
      for (let i = 0; i < N; i++) {
        const strokes = drawShape(kind, rng)
        const r = classifyShape(strokes)
        record(t, kind, r)
        record(kt, kind, r)
      }
      perKind.set(kind, kt)
    }
    Array.from(perKind.entries()).forEach(([k, kt]) => report(`群A ${k}`, kt))
    report('群A 合計', t)
    expect(t.top1 / t.total).toBeGreaterThanOrEqual(0.9)
    expect((t.top1 + t.rescued) / t.total).toBeGreaterThanOrEqual(0.97)
  })

  it('群B（○囲み・波線・?・ダッシュ・Ø）: 救済込み 85% 以上', () => {
    const rng = mulberry32(20260826)
    const kinds: ShapeKind[] = ['circle', 'wavy', 'question', 'tick', 'null-sign']
    const t = tally()
    const perKind = new Map<string, Tally>()
    for (const kind of kinds) {
      const kt = tally()
      for (let i = 0; i < N; i++) {
        const strokes = drawShape(kind, rng)
        const r = classifyShape(strokes)
        record(t, kind, r)
        record(kt, kind, r)
      }
      perKind.set(kind, kt)
    }
    Array.from(perKind.entries()).forEach(([k, kt]) => report(`群B ${k}`, kt))
    report('群B 合計', t)
    expect((t.top1 + t.rescued) / t.total).toBeGreaterThanOrEqual(0.85)
  })

  it('群C 働きの文字（S/V/O/C/P/Po/▷）: 救済込み 90% 以上', () => {
    const rng = mulberry32(20260827)
    const t = tally()
    const perKind = new Map<string, Tally>()
    for (const src of ROLE_STROKE_SOURCES) {
      const kt = perKind.get(src.symbol) ?? tally()
      for (let i = 0; i < N; i++) {
        const strokes = jitter(src.strokes, rng, { size: rand(rng, 18, 30), noise: 1.2, rotDeg: 5 })
        const r = classifyRoleLetter(strokes)
        record(t, src.symbol, r)
        record(kt, src.symbol, r)
      }
      perKind.set(src.symbol, kt)
    }
    Array.from(perKind.entries()).forEach(([k, kt]) => report(`群C 働き ${k}`, kt))
    report('群C 働き 合計', t)
    expect((t.top1 + t.rescued) / t.total).toBeGreaterThanOrEqual(0.9)
  })

  it('群C 品詞の文字（英字6種 n/v/a/ad/aux/p）: 救済込み 80% 以上', () => {
    const rng = mulberry32(20260828)
    const t = tally()
    const perKind = new Map<string, Tally>()
    for (const src of POS_STROKE_SOURCES) {
      const kt = perKind.get(src.symbol) ?? tally()
      for (let i = 0; i < N; i++) {
        const strokes = jitter(src.strokes, rng, { size: rand(rng, 20, 32), noise: 1.2, rotDeg: 4 })
        const r = classifyPosLetter(strokes)
        record(t, src.symbol, r)
        record(kt, src.symbol, r)
      }
      perKind.set(src.symbol, kt)
    }
    Array.from(perKind.entries()).forEach(([k, kt]) => report(`群C 品詞 ${k}`, kt))
    report('群C 品詞 合計', t)
    expect((t.top1 + t.rescued) / t.total).toBeGreaterThanOrEqual(0.8)
  })
})

describe('吸着精度の機械計測', () => {
  /** 実画面に近い寸法の単語箱（幅はまちまち・間隔12px・本文の帯 y=40〜68） */
  function makeBoxes(rng: Rng): TokenBox[] {
    const boxes: TokenBox[] = []
    let x = 16
    for (let i = 0; i < 8; i++) {
      const w = rand(rng, 34, 96)
      boxes.push({ index: i, left: x, right: x + w, top: 40, bottom: 68 })
      x += w + 12
    }
    return boxes
  }

  it('括弧の吸着（狙った単語の前/後に付くか）: 95% 以上', () => {
    const rng = mulberry32(20260829)
    let total = 0
    let ok = 0
    for (let trial = 0; trial < 200; trial++) {
      const boxes = makeBoxes(rng)
      const target = Math.floor(rand(rng, 0, boxes.length))
      const t = boxes[target]
      // 開き括弧: 単語の左端の少し左に、ばらつきをもって書く
      const x = t.left - rand(rng, 1, 5) + gauss(rng, 2.5)
      const open = [line([x + 5, 42], [x, 54], [x + 5, 66])]
      if (snapOpenBracket(open, boxes)?.index === target) ok++
      total++
      // 閉じ括弧: 右端の少し右
      const x2 = t.right + rand(rng, 1, 5) + gauss(rng, 2.5)
      const close = [line([x2 - 5, 42], [x2, 54], [x2 - 5, 66])]
      if (snapCloseBracket(close, boxes)?.index === target) ok++
      total++
    }
    console.log(`[計測] 吸着 括弧: ${pct(ok, total)}（n=${total}）`)
    expect(ok / total).toBeGreaterThanOrEqual(0.95)
  })

  it('下線の吸着（狙った範囲に一致するか）: 90% 以上', () => {
    const rng = mulberry32(20260830)
    let total = 0
    let ok = 0
    for (let trial = 0; trial < 200; trial++) {
      const boxes = makeBoxes(rng)
      const from = Math.floor(rand(rng, 0, 6))
      const to = Math.min(7, from + Math.floor(rand(rng, 0, 3)))
      const a = boxes[from]
      const b = boxes[to]
      // 端は単語の途中から書き始めたり少しはみ出したりする
      const x1 = a.left + rand(rng, -6, (a.right - a.left) * 0.3)
      const x2 = b.right + rand(rng, -(b.right - b.left) * 0.3, 8)
      const ul = [line([x1, 74 + gauss(rng, 2)], [x2, 74 + gauss(rng, 2)])]
      const r = snapHorizontalRange(ul, boxes)
      if (r && r.from === from && r.to === to) ok++
      total++
    }
    console.log(`[計測] 吸着 下線: ${pct(ok, total)}（n=${total}）`)
    expect(ok / total).toBeGreaterThanOrEqual(0.9)
  })

  it('文字の吸着（狙った単語のマスに入るか）: 95% 以上', () => {
    const rng = mulberry32(20260831)
    let total = 0
    let ok = 0
    for (let trial = 0; trial < 200; trial++) {
      const boxes = makeBoxes(rng)
      const target = Math.floor(rand(rng, 0, boxes.length))
      const t = boxes[target]
      const cx = (t.left + t.right) / 2 + gauss(rng, 6)
      const letter = [line([cx - 8, 80], [cx + 8, 94])]
      if (snapNearestToken(letter, boxes)?.index === target) ok++
      total++
    }
    console.log(`[計測] 吸着 文字: ${pct(ok, total)}（n=${total}）`)
    expect(ok / total).toBeGreaterThanOrEqual(0.95)
  })
})
