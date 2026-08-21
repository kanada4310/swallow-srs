/**
 * 生徒の書き込みをAIへ渡す文字列に直す／AIの判定JSONを読み取る（純ロジック）。
 *
 * 外部のAIへ送ってよいのは「教材の文」と「生徒の書き込み・問答の文面」だけ（絶対規程3）。
 * この層の関数は氏名・ID類を引数に取らない設計にして、それを担保する。
 */

import { SPAN_TYPES, type SpanType } from '@/lib/reading/syntax'
import type { SentenceSyntaxWork, SyntaxJudgeIssue, SyntaxJudgeResult } from '@/lib/reading/types'

type AnswerLike = SentenceSyntaxWork['answer']

function spanLabel(type: string): string {
  const t = SPAN_TYPES[type as SpanType]
  return t ? t.label : type
}

/** 英文（トークン列）を1行に戻す */
export function sentenceText(tokens: string[]): string {
  return tokens.join(' ')
}

/**
 * 書き込みの直列化。語番号は1始まり。未記入は「—」（省略段階により誤り扱いしない前提を
 * プロンプト側で明示する）。
 */
export function serializeAnswer(tokens: string[], answer: AnswerLike, unknown: boolean): string {
  const lines: string[] = []
  lines.push(`英文: ${sentenceText(tokens)}`)
  lines.push('')
  lines.push('生徒の書き込み（語番号. 語 | 品詞 | 働き。「—」は未記入）:')
  tokens.forEach((tok, i) => {
    const pos = answer.pos[i] ?? '—'
    const role = answer.role[i] ?? '—'
    lines.push(`${i + 1}. ${tok} | ${pos} | ${role}`)
  })
  lines.push('')
  if (answer.spans.length === 0) {
    lines.push('まとまりの書き込み: なし')
  } else {
    lines.push('まとまりの書き込み:')
    answer.spans.forEach((s) => {
      const text = tokens.slice(s.from, s.to + 1).join(' ')
      lines.push(`- ${spanLabel(s.type)}: 「${text}」（語${s.from + 1}〜${s.to + 1}）`)
    })
  }
  if (unknown) {
    lines.push('')
    lines.push('生徒はこの文に「分からない」マーク（波線＋?）を付けています。')
  }
  return lines.join('\n')
}

/* ===================== 判定JSONの読み取り ===================== */

const KINDS = new Set(['notation', 'question', 'confirm'])

function coerceIssue(raw: unknown): SyntaxJudgeIssue | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const point = typeof o.point === 'string' ? o.point.trim() : ''
  if (!point) return null
  const kind = typeof o.kind === 'string' && KINDS.has(o.kind) ? o.kind : 'question'
  const no = typeof o.no === 'number' && Number.isFinite(o.no) ? Math.max(0, Math.round(o.no)) : 0
  const issue: SyntaxJudgeIssue = {
    no,
    kind: kind as SyntaxJudgeIssue['kind'],
    target: typeof o.target === 'string' ? o.target : '',
    point,
  }
  if (typeof o.questionType === 'number' && o.questionType >= 1 && o.questionType <= 5) {
    issue.questionType = Math.round(o.questionType)
  }
  if (typeof o.lookup === 'string' && o.lookup.trim()) issue.lookup = o.lookup.trim()
  return issue
}

/**
 * AIの返答から判定JSONを取り出す。
 * clean は AI の申告を信用せず「notation / question がゼロか」で計算し直す
 * （confirm=正答の根拠確認だけなら確定を妨げない）。
 */
export function parseJudgeResponse(text: string): SyntaxJudgeResult | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fence ? fence[1] : text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(candidate.slice(start, end + 1))
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const o = parsed as Record<string, unknown>
  const rawIssues = Array.isArray(o.issues) ? o.issues : []
  const issues = rawIssues
    .map(coerceIssue)
    .filter((x): x is SyntaxJudgeIssue => x !== null)
    .sort((a, b) => a.no - b.no)
  const clean = !issues.some((i) => i.kind !== 'confirm')
  const result: SyntaxJudgeResult = { issues, clean }
  if (typeof o.comment === 'string' && o.comment.trim()) result.comment = o.comment.trim()
  return result
}
