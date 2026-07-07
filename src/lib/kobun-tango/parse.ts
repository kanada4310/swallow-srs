/**
 * 「問題」(JSON) と表示用フラットフィールドのパース、古文単語演習ノートの判定。
 */
import type { KobunQuestion, KobunMeta, KobunBDisplay } from './types'

/** 採点用データ（正解・ダミー）を格納するフィールド名 */
export const QUESTION_FIELD = '問題'
/** モードB の表示テキスト用フラットフィールド名 */
export const PASSAGE_FIELD = '例文'
export const HEADWORD_FORM_FIELD = '傍線形'
export const SOURCE_FIELD = '出典'
export const TRANSLATION_FIELD = '現代語訳'

function asString(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

/** 「問題」JSON をパース。不正なら null。 */
export function parseKobunQuestion(raw: string | undefined | null): KobunQuestion | null {
  if (!raw) return null
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (!data || typeof data !== 'object') return null
  const o = data as Record<string, unknown>

  if (o.mode === 'A') {
    const correct = asStringArray(o.correct)
    if (correct.length === 0) return null
    return { mode: 'A', correct, distractors: asStringArray(o.distractors) }
  }

  if (o.mode === 'B') {
    const correct = asString(o.correct)
    if (!correct) return null
    return { mode: 'B', correct, distractors: asStringArray(o.distractors) }
  }

  return null
}

/** フラットフィールドからカードヘッダー用メタを取り出す。 */
export function parseKobunMeta(fieldValues: Record<string, string>): KobunMeta {
  return {
    no: fieldValues['通し番号'] || '',
    pos: fieldValues['品詞'] || '',
    headword: fieldValues['見出し語'] || '',
    kanji: fieldValues['漢字'] || '',
  }
}

/** モードB の表示テキスト（例文・傍線形・出典・訳）をフラットフィールドから取り出す。 */
export function parseKobunBDisplay(fieldValues: Record<string, string>): KobunBDisplay {
  return {
    passage: fieldValues[PASSAGE_FIELD] || '',
    headwordForm: fieldValues[HEADWORD_FORM_FIELD] || '',
    source: fieldValues[SOURCE_FIELD] || '',
    translation: fieldValues[TRANSLATION_FIELD] || '',
  }
}

/** このノートが古文単語演習ノートかを判定。 */
export function isKobunTangoNote(fieldValues: Record<string, string>): boolean {
  return parseKobunQuestion(fieldValues[QUESTION_FIELD]) !== null
}
