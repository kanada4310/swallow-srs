/**
 * 文字（群C）の判別＝有限候補への当てはめ。
 *
 * 自由な手書き文字認識ではなく、書かれた行（上=品詞・下=働き）で候補を絞ったうえで
 * $P 点群照合により最も近い候補を選ぶ（構想 v1.2 確定の設計）。
 * 内蔵お手本に加えて、本人の字を「お手本登録」した分（userTemplates）も照合対象にする。
 */

import type {
  Lane,
  PenStroke,
  PosLetter,
  RecognitionResult,
  RoleLetter,
  SymbolCandidate,
} from './types'
import { POS_LETTERS, ROLE_LETTERS } from './types'
import { type CloudTemplate, makeTemplate, matchClouds } from './pdollar'
import { POS_TEMPLATES, ROLE_TEMPLATES } from './templates'

export const LETTER_AMBIGUOUS_MARGIN = 0.08
export const LETTER_MIN_SCORE = 0.3

/** お手本登録の保存形式（localStorage に置く。座標は正規化前の生データでよい） */
export type UserTemplateStore = Partial<Record<string, PenStroke[][]>>

export function userTemplatesFor(store: UserTemplateStore | null, symbols: readonly string[]): CloudTemplate[] {
  if (!store) return []
  const out: CloudTemplate[] = []
  for (const sym of symbols) {
    for (const strokes of store[sym] ?? []) {
      if (strokes.length > 0) out.push(makeTemplate(sym, strokes))
    }
  }
  return out
}

/** 品詞（上の行）の文字判別 */
export function classifyPosLetter(
  strokes: PenStroke[],
  store: UserTemplateStore | null = null,
): RecognitionResult {
  const templates = [...POS_TEMPLATES, ...(userTemplatesFor(store, POS_LETTERS) as Array<CloudTemplate<PosLetter>>)]
  return toResult(matchClouds(strokes, templates))
}

/** 働き（下の行）の文字判別 */
export function classifyRoleLetter(
  strokes: PenStroke[],
  store: UserTemplateStore | null = null,
): RecognitionResult {
  const templates = [...ROLE_TEMPLATES, ...(userTemplatesFor(store, ROLE_LETTERS) as Array<CloudTemplate<RoleLetter>>)]
  return toResult(matchClouds(strokes, templates))
}

export function classifyLetter(
  strokes: PenStroke[],
  lane: Lane,
  store: UserTemplateStore | null = null,
): RecognitionResult {
  return lane === 'above' ? classifyPosLetter(strokes, store) : classifyRoleLetter(strokes, store)
}

function toResult(matches: Array<{ symbol: string; score: number }>): RecognitionResult {
  const ranked = matches.slice(0, 3) as SymbolCandidate[]
  if (ranked.length === 0 || ranked[0].score < LETTER_MIN_SCORE) {
    return { best: null, candidates: ranked, ambiguous: true }
  }
  const ambiguous = ranked.length > 1 && ranked[0].score - ranked[1].score < LETTER_AMBIGUOUS_MARGIN
  return { best: ranked[0], candidates: ranked, ambiguous }
}

// 働き・品詞の文字は塾長の実書き込みの表記のまま解答値として保存する
// （Po・▷・P を「前O」「接」「M」などに言い換えない。2026-08-26 塾長指示）。
// 品詞の英字は採点側 gradeSyntax が漢字名の正解表と同値として照合する。
