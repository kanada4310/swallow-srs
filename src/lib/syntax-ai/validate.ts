/**
 * AI判定・カード化APIの入力検査（純ロジック）。
 *
 * 外部のAIへ渡る内容を「教材の文＋決まった選択肢からの書き込み」に制限するための検査。
 * 品詞・働き・まとまりの値はタップ入力の選択肢そのものしか通さない。
 */

import { POS_OPTIONS, ROLE_OPTIONS, SPAN_TYPES } from '@/lib/reading/syntax'
import type { SentenceSyntaxWork } from '@/lib/reading/types'

type AnswerLike = SentenceSyntaxWork['answer']

export const MAX_TOKENS_PER_SENTENCE = 250
export const MAX_DIALOGUE_TURNS = 60
export const MAX_TURN_TEXT_LENGTH = 2000

export function isSentenceKey(v: unknown): v is string {
  return typeof v === 'string' && /^\d{1,3}:\d{1,3}$/.test(v)
}

export function validateTokens(tokens: unknown): string | null {
  if (!Array.isArray(tokens) || tokens.length === 0) return '文の形が正しくありません'
  if (tokens.length > MAX_TOKENS_PER_SENTENCE) return '文が長すぎます'
  if (!tokens.every((t) => typeof t === 'string' && t.length > 0 && t.length <= 100)) {
    return '文の形が正しくありません'
  }
  return null
}

/** 書き込みの形と値の検査。問題なければ null、あればエラーメッセージ */
export function validateAnswer(tokens: string[], answer: unknown): string | null {
  if (!answer || typeof answer !== 'object') return '書き込みの形が正しくありません'
  const a = answer as AnswerLike
  if (!Array.isArray(a.pos) || !Array.isArray(a.role) || !Array.isArray(a.spans)) {
    return '書き込みの形が正しくありません'
  }
  if (a.pos.length !== tokens.length || a.role.length !== tokens.length) {
    return '書き込みと文の長さが合っていません'
  }
  if (!a.pos.every((v) => v === null || POS_OPTIONS.includes(v))) return '品詞の値が不正です'
  if (!a.role.every((v) => v === null || ROLE_OPTIONS.includes(v))) return '働きの値が不正です'
  if (a.spans.length > 50) return 'まとまりが多すぎます'
  for (const s of a.spans) {
    if (!s || typeof s !== 'object') return 'まとまりの形が正しくありません'
    if (!(s.type in SPAN_TYPES)) return 'まとまりの種類が不正です'
    if (
      !Number.isInteger(s.from) ||
      !Number.isInteger(s.to) ||
      s.from < 0 ||
      s.to < s.from ||
      s.to >= tokens.length
    ) {
      return 'まとまりの範囲が不正です'
    }
  }
  return null
}

export interface DialogueTurnInput {
  role: 'coach' | 'student'
  text: string
}

/** 問答の往復履歴の検査。問題なければ整えた配列、あれば文字列（エラー） */
export function validateTurns(turns: unknown): DialogueTurnInput[] | string {
  if (turns == null) return []
  if (!Array.isArray(turns)) return '問答の形が正しくありません'
  if (turns.length > MAX_DIALOGUE_TURNS) return '問答が長くなりすぎました。書き込みを直して再判定してください'
  const out: DialogueTurnInput[] = []
  for (const t of turns) {
    if (!t || typeof t !== 'object') return '問答の形が正しくありません'
    const role = (t as { role?: unknown }).role
    const text = (t as { text?: unknown }).text
    if (role !== 'coach' && role !== 'student') return '問答の形が正しくありません'
    if (typeof text !== 'string' || !text.trim()) return '問答の形が正しくありません'
    if (text.length > MAX_TURN_TEXT_LENGTH) return 'メッセージが長すぎます'
    out.push({ role, text: text.trim() })
  }
  // 最後がコーチの発言のまま呼ぶことはない（次のAIの返答を求める形にならない）
  if (out.length > 0 && out[out.length - 1].role === 'coach') {
    return '生徒の返答を待ってから送ってください'
  }
  return out
}
