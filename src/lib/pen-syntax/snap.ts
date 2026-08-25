/**
 * 書いた線を単語の位置に吸着させる。
 *
 * 単語の箱（TokenBox）はコンテナ相対の画面座標で受け取り、
 * 記号の種類ごとに「どの単語（の前後・範囲）に付くか」を決める。
 */

import type { Lane, PenStroke, TokenBox } from './types'
import { strokesBBox } from './geometry'

/** 線の重心の縦位置から、どの行（上=品詞/本文/下=働き）に書かれたかを決める */
export function laneOf(strokes: PenStroke[], boxes: TokenBox[]): Lane {
  if (boxes.length === 0) return 'band'
  const b = strokesBBox(strokes)
  const top = Math.min(...boxes.map((t) => t.top))
  const bottom = Math.max(...boxes.map((t) => t.bottom))
  if (b.cy < top) return 'above'
  if (b.cy > bottom) return 'below'
  return 'band'
}

export interface SnapPoint {
  index: number
  /** 吸着先までの水平距離（px）。計測で精度を数えるのに使う */
  distance: number
}

/** 開き括弧: 線の位置に一番近い「単語の左端」へ吸着（その単語の前に付く） */
export function snapOpenBracket(strokes: PenStroke[], boxes: TokenBox[]): SnapPoint | null {
  if (boxes.length === 0) return null
  const b = strokesBBox(strokes)
  let best: SnapPoint | null = null
  for (const t of boxes) {
    const d = Math.abs(t.left - b.cx)
    if (!best || d < best.distance) best = { index: t.index, distance: d }
  }
  return best
}

/** 閉じ括弧: 一番近い「単語の右端」へ吸着（その単語の後ろに付く） */
export function snapCloseBracket(strokes: PenStroke[], boxes: TokenBox[]): SnapPoint | null {
  if (boxes.length === 0) return null
  const b = strokesBBox(strokes)
  let best: SnapPoint | null = null
  for (const t of boxes) {
    const d = Math.abs(t.right - b.cx)
    if (!best || d < best.distance) best = { index: t.index, distance: d }
  }
  return best
}

export interface SnapRange {
  from: number
  to: number
}

/** 下線・波線: 横に重なっている単語の範囲へ吸着 */
export function snapHorizontalRange(strokes: PenStroke[], boxes: TokenBox[]): SnapRange | null {
  if (boxes.length === 0) return null
  const b = strokesBBox(strokes)
  const covered = boxes.filter((t) => {
    const overlap = Math.min(b.right, t.right) - Math.max(b.left, t.left)
    return overlap > Math.min(t.right - t.left, 1) * 0.35
  })
  if (covered.length === 0) {
    // どの単語にも十分重なっていない: 一番近い単語1語に付ける
    const nearest = snapNearestToken(strokes, boxes)
    return nearest ? { from: nearest.index, to: nearest.index } : null
  }
  return {
    from: Math.min(...covered.map((t) => t.index)),
    to: Math.max(...covered.map((t) => t.index)),
  }
}

/** ○囲み: 円の中に中心が入っている単語の範囲へ吸着 */
export function snapEnclosedRange(strokes: PenStroke[], boxes: TokenBox[]): SnapRange | null {
  if (boxes.length === 0) return null
  const b = strokesBBox(strokes)
  const inside = boxes.filter((t) => {
    const cx = (t.left + t.right) / 2
    const cy = (t.top + t.bottom) / 2
    return cx >= b.left && cx <= b.right && cy >= b.top - 4 && cy <= b.bottom + 4
  })
  if (inside.length === 0) {
    const nearest = snapNearestToken(strokes, boxes)
    return nearest ? { from: nearest.index, to: nearest.index } : null
  }
  return {
    from: Math.min(...inside.map((t) => t.index)),
    to: Math.max(...inside.map((t) => t.index)),
  }
}

/** 文字・その他: 横方向に一番近い単語1語へ吸着 */
export function snapNearestToken(strokes: PenStroke[], boxes: TokenBox[]): SnapPoint | null {
  if (boxes.length === 0) return null
  const b = strokesBBox(strokes)
  let best: SnapPoint | null = null
  for (const t of boxes) {
    const cx = (t.left + t.right) / 2
    // 箱の横幅の中に入っていれば距離0扱い
    const d = b.cx >= t.left && b.cx <= t.right ? 0 : Math.min(Math.abs(cx - b.cx), Math.abs(t.left - b.cx), Math.abs(t.right - b.cx))
    if (!best || d < best.distance) best = { index: t.index, distance: d }
  }
  return best
}

/**
 * 2つの画をひとつの記号としてまとめて判別すべきか（Po・Ø・?・漢字などの複数画対応）。
 * 「時間が近く、場所も近い」を条件にする。
 */
export function shouldGroupStrokes(
  prev: PenStroke[],
  next: PenStroke,
  opts?: { maxGapMs?: number; maxGapPx?: number },
): boolean {
  const maxGapMs = opts?.maxGapMs ?? 900
  const maxGapPx = opts?.maxGapPx ?? 40
  const prevPts = prev.flat()
  if (prevPts.length === 0 || next.length === 0) return false
  const lastT = Math.max(...prevPts.map((p) => p.t ?? 0))
  const firstT = next[0].t ?? lastT
  if (firstT - lastT > maxGapMs) return false
  const a = strokesBBox(prev)
  const b = strokesBBox([next])
  const gapX = Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right))
  const gapY = Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom))
  return gapX <= maxGapPx && gapY <= maxGapPx * 1.5
}
