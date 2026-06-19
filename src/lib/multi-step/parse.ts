/**
 * 「設問」「傍線」フィールド(JSON) のパース。
 * 元教材の snake_case キーと camelCase の両方を受理する寛容なパーサ。
 */
import type { MultiStepQuestion, FollowUp, Highlight, AnswerFormat } from './types'

/** 設問データを格納するフィールド名 */
export const QUESTIONS_FIELD = '設問'
/** 傍線(ハイライト)データを格納するフィールド名 */
export const HIGHLIGHTS_FIELD = '傍線'

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}

function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

function parseFollowUp(raw: unknown): FollowUp | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const prompt = asString(o.prompt)
  const answer = asString(o.answer ?? o.correct_answer)
  const choices = asStringArray(o.choices)
  if (!prompt || !answer || choices.length === 0) return null
  return {
    prompt,
    choices,
    answer,
    explanation: asString(o.explanation),
  }
}

function parseQuestion(raw: unknown, index: number): MultiStepQuestion | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const prompt = asString(o.prompt)
  if (!prompt) return null

  const formatRaw = asString(o.format ?? o.answer_format) ?? 'select'
  const format: AnswerFormat = formatRaw === 'text' ? 'text' : 'select'
  const choices = asStringArray(o.choices)
  const answer = asString(o.answer ?? o.correct_answer) ?? ''

  return {
    id: asString(o.id ?? o.q_id) ?? `q${index + 1}`,
    highlightId: asString(o.highlightId ?? o.highlight_id),
    questionType: asString(o.questionType ?? o.question_type),
    prompt,
    format,
    choices,
    answer,
    explanation: asString(o.explanation),
    referencePage: asNumber(o.referencePage ?? o.reference_page),
    followUp: format === 'select' ? parseFollowUp(o.followUp ?? o.follow_up) : null,
  }
}

/** 「設問」JSON をパース。不正な要素は除外。 */
export function parseQuestions(raw: string | undefined | null): MultiStepQuestion[] {
  if (!raw) return []
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(data)) return []
  return data
    .map((q, i) => parseQuestion(q, i))
    .filter((q): q is MultiStepQuestion => q !== null)
}

/** 「傍線」JSON をパース。 */
export function parseHighlights(raw: string | undefined | null): Highlight[] {
  if (!raw) return []
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(data)) return []
  return data
    .map((h): Highlight | null => {
      if (!h || typeof h !== 'object') return null
      const o = h as Record<string, unknown>
      const id = asString(o.id)
      const start = asNumber(o.start)
      const end = asNumber(o.end)
      if (!id || start === null || end === null) return null
      return { id, start, end, text: asString(o.text) }
    })
    .filter((h): h is Highlight => h !== null)
}

/** このノートが多段階設問（識別演習）ノートかを判定。 */
export function isMultiStepNote(fieldValues: Record<string, string>): boolean {
  return parseQuestions(fieldValues[QUESTIONS_FIELD]).length > 0
}
