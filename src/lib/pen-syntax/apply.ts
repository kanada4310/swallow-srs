/**
 * 判別済みの記号を「構文の練習」の解答データ（SyntaxAnswer）へ反映する純ロジック。
 *
 * - 括弧: 開き→閉じの2画でまとまり（span）になる。開きだけの間は pendingOpens に保持
 * - 下線: 引いた範囲がそのまま ul の span になる
 * - 文字: 上の行=品詞、下の行=働きとして該当単語のマスに入る
 * - 波線（熟語の印）・○で囲んだ漢字（例外マーク）: 採点対象のデータ構造に対応が
 *   無いため extras として保持（画面には表示する。採点には数えない）
 * - 台帳から外れた形（?・ダッシュ・Ø・単語囲みの○）: 反映せず、書き方の案内を返す
 */

import type { SpanType, StudentSpan, SyntaxAnswer } from '@/lib/reading/syntax'
import type { ExceptionKanji, Lane, PenStroke, PosLetter, RoleLetter, SymbolId, TokenBox } from './types'
import { EXCEPTION_KANJI, POS_LETTERS, ROLE_LETTERS } from './types'
import { deprecatedGuidance } from './ledger'
import { strokesBBox } from './geometry'
import {
  laneOf,
  snapCloseBracket,
  snapHorizontalRange,
  snapNearestToken,
  snapOpenBracket,
} from './snap'

export interface PendingOpen {
  type: SpanType
  index: number
  /**
   * 開始カッコの真下に**閉じる前から**書けるまとまり全体の働き（2026-08-27）。
   * 閉じ括弧が来たときに span へ引き継ぐので、先に書いた働きは失われない。
   */
  role?: RoleLetter
}

export interface PenExtraMark {
  /** wavy=波線（熟語） / exception=○で囲んだ漢字の例外マーク */
  kind: 'wavy' | 'exception'
  /** exception のときの漢字（仮・真・強調・同格） */
  label?: ExceptionKanji
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
  /** 吸着した単語の範囲（計測用） */
  target?: { from: number; to: number }
}

export const OPEN_TO_SPAN: Partial<Record<SymbolId, SpanType>> = {
  'paren-open': 'adv',
  'square-open': 'n',
  'angle-open': 'adjm',
  'brace-open': 'comp',
}

export const CLOSE_TO_SPAN: Partial<Record<SymbolId, SpanType>> = {
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

function isExceptionKanji(s: SymbolId): s is ExceptionKanji {
  return (EXCEPTION_KANJI as readonly string[]).includes(s)
}

export function emptyPenAnnotation(answer: SyntaxAnswer): PenAnnotation {
  return { answer, pendingOpens: [], extras: [] }
}

/**
 * 記号の種類に応じた吸着先（単語の範囲）だけを計算する（計測ページ用）。
 * 解答への反映はせず、開き/閉じ括弧も単独で吸着先を返す。
 */
export function snapTargetFor(
  symbol: SymbolId,
  strokes: PenStroke[],
  boxes: TokenBox[],
): { from: number; to: number } | null {
  if (OPEN_TO_SPAN[symbol]) {
    const s = snapOpenBracket(strokes, boxes)
    return s ? { from: s.index, to: s.index } : null
  }
  if (CLOSE_TO_SPAN[symbol]) {
    const s = snapCloseBracket(strokes, boxes)
    return s ? { from: s.index, to: s.index } : null
  }
  if (symbol === 'hline' || symbol === 'wavy') {
    return snapHorizontalRange(strokes, boxes)
  }
  const s = snapNearestToken(strokes, boxes)
  return s ? { from: s.index, to: s.index } : null
}

/** 判別済みの記号1つを解答へ反映する */
export function applySymbol(
  state: PenAnnotation,
  symbol: SymbolId,
  strokes: PenStroke[],
  boxes: TokenBox[],
): ApplyOutcome {
  const lane: Lane = laneOf(strokes, boxes)

  // 台帳から外れた形は反映せず、書き方の案内を返す（記号の台帳・確定版）
  const guidance = deprecatedGuidance(symbol)
  if (guidance) {
    return { next: state, applied: false, message: guidance }
  }

  // ○で囲んだ漢字の例外マーク（仮・真・強調・同格）
  if (isExceptionKanji(symbol)) {
    const snap = snapNearestToken(strokes, boxes)
    if (!snap) return { next: state, applied: false, message: '吸着先の単語が見つかりません' }
    return {
      next: {
        ...state,
        extras: [...state.extras, { kind: 'exception', label: symbol, from: snap.index, to: snap.index }],
      },
      applied: true,
      target: { from: snap.index, to: snap.index },
    }
  }

  // 文字（群C）
  if (isPosLetter(symbol) || isRoleLetter(symbol)) {
    const snap = snapNearestToken(strokes, boxes)
    if (!snap) return { next: state, applied: false, message: '吸着先の単語が見つかりません' }
    if (isPosLetter(symbol)) {
      const pos = [...state.answer.pos]
      // 英字略記のまま保存する（採点側が漢字名の正解表と同値化する）
      pos[snap.index] = symbol
      return {
        next: { ...state, answer: { ...state.answer, pos } },
        applied: true,
        target: { from: snap.index, to: snap.index },
      }
    }
    // 開始カッコ（[・｛）の真下に書いた働きは、そのまとまり全体の働きとして付ける
    // （第7講 P8-S3 ほか「開始｛の下に C」の書き方・記号の台帳・確定版）
    if (lane === 'below') {
      const b = strokesBBox(strokes)
      const tokenBox = boxes.find((t) => t.index === snap.index)
      if (tokenBox && b.cx < tokenBox.left) {
        // まだ閉じていない開き括弧（書きかけ）を先に見る（2026-08-27）。
        // 「開いてすぐ下に働きを書く」書き順では、いま働きを付けたい相手は
        // 直前に書いた開き括弧であり、閉じ済みのまとまりではない。
        // 同じ位置に書きかけが複数あるときは最後に書いたもの＝内側に付ける。
        const pendingIdx = state.pendingOpens
          .map((p, i) => ({ p, i }))
          .filter(({ p }) => p.index === snap.index && (p.type === 'n' || p.type === 'comp'))
          .map(({ i }) => i)
          .pop()
        if (pendingIdx !== undefined) {
          const pendingOpens = state.pendingOpens.map((p, i) =>
            i === pendingIdx ? { ...p, role: symbol } : p,
          )
          return {
            next: { ...state, pendingOpens },
            applied: true,
            target: { from: snap.index, to: snap.index },
          }
        }
        const starts = state.answer.spans
          .map((s, i) => ({ s, i }))
          .filter(({ s }) => s.from === snap.index && (s.type === 'n' || s.type === 'comp'))
        if (starts.length > 0) {
          // 同じ位置から始まるまとまりが複数あるときは内側（短いほう）に付ける
          starts.sort((a, c) => a.s.to - a.s.from - (c.s.to - c.s.from))
          const target = starts[0]
          const spans = state.answer.spans.map((s, i) =>
            i === target.i ? { ...s, role: symbol } : s,
          )
          return {
            next: { ...state, answer: { ...state.answer, spans } },
            applied: true,
            target: { from: target.s.from, to: target.s.to },
          }
        }
      }
    }
    const role = [...state.answer.role]
    // 塾長の実書き込みの表記のまま保存する（Po・▷・P を言い換えない）
    role[snap.index] = symbol
    return {
      next: { ...state, answer: { ...state.answer, role } },
      applied: true,
      target: { from: snap.index, to: snap.index },
    }
  }

  // 開き括弧
  const openType = OPEN_TO_SPAN[symbol]
  if (openType) {
    const snap = snapOpenBracket(strokes, boxes)
    if (!snap) return { next: state, applied: false, message: '吸着先の単語が見つかりません' }
    return {
      next: { ...state, pendingOpens: [...state.pendingOpens, { type: openType, index: snap.index }] },
      applied: true,
      target: { from: snap.index, to: snap.index },
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
    // 開き括弧の下に先に書いた働きを、そのままこのまとまりへ引き継ぐ（失わない）
    const span: StudentSpan = open.role
      ? { from: open.index, to: snap.index, type: closeType, role: open.role }
      : { from: open.index, to: snap.index, type: closeType }
    const exists = state.answer.spans.some(
      (s) => s.from === span.from && s.to === span.to && s.type === span.type,
    )
    const spans = exists
      ? // 同じまとまりが既にあるときも、先に書いた働きは載せ替える
        state.answer.spans.map((s) =>
          open.role && s.from === span.from && s.to === span.to && s.type === span.type
            ? { ...s, role: open.role }
            : s,
        )
      : [...state.answer.spans, span]
    return {
      next: {
        ...state,
        pendingOpens,
        answer: { ...state.answer, spans },
      },
      applied: true,
      message: exists ? '同じまとまりが既にあります' : undefined,
      target: { from: span.from, to: span.to },
    }
  }

  // 横線: 下線（前置修飾のまとまり）。上の行の横線はダッシュの名残なので案内する
  if (symbol === 'hline') {
    const range = snapHorizontalRange(strokes, boxes)
    if (!range) return { next: state, applied: false, message: '吸着先の単語が見つかりません' }
    if (lane === 'above') {
      return {
        next: state,
        applied: false,
        message: 'ダッシュ（′）は書かなくてよくなりました。節・句の深さは括弧から自動で色分けされます',
      }
    }
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
      target: { from: span.from, to: span.to },
    }
  }

  // 波線＝熟語（慣用表現）の印。見た目のマークとして保持（採点対象外）
  if (symbol === 'wavy') {
    const range = snapHorizontalRange(strokes, boxes)
    if (!range) return { next: state, applied: false, message: '吸着先の単語が見つかりません' }
    return {
      next: { ...state, extras: [...state.extras, { kind: 'wavy', from: range.from, to: range.to }] },
      applied: true,
      target: { from: range.from, to: range.to },
    }
  }
  if (symbol === 'triangle') {
    // ▷ は従位接続詞の目印。働きの側（下の段）の記号で、表記も ▷ のまま
    const snap = snapNearestToken(strokes, boxes)
    if (!snap) return { next: state, applied: false, message: '吸着先の単語が見つかりません' }
    const role = [...state.answer.role]
    role[snap.index] = '▷'
    return {
      next: { ...state, answer: { ...state.answer, role } },
      applied: true,
      target: { from: snap.index, to: snap.index },
    }
  }

  return { next: state, applied: false, message: 'この記号にはまだ対応していません' }
}
