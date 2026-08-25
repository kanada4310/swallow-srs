/**
 * 判別済みの記号を「素振り」の解答データ（SyntaxAnswer）へ反映する純ロジック。
 *
 * - 括弧: 開き→閉じの2画でまとまり（span）になる。開きだけの間は pendingOpens に保持
 * - 下線: 引いた範囲がそのまま ul の span になる
 * - 文字: 上の行=品詞、下の行=働きとして該当単語のマスに入る
 * - ○囲み・波線・?・ダッシュ・Ø: 採点対象のデータ構造に対応が無いため extras として保持
 *   （画面には表示する。素振りの採点には数えない）
 */

import type { SpanType, SyntaxAnswer } from '@/lib/reading/syntax'
import type { Lane, PenStroke, PosLetter, RoleLetter, SymbolId, TokenBox } from './types'
import { POS_LETTERS, ROLE_LETTERS } from './types'
import { posLetterToAppPos, roleLetterToAppRole } from './letters'
import {
  laneOf,
  snapCloseBracket,
  snapEnclosedRange,
  snapHorizontalRange,
  snapNearestToken,
  snapOpenBracket,
} from './snap'

export interface PendingOpen {
  type: SpanType
  index: number
}

export interface PenExtraMark {
  kind: 'circle' | 'wavy' | 'question' | 'null-sign' | 'tick' | 'slash' | 'dash'
  from: number
  to: number
}

export interface PenAnnotation {
  answer: SyntaxAnswer
  pendingOpens: PendingOpen[]
  extras: PenExtraMark[]
}

export interface ApplyOutcome {
  next: PenAnnotation
  /** 反映できなかった・注意が要るときの短い説明（UI がそのまま出す） */
  message?: string
  applied: boolean
}

const OPEN_TO_SPAN: Partial<Record<SymbolId, SpanType>> = {
  'paren-open': 'adv',
  'square-open': 'n',
  'angle-open': 'adjm',
  'brace-open': 'comp',
}

const CLOSE_TO_SPAN: Partial<Record<SymbolId, SpanType>> = {
  'paren-close': 'adv',
  'square-close': 'n',
  'angle-close': 'adjm',
  'brace-close': 'comp',
}

function isPosLetter(s: SymbolId): s is PosLetter {
  return (POS_LETTERS as readonly string[]).includes(s)
}

function isRoleLetter(s: SymbolId): s is RoleLetter {
  return (ROLE_LETTERS as readonly string[]).includes(s)
}

export function emptyPenAnnotation(answer: SyntaxAnswer): PenAnnotation {
  return { answer, pendingOpens: [], extras: [] }
}

/** 判別済みの記号1つを解答へ反映する */
export function applySymbol(
  state: PenAnnotation,
  symbol: SymbolId,
  strokes: PenStroke[],
  boxes: TokenBox[],
): ApplyOutcome {
  const lane: Lane = laneOf(strokes, boxes)

  // 文字（群C）
  if (isPosLetter(symbol) || isRoleLetter(symbol)) {
    const snap = snapNearestToken(strokes, boxes)
    if (!snap) return { next: state, applied: false, message: '吸着先の単語が見つかりません' }
    if (isPosLetter(symbol)) {
      const pos = [...state.answer.pos]
      pos[snap.index] = posLetterToAppPos(symbol)
      return { next: { ...state, answer: { ...state.answer, pos } }, applied: true }
    }
    const role = [...state.answer.role]
    role[snap.index] = roleLetterToAppRole(symbol)
    return { next: { ...state, answer: { ...state.answer, role } }, applied: true }
  }

  // 開き括弧
  const openType = OPEN_TO_SPAN[symbol]
  if (openType) {
    const snap = snapOpenBracket(strokes, boxes)
    if (!snap) return { next: state, applied: false, message: '吸着先の単語が見つかりません' }
    return {
      next: { ...state, pendingOpens: [...state.pendingOpens, { type: openType, index: snap.index }] },
      applied: true,
    }
  }

  // 閉じ括弧: 同じ種類の開き括弧と組にする
  const closeType = CLOSE_TO_SPAN[symbol]
  if (closeType) {
    const snap = snapCloseBracket(strokes, boxes)
    if (!snap) return { next: state, applied: false, message: '吸着先の単語が見つかりません' }
    const idx = [...state.pendingOpens]
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.type === closeType && p.index <= snap.index)
      .map(({ i }) => i)
      .pop()
    if (idx === undefined) {
      return {
        next: state,
        applied: false,
        message: '対応する開き括弧がまだ書かれていません（先に開き括弧を書いてください）',
      }
    }
    const open = state.pendingOpens[idx]
    const pendingOpens = state.pendingOpens.filter((_, i) => i !== idx)
    const span = { from: open.index, to: snap.index, type: closeType }
    const exists = state.answer.spans.some(
      (s) => s.from === span.from && s.to === span.to && s.type === span.type,
    )
    return {
      next: {
        ...state,
        pendingOpens,
        answer: exists
          ? state.answer
          : { ...state.answer, spans: [...state.answer.spans, span] },
      },
      applied: true,
      message: exists ? '同じまとまりが既にあります' : undefined,
    }
  }

  // 横線: 本文の行なら下線（前置修飾のまとまり）、それ以外はダッシュ扱い
  if (symbol === 'hline') {
    const range = snapHorizontalRange(strokes, boxes)
    if (!range) return { next: state, applied: false, message: '吸着先の単語が見つかりません' }
    if (lane !== 'above') {
      const span = { from: range.from, to: range.to, type: 'ul' as SpanType }
      const exists = state.answer.spans.some(
        (s) => s.from === span.from && s.to === span.to && s.type === span.type,
      )
      return {
        next: {
          ...state,
          answer: exists ? state.answer : { ...state.answer, spans: [...state.answer.spans, span] },
        },
        applied: true,
        message: exists ? '同じ下線が既にあります' : undefined,
      }
    }
    return {
      next: { ...state, extras: [...state.extras, { kind: 'dash', from: range.from, to: range.to }] },
      applied: true,
    }
  }

  // ○囲み・波線・?・Ø・ダッシュ・斜線: 見た目のマークとして保持（採点対象外）
  if (symbol === 'circle' || symbol === 'wavy') {
    const range = symbol === 'circle' ? snapEnclosedRange(strokes, boxes) : snapHorizontalRange(strokes, boxes)
    if (!range) return { next: state, applied: false, message: '吸着先の単語が見つかりません' }
    return {
      next: { ...state, extras: [...state.extras, { kind: symbol, from: range.from, to: range.to }] },
      applied: true,
    }
  }
  if (symbol === 'question' || symbol === 'null-sign' || symbol === 'tick' || symbol === 'slash') {
    const snap = snapNearestToken(strokes, boxes)
    if (!snap) return { next: state, applied: false, message: '吸着先の単語が見つかりません' }
    return {
      next: {
        ...state,
        extras: [...state.extras, { kind: symbol, from: snap.index, to: snap.index }],
      },
      applied: true,
    }
  }
  if (symbol === 'triangle') {
    // ▷ は従位接続詞の目印＝働きの「接」
    const snap = snapNearestToken(strokes, boxes)
    if (!snap) return { next: state, applied: false, message: '吸着先の単語が見つかりません' }
    const role = [...state.answer.role]
    role[snap.index] = '接'
    return { next: { ...state, answer: { ...state.answer, role } }, applied: true }
  }

  return { next: state, applied: false, message: 'この記号にはまだ対応していません' }
}
