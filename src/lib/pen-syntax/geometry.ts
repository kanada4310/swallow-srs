/**
 * 線（ストローク）の幾何計算。判別の材料になる特徴量をここで数える。
 * すべて純関数（テスト対象）。
 */

import type { PenPoint, PenStroke } from './types'

export interface BBox {
  left: number
  right: number
  top: number
  bottom: number
  width: number
  height: number
  cx: number
  cy: number
}

export function bbox(points: PenPoint[]): BBox {
  let left = Infinity
  let right = -Infinity
  let top = Infinity
  let bottom = -Infinity
  for (const p of points) {
    if (p.x < left) left = p.x
    if (p.x > right) right = p.x
    if (p.y < top) top = p.y
    if (p.y > bottom) bottom = p.y
  }
  return {
    left,
    right,
    top,
    bottom,
    width: right - left,
    height: bottom - top,
    cx: (left + right) / 2,
    cy: (top + bottom) / 2,
  }
}

export function strokesBBox(strokes: PenStroke[]): BBox {
  return bbox(strokes.flat())
}

export function dist(a: PenPoint, b: PenPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function pathLength(points: PenPoint[]): number {
  let len = 0
  for (let i = 1; i < points.length; i++) len += dist(points[i - 1], points[i])
  return len
}

/** 弧長で等間隔に n 点へ打ち直す */
export function resample(points: PenPoint[], n: number): PenPoint[] {
  if (points.length === 0) return []
  if (points.length === 1) return Array.from({ length: n }, () => ({ ...points[0] }))
  const total = pathLength(points)
  if (total === 0) return Array.from({ length: n }, () => ({ ...points[0] }))
  const interval = total / (n - 1)
  const out: PenPoint[] = [{ ...points[0] }]
  let acc = 0
  const pts = points.map((p) => ({ ...p }))
  for (let i = 1; i < pts.length; i++) {
    const d = dist(pts[i - 1], pts[i])
    if (acc + d >= interval && d > 0) {
      const t = (interval - acc) / d
      const q = {
        x: pts[i - 1].x + t * (pts[i].x - pts[i - 1].x),
        y: pts[i - 1].y + t * (pts[i].y - pts[i - 1].y),
      }
      out.push(q)
      pts.splice(i, 0, q)
      acc = 0
    } else {
      acc += d
    }
  }
  while (out.length < n) out.push({ ...pts[pts.length - 1] })
  return out.slice(0, n)
}

/** 始点→終点の直線距離 ÷ 道のり。1に近いほどまっすぐ */
export function straightness(points: PenPoint[]): number {
  const len = pathLength(points)
  if (len === 0) return 1
  return dist(points[0], points[points.length - 1]) / len
}

/** 始点と終点の近さ ÷ 外接箱の大きさ。小さいほど「閉じた」線（円など） */
export function closedness(points: PenPoint[]): number {
  const b = bbox(points)
  const size = Math.max(b.width, b.height)
  if (size === 0) return 0
  return dist(points[0], points[points.length - 1]) / size
}

/** 始点→終点の角度（度・-180〜180。0=右向き、90=下向き） */
export function chordAngleDeg(points: PenPoint[]): number {
  const a = points[0]
  const b = points[points.length - 1]
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
}

/** 移動平均でならす（点ノイズを消して折れの数え間違いを防ぐ） */
export function smooth(points: PenPoint[], passes = 2): PenPoint[] {
  let pts = points
  for (let p = 0; p < passes; p++) {
    if (pts.length < 3) return pts
    const out: PenPoint[] = [pts[0]]
    for (let i = 1; i < pts.length - 1; i++) {
      out.push({
        x: (pts[i - 1].x + pts[i].x + pts[i + 1].x) / 3,
        y: (pts[i - 1].y + pts[i].y + pts[i + 1].y) / 3,
      })
    }
    out.push(pts[pts.length - 1])
    pts = out
  }
  return pts
}

/** 等間隔48点に打ち直した各点での進行方向の変化量（度・絶対値） */
export function turnAngles(points: PenPoint[], opts?: { n?: number; win?: number }): number[] {
  const n = opts?.n ?? 48
  const win = opts?.win ?? 4
  const pts = resample(points, n)
  const turns: number[] = []
  for (let i = win; i < pts.length - win; i++) {
    const a1 = Math.atan2(pts[i].y - pts[i - win].y, pts[i].x - pts[i - win].x)
    const a2 = Math.atan2(pts[i + win].y - pts[i].y, pts[i + win].x - pts[i].x)
    let d = ((a2 - a1) * 180) / Math.PI
    while (d > 180) d -= 360
    while (d < -180) d += 360
    turns.push(Math.abs(d))
  }
  return turns
}

/**
 * 折れ（角）の数を数える。進行方向が minTurnDeg 以上変わる箇所を
 * 1つの角として数える（近接する角はまとめる）。
 */
export function countCorners(
  points: PenPoint[],
  opts?: { n?: number; minTurnDeg?: number; win?: number },
): number {
  const minTurn = opts?.minTurnDeg ?? 50
  const turns = turnAngles(points, { n: opts?.n, win: opts?.win })
  let corners = 0
  let i = 0
  while (i < turns.length) {
    if (turns[i] >= minTurn) {
      // 山の頂点を1つの角として数え、山を抜けるまで送る
      corners++
      while (i < turns.length && turns[i] >= minTurn * 0.6) i++
    } else {
      i++
    }
  }
  return corners
}

/** 進行方向の変化が最大の点（角のある図形の頂点の位置） */
export function maxTurnPoint(points: PenPoint[]): PenPoint {
  const n = 48
  const pts = resample(points, n)
  const turns = turnAngles(points, { n })
  let best = 0
  for (let i = 1; i < turns.length; i++) if (turns[i] > turns[best]) best = i
  return pts[best + 4] ?? pts[Math.floor(n / 2)]
}

/** y方向の向きが変わった回数（波線の判定に使う）。小さな揺れは無視する */
export function countYAlternations(points: PenPoint[], minSwing?: number): number {
  const b = bbox(points)
  const swing = minSwing ?? Math.max(2, b.height * 0.25)
  let count = 0
  let dir = 0
  let extreme = points[0].y
  for (const p of points) {
    if (dir === 0) {
      if (p.y > extreme + swing) dir = 1
      else if (p.y < extreme - swing) dir = -1
      if (dir !== 0) extreme = p.y
      continue
    }
    if (dir === 1) {
      if (p.y > extreme) extreme = p.y
      else if (p.y < extreme - swing) {
        count++
        dir = -1
        extreme = p.y
      }
    } else {
      if (p.y < extreme) extreme = p.y
      else if (p.y > extreme + swing) {
        count++
        dir = 1
        extreme = p.y
      }
    }
  }
  return count
}

/** 点から線分への距離 */
export function distToSegment(p: PenPoint, a: PenPoint, b: PenPoint): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return dist(p, a)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy })
}

/** 各点の距離（distFn）の平均＝当てはめ誤差 */
export function fitError(points: PenPoint[], distFn: (p: PenPoint) => number): number {
  if (points.length === 0) return 0
  return points.reduce((s, p) => s + distFn(p), 0) / points.length
}

/**
 * 3点（始点・頂点・終点）を通る円弧に対する当てはめ誤差の平均。
 * 3点がほぼ一直線のとき（円が定まらないとき）は弦への距離で代用する。
 */
export function arcFitError(points: PenPoint[], a: PenPoint, apex: PenPoint, b: PenPoint): number {
  const d = 2 * (a.x * (apex.y - b.y) + apex.x * (b.y - a.y) + b.x * (a.y - apex.y))
  if (Math.abs(d) < 1e-6) {
    return fitError(points, (p) => distToSegment(p, a, b))
  }
  const a2 = a.x * a.x + a.y * a.y
  const p2 = apex.x * apex.x + apex.y * apex.y
  const b2 = b.x * b.x + b.y * b.y
  const cx = (a2 * (apex.y - b.y) + p2 * (b.y - a.y) + b2 * (a.y - apex.y)) / d
  const cy = (a2 * (b.x - apex.x) + p2 * (a.x - b.x) + b2 * (apex.x - a.x)) / d
  const center = { x: cx, y: cy }
  const r = dist(center, a)
  return fitError(points, (p) => Math.abs(dist(p, center) - r))
}

/**
 * 弦（始点→終点）に対して線の中身がどちら側に膨らんでいるか。
 * 正=弦の右側（進行方向に対して）、負=左側。括弧の開き向きの判定に使う。
 */
export function bulgeSide(points: PenPoint[]): number {
  const a = points[0]
  const b = points[points.length - 1]
  const chord = dist(a, b)
  if (chord === 0) return 0
  let sum = 0
  for (const p of points) {
    // 外積の符号で弦のどちら側かを見る
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
    sum += cross / chord
  }
  return sum / points.length
}
