/**
 * 判別済みの記号を「構文の練習」の解答データ（SyntaxAnswer）へ反映する純ロジック。
 *
 * - 括弧: 開き→閉じの2画でまとまり（span）になる。開きだけの間は pendingOpens に保持
 * - 下線: 引いた範囲がそのまま ul の span になる
 * - 文字: 上の行=品詞、下の行=働きとして該当単語のマスに入る
 * - 波線（熟語の印）と例外の印のうち仮・真・強: 正解表に定義が無い（模範分析集の
 *   取り込みでも全て「落とした印」）ため extras として保持（画面には表示する。
 *   採点には数えない）。表示位置は働きの欄（roleCellParts が1マスぶんに組み立てる）
 * - 例外の印のうち「同」（同格）: 働きの値として answer.role に入る＝**採点される**
 *   （正解表に働き「同格」の定義が実在し、roleBase の別名で「同」と同値。
 *   2026-08-31 に入力経路による扱いの割れを一本化した。仮・真・強を extras に
 *   寄せるのは、強が V などの働きと同じ単語に共存するため働きの欄を奪えないから）
 * - 台帳から外れた形（?・ダッシュ・Ø・単語囲みの○）: 反映せず、書き方の案内を返す
 */

import { isPunct, type SpanType, type StudentSpan, type SyntaxAnswer } from '@/lib/reading/syntax'
import type { ExceptionKanji, Lane, PenStroke, PosLetter, RoleLetter, SymbolId, TokenBox } from './types'
import { EXCEPTION_KANJI, POS_LETTERS, ROLE_LETTERS } from './types'
import { deprecatedGuidance } from './ledger'
import { strokesBBox } from './geometry'
import {
  groupLines,
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
   * 働きの文字のほか「同」（同格のまとまり）も入る（2026-08-31）。
   */
  role?: string
}

export interface PenExtraMark {
  /** wavy=波線（熟語） / exception=○で囲んだ漢字の例外マーク */
  kind: 'wavy' | 'exception'
  /** exception のときの漢字1字（仮・真・強・同） */
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

/**
 * 単語の左のすき間（＝開始カッコの列）に書かれた働きの、付け先を探す。
 *
 * 対象は [ ] と ｛ ｝ の開始位置（閉じ待ち・閉じ済みの両方）。
 * 「その単語の左端より左」かつ「左どなりの単語の右端より右」＝カッコの列に
 * 書いた、と判定する（実測でカッコの列は12画素ほどしかないため、狙いのぶれを
 * 見込んで前後に BRACKET_ROLE_SLOP を足す）。折り返しの行頭など左どなりが
 * 無い場合は、括弧1文字ぶんの見込み（BRACKET_ROLE_MAX_DX）までを認める。
 * 選び方: 書きかけ（閉じ待ち）を先に、そのうち後に書いたものを先に。
 * 閉じ済み同士は内側（短いまとまり）を先に。
 */
const BRACKET_ROLE_MAX_DX = 40
const BRACKET_ROLE_SLOP = 6
/**
 * 縦の見込み（単語の高さの何倍まで下を「その行の働きの段」とみなすか）。
 * 文が折り返しているとき、上の行のカッコに吸われないための歯止め
 * （2026-08-27 の審査の指摘。横位置しか見ていなかった）。
 */
const BRACKET_ROLE_MAX_DY_RATIO = 1.5

interface BracketRoleTarget {
  tokenIndex: number
  /** state.pendingOpens の位置（閉じ待ちに付けるとき） */
  pending?: number
  /** state.answer.spans の位置（閉じ済みに付けるとき） */
  span?: number
}

function findBracketRoleTarget(
  state: PenAnnotation,
  boxes: TokenBox[],
  cx: number,
  cy: number,
): BracketRoleTarget | null {
  const candidates: Array<BracketRoleTarget & { rank: number; width: number }> = []
  state.pendingOpens.forEach((p, i) => {
    if (p.type === 'n' || p.type === 'comp') {
      candidates.push({ tokenIndex: p.index, pending: i, rank: 0, width: -i })
    }
  })
  state.answer.spans.forEach((sp, i) => {
    if (sp.type === 'n' || sp.type === 'comp') {
      candidates.push({ tokenIndex: sp.from, span: i, rank: 1, width: sp.to - sp.from })
    }
  })
  const usable = candidates.filter((c) => {
    const box = boxes.find((t) => t.index === c.tokenIndex)
    if (!box) return false
    // 縦: そのカッコと同じ行の「働きの段」に書かれていること
    // （折り返しのある文で、別の行のカッコに吸われないための歯止め）
    const height = box.bottom - box.top
    if (cy <= box.top || cy > box.bottom + height * BRACKET_ROLE_MAX_DY_RATIO) return false
    // 横: その単語の左端より左（＝カッコの列）で、左どなりの単語より右
    if (cx >= box.left + BRACKET_ROLE_SLOP) return false
    const prev = boxes
      .filter((t) => t.right <= box.left && Math.abs(t.top - box.top) < height * 0.6)
      .sort((a, b) => b.right - a.right)[0]
    return prev ? cx >= prev.right - BRACKET_ROLE_SLOP : box.left - cx <= BRACKET_ROLE_MAX_DX
  })
  if (usable.length === 0) return null
  usable.sort((a, b) => a.rank - b.rank || a.width - b.width)
  const best = usable[0]
  return { tokenIndex: best.tokenIndex, pending: best.pending, span: best.span }
}

/* ---------- 働き欄の表示（働きの文字＋○で囲んだ例外マーク） ---------- */

/**
 * 働きと組んで1つの値になる例外マーク（「仮S」「真S」のように書く）。
 * 残り（強・同）は単独で1マスを占める（2026-08-26 塾長裁定）。
 */
export const COMBINING_EXCEPTIONS: readonly ExceptionKanji[] = ['仮', '真']

export interface RoleCellParts {
  /** 働きの前に出す例外マーク（仮・真）。○で囲んで描く */
  before: ExceptionKanji[]
  /** 単独で1マスを占める例外マーク（強・同）。○で囲んで描く */
  alone: ExceptionKanji[]
  /** 働きの文字（S・V・O…） */
  value: string | null
  /** 1マスぶんの表示テキスト（「仮S」「同」など） */
  text: string
  /** 何も書かれていない（マスに「・」を出す） */
  empty: boolean
}

/**
 * 働き欄の1マスに出す内容を組み立てる（表示用の純関数）。
 *
 * ○で囲んだ例外マークは、単語の右肩ではなく**働きの欄**に置く（2026-08-27 塾長指示）。
 * 1マスは1値だが、仮・真は働きと組んだ1つの値（仮S）になり、強・同は単独で
 * 1マスを占めるため衝突しない。
 * **並びは台帳の順で決めるので、書いた順序が違っても同じ結果になる。**
 */
export function roleCellParts(role: string | null, extras: PenExtraMark[]): RoleCellParts {
  const found = new Set(
    extras.filter((x) => x.kind === 'exception' && x.label).map((x) => x.label as ExceptionKanji),
  )
  // 並びは台帳（EXCEPTION_KANJI）の順で決める＝書いた順序に左右されない
  const marks = EXCEPTION_KANJI.filter((k) => found.has(k))
  const before = marks.filter((k) => COMBINING_EXCEPTIONS.includes(k))
  const alone = marks.filter((k) => !COMBINING_EXCEPTIONS.includes(k))
  const text = `${before.join('')}${role ?? ''}${alone.join('')}`
  return { before, alone, value: role, text, empty: text === '' }
}

/* ---------- 例外の印の選択式の付け外し（2026-08-31・○囲みの手書き認識の廃止） ---------- */

/**
 * タッチで付け外しできる例外の印。「同」は働きの値（answer.role）なのでここに無い。
 * 入力経路によらずこの3つは extras（採点対象外）、「同」は role（採点対象）に入る。
 */
export const TOGGLE_EXCEPTIONS: readonly ExceptionKanji[] = ['仮', '真', '強']

/** 仮・真を付けられる働きか（判定済みの S / O にだけ後から付ける・2026-08-31 確定仕様） */
export function canMarkKariShin(role: string | null): boolean {
  return role === 'S' || role === 'O'
}

/**
 * 例外の印（仮・真・強）をその単語に付ける・外す（トグル）。
 * 仮と真は同じ単語に同時に付かない（仮主語と真主語は別の単語）ので、
 * 仮を付けると真が外れる（逆も同じ）。
 */
export function toggleExceptionMark(
  state: PenAnnotation,
  label: ExceptionKanji,
  index: number,
): PenAnnotation {
  const at = (x: PenExtraMark) => x.kind === 'exception' && x.from === index && x.to === index
  const had = state.extras.some((x) => at(x) && x.label === label)
  const rival = COMBINING_EXCEPTIONS.includes(label)
    ? COMBINING_EXCEPTIONS.find((k) => k !== label)
    : undefined
  const extras = state.extras.filter(
    (x) => !(at(x) && (x.label === label || (!had && x.label === rival))),
  )
  if (!had) extras.push({ kind: 'exception', label, from: index, to: index })
  return { ...state, extras }
}

/**
 * 働きの値が変わったあとの例外の印の整合。仮・真は S / O に付ける印なので、
 * その単語の働きが S / O でなくなったら外す（強はどの働きとも共存できるので残す）。
 */
export function pruneExceptionMarks(
  extras: PenExtraMark[],
  index: number,
  role: string | null,
): PenExtraMark[] {
  if (canMarkKariShin(role)) return extras
  return extras.filter(
    (x) =>
      !(
        x.kind === 'exception' &&
        x.from === index &&
        x.to === index &&
        COMBINING_EXCEPTIONS.includes(x.label as ExceptionKanji)
      ),
  )
}

/** applySymbol の追加情報（無くても動く。あると付け替え・連結が効く） */
export interface ApplyOptions {
  /** 単語の文字列（句読点の見分けに使う。省略時は句読点を考慮しない） */
  tokens?: string[]
  /** 文全体（全行ぶん）の単語箱。行またぎ下線の連結に使う（省略時は連結しない） */
  allBoxes?: TokenBox[]
}

/**
 * 働きの記号の付け先。吸着した単語が既存の下線の塊の中なら、
 * **塊の最後の単語**（末尾の句読点は除く）に付け替える（2026-08-31 確定仕様2。
 * 下線の塊＝1つのまとまりなので、どの単語の下に書いても働きは塊に付く）。
 * 塊が複数重なるときは、最後の単語がいちばん後ろのものを塊とみなす。
 */
export function roleTargetIndex(
  state: PenAnnotation,
  index: number,
  tokens?: string[],
): number {
  const uls = state.answer.spans.filter((s) => s.type === 'ul' && s.from <= index && index <= s.to)
  if (uls.length === 0) return index
  const span = uls.reduce((a, b) => (b.to > a.to ? b : a))
  let to = span.to
  while (to > span.from && tokens && isPunct(tokens[to] ?? '')) to--
  return to
}

/**
 * 行をまたぐ下線の連結（2026-08-31 確定仕様4）。
 *
 * 次の3条件がそろったときだけ、書いたばかりの下線を前の行の下線とひとつながりの
 * 塊にする（別々の塊をうっかりつなげないための条件・塾長確定）:
 * 1. 前の行の末尾まで下線が達している（末尾の句読点は無視）
 * 2. その下線にまだ働きが書かれていない（塊の最後の単語の働きの欄が空）
 * 3. 新しい下線がその行の行頭から始まっている（行頭の句読点は無視）
 *
 * 行末・行頭の許容誤差は**語単位**（句読点のみ無視）。ペンの横位置のぶれは
 * 吸着（snapHorizontalRange の35%重なり）が先に吸収しているので、
 * 画素単位のしきい値は持たない。合わなければ従来どおり別の下線になる。
 * 連結の判定は書いた順（前の行→次の行）のみ（逆順の書き方は連結しない）。
 */
function mergeWithPreviousLineUnderline(
  state: PenAnnotation,
  range: { from: number; to: number },
  opts: ApplyOptions,
): ApplyOutcome | null {
  const { allBoxes, tokens } = opts
  if (!allBoxes || allBoxes.length === 0) return null
  const lines = groupLines(allBoxes)
  const li = lines.findIndex((l) => l.boxes.some((b) => b.index === range.from))
  if (li <= 0) return null
  const cur = lines[li]
  const prev = lines[li - 1]
  const isP = (i: number) => (tokens ? isPunct(tokens[i] ?? '') : false)
  // 条件3: 行頭から始まっている
  if (cur.boxes.some((b) => b.index < range.from && !isP(b.index))) return null
  // 条件1: 前の行の末尾まで達している下線
  const prevIdx = new Set(prev.boxes.map((b) => b.index))
  const candidates = state.answer.spans
    .map((s, i) => ({ s, i }))
    .filter(
      ({ s }) =>
        s.type === 'ul' &&
        prevIdx.has(s.to) &&
        prev.boxes.every((b) => b.index <= s.to || isP(b.index)),
    )
  if (candidates.length === 0) return null
  const target = candidates.reduce((a, b) => (b.s.to > a.s.to ? b : a))
  // 条件2: その下線にまだ働きが書かれていない
  let roleAt = target.s.to
  while (roleAt > target.s.from && isP(roleAt)) roleAt--
  if (state.answer.role[roleAt] != null) return null
  const spans = state.answer.spans.map((s, i) => (i === target.i ? { ...s, to: range.to } : s))
  return {
    next: { ...state, answer: { ...state.answer, spans } },
    applied: true,
    message: '前の行の下線とつなげて、ひとつながりの塊にしました',
    target: { from: target.s.from, to: range.to },
  }
}

/** 判別済みの記号1つを解答へ反映する */
export function applySymbol(
  state: PenAnnotation,
  symbol: SymbolId,
  strokes: PenStroke[],
  boxes: TokenBox[],
  opts: ApplyOptions = {},
): ApplyOutcome {
  const lane: Lane = laneOf(strokes, boxes)

  // 台帳から外れた形は反映せず、書き方の案内を返す（記号の台帳・確定版）
  const guidance = deprecatedGuidance(symbol)
  if (guidance) {
    return { next: state, applied: false, message: guidance }
  }

  // 例外の印のうち仮・真・強（採点対象外）。表示は働きの欄（roleCellParts）。
  // 「同」はここを通らない（働きの値として下の文字の枝で answer.role に入る＝採点される）
  if (isExceptionKanji(symbol) && symbol !== '同') {
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

  // 文字（群C）＋「同」（同格＝働きの値）
  if (isPosLetter(symbol) || isRoleLetter(symbol) || symbol === '同') {
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
    // （第7講 P8-S3 ほか「開始｛の下に C」の書き方・記号の台帳・確定版）。
    // 判定は「単語のすき間（＝カッコの列）に書いたか」で行う。吸着した単語で
    // 決めると、カッコの真下は左どなりの単語のほうが中心に近いことがあり、
    // 黙って単語の働きへ落ちてしまう（2026-08-27 実ブラウザで確認）
    if (lane === 'below') {
      const b = strokesBBox(strokes)
      const hit = findBracketRoleTarget(state, boxes, b.cx, b.cy)
      if (hit && hit.pending !== undefined) {
        const pendingOpens = state.pendingOpens.map((p, i) =>
          i === hit.pending ? { ...p, role: symbol } : p,
        )
        return {
          next: { ...state, pendingOpens },
          applied: true,
          target: { from: hit.tokenIndex, to: hit.tokenIndex },
        }
      }
      if (hit && hit.span !== undefined) {
        const target = state.answer.spans[hit.span]
        const spans = state.answer.spans.map((s, i) => (i === hit.span ? { ...s, role: symbol } : s))
        return {
          next: { ...state, answer: { ...state.answer, spans } },
          applied: true,
          target: { from: target.from, to: target.to },
        }
      }
    }
    const role = [...state.answer.role]
    // 下線の塊の中に書いた働きは、塊の最後の単語に付け替える（2026-08-31 確定仕様2）
    const at = roleTargetIndex(state, snap.index, opts.tokens)
    // 塾長の実書き込みの表記のまま保存する（Po・▷・P を言い換えない）
    role[at] = symbol
    return {
      next: { ...state, answer: { ...state.answer, role } },
      applied: true,
      target: { from: at, to: at },
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
    // 行またぎの連結（3条件がそろったときだけ・確定仕様4）
    const merged = mergeWithPreviousLineUnderline(state, range, opts)
    if (merged) return merged
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
    // 働きの記号なので、下線の塊の中なら塊の最後の単語に付く（確定仕様2）
    const at = roleTargetIndex(state, snap.index, opts.tokens)
    role[at] = '▷'
    return {
      next: { ...state, answer: { ...state.answer, role } },
      applied: true,
      target: { from: at, to: at },
    }
  }

  return { next: state, applied: false, message: 'この記号にはまだ対応していません' }
}
