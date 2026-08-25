/**
 * 画のまとまり（グループ）1つを判別する入口。
 *
 * 書かれた場所で判別器を切り替える:
 * - 本文の行（band）: 形の記号（括弧・下線・○囲みなど）
 * - 上の行（above）: 品詞の文字。下の行（below）: 働きの文字
 *   ただし幅の広い横線・波線、小さな記号（ダッシュ・Ø・?）は文字の行でも形として扱い、
 *   文字候補とスコアで競わせる
 */

import type { Lane, PenStroke, RecognitionResult, SymbolCandidate, TokenBox } from './types'
import type { UserTemplateStore } from './letters'
import { classifyLetter } from './letters'
import { classifyShape } from './shapes'
import { groupLines, laneOf, pickLine } from './snap'
import { strokesBBox } from './geometry'

export interface GroupRecognition {
  result: RecognitionResult
  lane: Lane
  /** 吸着に使う行（折り返し対応で、線に一番近い行の単語箱だけ） */
  boxes: TokenBox[]
}

/** 文字の行でも形として競合させる小さな記号 */
const SMALL_SHAPES = new Set(['tick', 'null-sign', 'question', 'slash'])

export function recognizeGroup(
  strokes: PenStroke[],
  allBoxes: TokenBox[],
  store: UserTemplateStore | null = null,
): GroupRecognition {
  const line = pickLine(strokes, groupLines(allBoxes))
  const boxes = line ? line.boxes : allBoxes
  const lane = laneOf(strokes, boxes)
  const shape = classifyShape(strokes)

  if (lane === 'band') {
    return { result: shape, lane, boxes }
  }

  // 幅の広い横線・波線は文字ではない（下線・波線マーク）
  const b = strokesBBox(strokes)
  const widths = boxes.map((t) => t.right - t.left).sort((a, c) => a - c)
  const medWidth = widths[Math.floor(widths.length / 2)] ?? 40
  if (
    b.width > medWidth * 1.1 &&
    shape.best &&
    (shape.best.symbol === 'hline' || shape.best.symbol === 'wavy')
  ) {
    return { result: shape, lane, boxes }
  }

  const letter = classifyLetter(strokes, lane, store)
  const small = shape.candidates.filter((c) => SMALL_SHAPES.has(c.symbol))
  const merged: SymbolCandidate[] = [...letter.candidates, ...small]
    .sort((a, c) => c.score - a.score)
    .slice(0, 3)

  if (merged.length === 0 || merged[0].score < 0.3) {
    return { result: { best: null, candidates: merged, ambiguous: true }, lane, boxes }
  }
  const ambiguous = merged.length > 1 && merged[0].score - merged[1].score < 0.08
  return { result: { best: merged[0], candidates: merged, ambiguous }, lane, boxes }
}
