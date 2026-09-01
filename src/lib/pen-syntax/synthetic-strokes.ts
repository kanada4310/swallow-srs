/**
 * 計測用の合成ストローク生成（種固定の乱数で手書きの揺れを模す）。
 *
 * もとは benchmark.test.ts の中にあった生成器を、精度計測（accuracy.test.ts）と
 * 共用するために切り出した。**ここで作る線は機械生成であり、実機のペンで書いた
 * 線の実測ではない**（完了報告ではその旨を必ず区別して書く）。
 * お手本（templates.ts）の写しではなくパラメータからその都度描くので、
 * お手本と評価データの出どころは分かれている（教訓 benchmark-self-reference）。
 */

import type { PenPoint, PenStroke, ShapeKind } from './types'
import type { UserTemplateStore } from './letters'
import { strokesBBox, resample } from './geometry'

/* ---------- 種固定の乱数 ---------- */
export function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export type Rng = () => number
export const rand = (rng: Rng, lo: number, hi: number) => lo + rng() * (hi - lo)
export const gauss = (rng: Rng, sigma: number) => {
  // Box-Muller
  const u = Math.max(rng(), 1e-9)
  const v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * sigma
}

/* ---------- 手書きの揺れの模擬 ---------- */

/** 回転・伸縮・平行移動・点ノイズを加える。size は外接箱の長辺（px 相当） */
export function jitter(
  strokes: PenStroke[],
  rng: Rng,
  opts: { size: number; noise?: number; rotDeg?: number },
): PenStroke[] {
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

export function line(...pts: Array<[number, number]>): PenStroke {
  return pts.map(([x, y]) => ({ x, y }))
}

export function arcPts(
  cx: number,
  cy: number,
  r: number,
  deg0: number,
  deg1: number,
  steps = 24,
): PenStroke {
  const out: PenPoint[] = []
  for (let i = 0; i <= steps; i++) {
    const a = ((deg0 + ((deg1 - deg0) * i) / steps) * Math.PI) / 180
    out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) })
  }
  return out
}

/** 形の記号を、お手本の写しではなくパラメータからその都度描く（より厳しい条件） */
export function drawShape(kind: ShapeKind, rng: Rng): PenStroke[] {
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

/* ---------- 閉じ括弧の癖の模擬（お手本登録の効果測定） ---------- */

/**
 * 右に膨らむ閉じ括弧の輪郭を1本の線にする。
 * n が大きいほど平ら＋丸い角（角括弧的）、小さいほど頂点がなだらか（山括弧的）。
 */
export function closingProfile(d: number, h: number, n: number, m: number, steps = 28): PenStroke {
  const pts: PenPoint[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = d * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * t - 1), n)), 1 / m)
    pts.push({ x, y: h * t })
  }
  return pts
}

export const QUIRK_KINDS = ['angle-close', 'square-close', 'brace-close'] as const
export type QuirkKind = (typeof QUIRK_KINDS)[number]

/** 実機で判別率が低い書き癖の模擬: 角の尖り・折れが弱い閉じ括弧 */
export function quirkClose(kind: QuirkKind, rng: Rng): PenStroke[] {
  const h = rand(rng, 42, 60)
  if (kind === 'angle-close') {
    // 山括弧の頂点を丸めて書く癖 → 素の判別では ）と紛れやすい
    const d = rand(rng, 16, 26)
    return jitter([closingProfile(d, h, rand(rng, 1.2, 1.4), 1.1)], rng, { size: rand(rng, 38, 56), rotDeg: 4 })
  }
  if (kind === 'square-close') {
    // 角括弧の角を丸めて書く癖 → 折れが検出されず ）や 〉 と紛れやすい
    const d = rand(rng, 12, 20)
    return jitter([closingProfile(d, h, rand(rng, 5, 7), 1.3)], rng, { size: rand(rng, 38, 56), rotDeg: 4 })
  }
  // 波括弧のツノを浅く・なだらかに書く癖 → 折れの数が足りず他の括弧と紛れやすい
  const w = rand(rng, 9, 13)
  const base = line(
    [0, 0], [w, h * 0.07], [w * 1.05, h * 0.3], [w * 1.05, h * 0.44], [w * 1.45, h * 0.5],
    [w * 1.05, h * 0.56], [w * 1.05, h * 0.7], [w, h * 0.93], [0, h],
  )
  return jitter([base], rng, { size: rand(rng, 40, 58), rotDeg: 3 })
}

/**
 * 初回お手本登録を済ませた想定の保存内容（種固定）。
 * 括弧8種すべてを本人の字で登録する（閉じ3種は癖のある字・他5種は標準的な字）。
 */
export function quirkStore(): UserTemplateStore {
  const rng = mulberry32(20260901)
  const store: UserTemplateStore = {}
  for (const kind of QUIRK_KINDS) {
    store[kind] = [quirkClose(kind, rng), quirkClose(kind, rng)]
  }
  const others: ShapeKind[] = ['paren-open', 'paren-close', 'square-open', 'angle-open', 'brace-open']
  for (const kind of others) {
    store[kind] = [drawShape(kind, rng), drawShape(kind, rng)]
  }
  return store
}
