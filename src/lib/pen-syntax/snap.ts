/**
 * 書いた線を単語の位置に吸着させる。
 *
 * 単語の箱（TokenBox）はコンテナ相対の画面座標で受け取り、
 * 記号の種類ごとに「どの単語（の前後・範囲）に付くか」を決める。
 */

import type { Lane, PenStroke, TokenBox } from './types'
import { strokesBBox } from './geometry'

/** 文が折り返して複数行になったときの1行ぶんの単語箱 */
export interface LineBoxes {
  top: number
  bottom: number
  boxes: TokenBox[]
}

/** 単語箱を表示上の行ごとにまとめる（top の近さでまとめる） */
export function groupLines(boxes: TokenBox[]): LineBoxes[] {
  const sorted = [...boxes].sort((a, b) => a.top - b.top || a.left - b.left)
  const lines: LineBoxes[] = []
  for (const t of sorted) {
    const line = lines.find((l) => Math.abs(l.top - t.top) < (t.bottom - t.top) * 0.6)
    if (line) {
      line.boxes.push(t)
      line.top = Math.min(line.top, t.top)
      line.bottom = Math.max(line.bottom, t.bottom)
    } else {
      lines.push({ top: t.top, bottom: t.bottom, boxes: [t] })
    }
  }
  return lines
}

/** 線の重心に一番近い行を選ぶ（吸着・行判定はその行の単語箱だけで行う） */
export function pickLine(strokes: PenStroke[], lines: LineBoxes[]): LineBoxes | null {
  if (lines.length === 0) return null
  const b = strokesBBox(strokes)
  let best: LineBoxes | null = null
  let bestD = Infinity
  for (const line of lines) {
    const cy = (line.top + line.bottom) / 2
    const d = Math.abs(b.cy - cy)
    if (d < bestD) {
      bestD = d
      best = line
    }
  }
  return best
}

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

/** 下線の表示用の連結線分（コンテナ相対座標） */
export interface UnderlineSegment {
  left: number
  right: number
  /** 線を引く縦位置（単語の下端の少し下） */
  y: number
}

/**
 * 下線のまとまり（from〜to）を、単語の間で途切れない連結線分にする（表示用）。
 * 文が折り返して複数行にまたがる場合は行ごとに1本ずつ返す。
 */
export function underlineSegments(
  span: { from: number; to: number },
  boxes: TokenBox[],
  gap = 2,
): UnderlineSegment[] {
  const covered = boxes.filter((t) => t.index >= span.from && t.index <= span.to)
  if (covered.length === 0) return []
  return groupLines(covered).map((line) => ({
    left: Math.min(...line.boxes.map((t) => t.left)),
    right: Math.max(...line.boxes.map((t) => t.right)),
    y: line.bottom + gap,
  }))
}

/**
 * 画のまとめ判定（shouldGroupStrokes）は grouping.ts へ移した（2026-08-27）。
 * 場所の比較相手を「まとまり全体の外接箱」から「直前の1画」に変え、
 * 単語の箱・段の境界も見るようになったため、吸着とは別の関心事として分けている。
 */
