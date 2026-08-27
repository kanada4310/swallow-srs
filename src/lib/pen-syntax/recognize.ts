/**
 * 画のまとまり（グループ）1つを判別する入口。
 *
 * 書かれた場所で判別器を切り替える:
 * - ○で囲んだ漢字（例外マーク1字: 仮・真・強・同）はどの行でも先に見る
 * - 本文の行（band）: 形の記号（括弧・下線・波線など）
 * - 上の行（above）: 品詞の文字。下の行（below）: 働きの文字
 *   ただし幅の広い横線・波線は文字の行でも形として扱う
 * 台帳から外れた形（?・ダッシュ・Ø・単語囲みの○）も検出はする（呼び出し側が
 * 台帳＝ledger.ts を見て「反映せず案内」に落とす）。
 */

import type { Lane, PenStroke, RecognitionResult, SymbolCandidate, TokenBox } from './types'
import { EXCEPTION_KANJI } from './types'
import type { UserTemplateStore } from './letters'
import { classifyLetter, userTemplatesFor } from './letters'
import { classifyShape } from './shapes'
import { groupLines, laneOf, pickLine } from './snap'
import { bbox, closedness, resample, smooth, strokesBBox } from './geometry'
import { matchClouds } from './pdollar'

export interface GroupRecognition {
  result: RecognitionResult
  lane: Lane
  /** 吸着に使う行（折り返し対応で、線に一番近い行の単語箱だけ） */
  boxes: TokenBox[]
}

/** ○囲みとみなす円の最小の大きさ（px） */
const EXCEPTION_CIRCLE_MIN = 24
/** 内側の字画は円よりこの比率以上小さいこと（英字 a の丸＋縦棒などを誤検出しない） */
const EXCEPTION_INNER_RATIO = 0.85

/**
 * ○で囲んだ漢字の例外マーク（仮・真・強・同）の検出。
 * 「大きな閉じた線」と「その中に収まる字画」の組で判定し、
 * 中の字画を本人のお手本（あれば）と照合して候補を並べる。
 * お手本が無くても候補チップから選べる（判別は諦めても記録は落とさない）。
 */
export function classifyExceptionMark(
  strokes: PenStroke[],
  store: UserTemplateStore | null = null,
): RecognitionResult | null {
  if (strokes.length < 2) return null
  const smoothed = strokes.map((s) => smooth(resample(s, 32)))
  // 一番大きい「閉じた画」を円の候補にする
  let circleIdx = -1
  let circleSize = 0
  smoothed.forEach((s, i) => {
    const b = bbox(s)
    const size = Math.max(b.width, b.height)
    if (closedness(s) < 0.4 && size >= EXCEPTION_CIRCLE_MIN && size > circleSize) {
      circleIdx = i
      circleSize = size
    }
  })
  if (circleIdx < 0) return null
  const cb = bbox(smoothed[circleIdx])
  const inner = strokes.filter((_, i) => i !== circleIdx)
  if (inner.length === 0) return null
  const ib = strokesBBox(inner)
  // 中の字画が円の中に収まっていて、円より十分小さいこと
  const inside =
    ib.cx >= cb.left && ib.cx <= cb.right && ib.cy >= cb.top && ib.cy <= cb.bottom
  if (!inside) return null
  if (Math.max(ib.width, ib.height) > circleSize * EXCEPTION_INNER_RATIO) return null

  const tpls = userTemplatesFor(store, EXCEPTION_KANJI)
  const scoreOf = new Map(matchClouds(inner, tpls).map((m) => [m.symbol, m.score]))
  const candidates: SymbolCandidate[] = EXCEPTION_KANJI.map((k) => ({
    symbol: k,
    score: scoreOf.get(k) ?? 0,
  }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
  const top = candidates[0]
  const clear =
    top.score >= 0.3 && (candidates.length < 2 || top.score - candidates[1].score >= 0.08)
  // お手本が無い・迷うときは候補チップで選んでもらう（best は出すが確定させない）
  return { best: top.score > 0 ? top : null, candidates, ambiguous: !clear }
}

export function recognizeGroup(
  strokes: PenStroke[],
  allBoxes: TokenBox[],
  store: UserTemplateStore | null = null,
): GroupRecognition {
  const line = pickLine(strokes, groupLines(allBoxes))
  const boxes = line ? line.boxes : allBoxes
  const lane = laneOf(strokes, boxes)

  // ○で囲んだ漢字（例外マーク）はどの行でも先に見る
  const exception = classifyExceptionMark(strokes, store)
  if (exception) {
    return { result: exception, lane, boxes }
  }

  const shape = classifyShape(strokes, store)

  if (lane === 'band') {
    return { result: shape, lane, boxes }
  }

  // 幅の広い横線・波線は文字ではない（下線・熟語の波線）
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
  const merged: SymbolCandidate[] = letter.candidates.slice(0, 3)

  if (merged.length === 0 || merged[0].score < 0.3) {
    return { result: { best: null, candidates: merged, ambiguous: true }, lane, boxes }
  }
  const ambiguous = merged.length > 1 && merged[0].score - merged[1].score < 0.08
  return { result: { best: merged[0], candidates: merged, ambiguous }, lane, boxes }
}
