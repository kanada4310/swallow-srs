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

/** アプリの働き表記（前O・接）とルールブック表記（Po・▷）の橋渡し */
export function roleLetterToAppRole(letter: RoleLetter): string {
  if (letter === 'Po') return '前O'
  if (letter === '▷') return '接'
  if (letter === 'P') return 'M' // アプリの構文の練習では前置詞の働きを M と表記している
  return letter
}

/** 品詞の略記 → アプリの品詞名 */
export function posLetterToAppPos(letter: PosLetter): string {
  const map: Record<PosLetter, string> = {
    名: '名詞',
    代: '代名詞',
    動: '動詞',
    助: '助動詞',
    形: '形容詞',
    副: '副詞',
    前: '前置詞',
    接: '接続詞',
    冠: '冠詞',
    分: '分詞',
    不: '不定詞',
  }
  return map[letter]
}
