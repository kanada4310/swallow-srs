/**
 * 書いた画を「1つの記号」にまとめる判定（2026-08-27 書いている途中の記号が
 * まとまってしまう問題の解消）。
 *
 * 塾長の実機フィードバック:「書き込んでから読み取られて描画されるまでの間、
 * すべてが1つの記号として認識されてしまう」。原因は2つあった。
 *
 * 1. 確定が「最後の一画から 0.75 秒静止するまで」先送りされていた
 * 2. 場所の比較相手が「まとまりに入っている全画の外接箱」だったため、
 *    一度横に広い箱ができると、その内側に入る画が距離ゼロ扱いで吸い込まれた
 *
 * ここでは 2 を直す（1 は useStrokeGrouping が「境界をまたいだら待たずに確定」で直す）。
 * 場所の比較相手を**直前の1画**に変え、さらに単語の箱（TokenBox）と段（Lane）という
 * 画面の構造を使って「別の記号だと分かる根拠」を数える:
 *
 * - 行がちがう / 段（品詞・本文・働き）がちがう → 別の記号
 * - 直前の画との間で単語をまたいだ・別の単語のマスに入った → 別の記号
 * - 下線・波線のように1画で完結する横長の線には、続きの画を足さない
 * - まとまり全体が「記号1つ」としてありえない大きさになったら切る
 *
 * 逆に「同じ単語の同じ段で、直前の画のすぐそば」に書いている間は、いままでどおり
 * ひとまとめにする（○で囲んだ漢字・2画で書く S や V・括弧の書き直しを切らないため）。
 *
 * すべて純関数（テスト対象）。
 */

import type { Lane, PenPoint, PenStroke, TokenBox } from './types'
import { bbox, strokesBBox, type BBox } from './geometry'
import { groupLines, laneOf, pickLine, snapNearestToken, type LineBoxes } from './snap'

/** まとまりを切った理由（入力の記録・計測に出す） */
export type GroupBreakReason = 'time' | 'line' | 'lane' | 'rule' | 'token' | 'size' | 'far'

export const GROUP_BREAK_LABEL: Record<GroupBreakReason, string> = {
  time: '間があいた',
  line: '行がちがう',
  lane: '段がちがう',
  rule: '横長の線は1画で完結',
  token: '単語がちがう',
  size: '記号1つには大きすぎる',
  far: '直前の画から離れている',
}

export interface GroupingOptions {
  /** これ以上間があいたら別の記号（ms） */
  maxGapMs?: number
  /** 直前の画からこの距離以内なら、同じ記号の続きとみなす（px） */
  nearPx?: number
  /** 同じ段・同じ単語なら、この距離まで続きとみなす（px） */
  sameSlotGapPx?: number
  /**
   * 'end'  = 画を書き終えたときの判定（線の全体が分かる）
   * 'start'= ペンが触れた瞬間の判定（1点しか分からない。確信があるときだけ切る）
   */
  mode?: 'end' | 'start'
}

export const DEFAULT_GROUPING: Required<Omit<GroupingOptions, 'mode'>> = {
  maxGapMs: 900,
  nearPx: 12,
  sameSlotGapPx: 40,
}

/** 単語の箱の高さの代表値（本文1行の背丈。段の広さ・記号の大きさの基準にする） */
export function lineHeightOf(boxes: TokenBox[]): number {
  if (boxes.length === 0) return 28
  const hs = boxes.map((t) => t.bottom - t.top).sort((a, b) => a - b)
  return hs[Math.floor(hs.length / 2)] || 28
}

/**
 * 1画で完結する横長の線（下線・波線）か。
 * 記号の台帳のうち複数画になりうるのは、文字・○で囲んだ漢字・括弧の書き直しだけで、
 * どれも「単語の背丈におさまる小さな形」。横長の線に続きの画は無い。
 */
export function isSoloRuleStroke(stroke: PenStroke, boxes: TokenBox[]): boolean {
  if (stroke.length < 2) return false
  const b = bbox(stroke)
  const lh = lineHeightOf(boxes)
  return b.width >= lh * 1.2 && b.height <= lh * 0.4
}

/** 記号1つとしてありえる最大の大きさ（これを超えたら別の記号が混ざっている） */
function symbolLimits(boxes: TokenBox[]): { w: number; h: number } {
  const lh = lineHeightOf(boxes)
  return { w: Math.max(56, lh * 2.4), h: Math.max(44, lh * 1.8) }
}

/** 2つの外接箱のすき間（重なっていれば0） */
function gapOf(a: BBox, b: BBox): { x: number; y: number } {
  return {
    x: Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right)),
    y: Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom)),
  }
}

/**
 * 触れた瞬間の1点が、どの段に入るかを余裕（margin）つきで見る。
 * 括弧は本文の上端より少し上から書き始めるため、際どい位置は
 * 「どちらとも言えない（null）」にして、早すぎる打ち切りを避ける。
 */
export function laneOfPoint(p: PenPoint, boxes: TokenBox[], margin: number): Lane | null {
  if (boxes.length === 0) return null
  const top = Math.min(...boxes.map((t) => t.top))
  const bottom = Math.max(...boxes.map((t) => t.bottom))
  if (p.y < top - margin) return 'above'
  if (p.y > bottom + margin) return 'below'
  if (p.y > top + margin && p.y < bottom - margin) return 'band'
  return null
}

/**
 * 2つの線が「単語をまたいで」書かれているか（＝別の記号）。
 * 本文の帯に重なる線（括弧など）だけを見る。品詞・働きの段に書く文字は
 * 単語の真上・真下に来るので、ここでは単語をまたいだとは数えない
 * （2画で書く文字を切ってしまわないため）。
 */
function crossesToken(a: BBox, b: BBox, boxes: TokenBox[]): boolean {
  const lo = Math.min(a.right, b.right)
  const hi = Math.max(a.left, b.left)
  if (hi - lo <= 1) return false
  const top = Math.min(a.top, b.top)
  const bottom = Math.max(a.bottom, b.bottom)
  return boxes.some((t) => {
    const cx = (t.left + t.right) / 2
    if (cx <= lo || cx >= hi) return false
    // 単語の高さに重なっている線どうしのときだけ「またいだ」と数える
    return Math.min(bottom, t.bottom) - Math.max(top, t.top) > (t.bottom - t.top) * 0.3
  })
}

/**
 * 本文の帯に重なる線か（括弧のように単語の高さで書く記号）。
 * 帯に重なる記号は単語の端に付くものなので、近くても
 * 「付き先の単語がちがえば別の記号」と言い切れる（例: …）と［… が語間で隣り合う）。
 */
function overlapsBand(b: BBox, boxes: TokenBox[]): boolean {
  return boxes.some(
    (t) => Math.min(b.bottom, t.bottom) - Math.max(b.top, t.top) > (t.bottom - t.top) * 0.3,
  )
}

function timeOf(strokes: PenStroke[], pick: 'first' | 'last'): number | null {
  const ts = strokes
    .flat()
    .map((p) => p.t)
    .filter((t): t is number => typeof t === 'number')
  if (ts.length === 0) return null
  return pick === 'first' ? Math.min(...ts) : Math.max(...ts)
}

/**
 * 直前のまとまり（prev）に、新しい画（next）を足してよいか。
 * 足せないときは、その理由を返す（足せるときは null）。
 *
 * next は「触れた瞬間の1点だけ」でもよい（mode: 'start'）。その場合は
 * 線の形が分からないので、確信のある根拠だけで切る。
 */
export function groupBreakReason(
  prev: PenStroke[],
  next: PenStroke,
  boxes: TokenBox[] = [],
  opts: GroupingOptions = {},
): GroupBreakReason | null {
  const { maxGapMs, nearPx, sameSlotGapPx } = { ...DEFAULT_GROUPING, ...opts }
  const mode = opts.mode ?? 'end'
  if (prev.length === 0 || next.length === 0) return null

  // 1. 間があいた
  const lastT = timeOf(prev, 'last')
  const firstT = timeOf([next], 'first')
  if (lastT != null && firstT != null && firstT - lastT > maxGapMs) return 'time'

  const last = prev[prev.length - 1]
  const a = bbox(last)
  const b = bbox(next)
  const groupBox = strokesBBox(prev)

  let lineBoxes: TokenBox[] = boxes
  if (boxes.length > 0) {
    const lines: LineBoxes[] = groupLines(boxes)
    const prevLine = pickLine(prev, lines)
    const nextLine = pickLine([next], lines)
    // 2. 折り返した別の行に入った
    if (prevLine && nextLine && prevLine !== nextLine) return 'line'
    lineBoxes = (prevLine ?? nextLine)?.boxes ?? boxes

    // 3. 段（品詞・本文・働き）がちがう
    const prevLane = laneOf(prev, lineBoxes)
    const nextLane: Lane | null =
      mode === 'start'
        ? laneOfPoint(next[0], lineBoxes, Math.max(6, lineHeightOf(lineBoxes) * 0.3))
        : laneOf([next], lineBoxes)
    if (nextLane && prevLane !== nextLane) return 'lane'
  }

  // 4. 下線・波線は1画で完結する（続きの画を足さない）
  if (isSoloRuleStroke(last, lineBoxes)) return 'rule'
  if (mode === 'end' && isSoloRuleStroke(next, lineBoxes)) return 'rule'

  const gap = gapOf(a, b)
  const near = gap.x <= nearPx && gap.y <= nearPx * 1.5

  if (lineBoxes.length > 0) {
    // 5. 直前の画との間で単語をまたいだ（近くても別の記号）
    if (crossesToken(a, b, lineBoxes)) return 'token'
    // 6. 別の単語のマスに入った。本文の帯に重なる記号（括弧）は、近くても
    //    付き先の単語がちがえば別の記号として切る（品詞・働きの段の文字は
    //    2画目が隣の単語寄りになることがあるので、離れているときだけ見る）
    if (!near || (overlapsBand(a, lineBoxes) && overlapsBand(b, lineBoxes))) {
      const ta = snapNearestToken([last], lineBoxes)
      const tb = snapNearestToken([next], lineBoxes)
      if (ta && tb && ta.index !== tb.index) return 'token'
    }
    // 7. まとまり全体が記号1つとしてありえない大きさになる
    const lim = symbolLimits(lineBoxes)
    const w = Math.max(groupBox.right, b.right) - Math.min(groupBox.left, b.left)
    const h = Math.max(groupBox.bottom, b.bottom) - Math.min(groupBox.top, b.top)
    if (w > lim.w || h > lim.h) return 'size'
  }

  if (near) return null
  // 8. 同じ段・同じ単語でも、直前の画から離れすぎていれば別の記号
  if (gap.x <= sameSlotGapPx && gap.y <= sameSlotGapPx * 1.5) return null
  return 'far'
}

/** 2つの画をひとつの記号としてまとめて判別すべきか */
export function shouldGroupStrokes(
  prev: PenStroke[],
  next: PenStroke,
  boxes: TokenBox[] = [],
  opts: GroupingOptions = {},
): boolean {
  return groupBreakReason(prev, next, boxes, opts) === null
}

/* ---------- 旧方式（比較のためだけに残す） ---------- */

/**
 * 2026-08-26 までのまとめ判定。場所の比較相手が「まとまり全体の外接箱」なので、
 * 一度広がったまとまりが以降の画を吸い込んだ。**計測での比較にしか使わない。**
 */
export function legacyShouldGroupStrokes(
  prev: PenStroke[],
  next: PenStroke,
  opts?: { maxGapMs?: number; maxGapPx?: number },
): boolean {
  const maxGapMs = opts?.maxGapMs ?? 900
  const maxGapPx = opts?.maxGapPx ?? 40
  const prevPts = prev.flat()
  if (prevPts.length === 0 || next.length === 0) return false
  const lastT = Math.max(...prevPts.map((p) => p.t ?? 0))
  const firstT = next[0].t ?? lastT
  if (firstT - lastT > maxGapMs) return false
  const g = gapOf(strokesBBox(prev), bbox(next))
  return g.x <= maxGapPx && g.y <= maxGapPx * 1.5
}

/* ---------- 確定までの時間の計測（模擬） ---------- */

/** 確定1件ぶんの記録 */
export interface CommitEvent {
  /** 何番目のまとまりか（0始まり） */
  index: number
  /** そのまとまりに入った画の本数 */
  strokes: number
  /** 確定した時刻（入力の時刻と同じものさし） */
  at: number
  /** 最後の一画を書き終えてから確定するまで（ms） */
  afterLastStrokeMs: number
  /**
   * 次の記号を書き始めてから、前の記号が確定するまで（ms）。
   * ＝「もう次を書いているのに、前の記号がまだ確定しない時間」。次が無ければ null。
   */
  waitAfterNextStartMs: number | null
  reason: 'boundary-start' | 'boundary-end' | 'timer' | 'flush'
}

export interface SimulateOptions extends GroupingOptions {
  /** 静止してから確定するまでの待ち時間（ms） */
  waitMs?: number
  /** 触れた瞬間に境界を見て、待たずに確定するか（新方式=true） */
  early?: boolean
  /** 旧方式（まとまり全体の外接箱で場所を比べる）で動かす */
  legacy?: boolean
}

/**
 * 画の並び（時刻つき）を流し込み、各まとまりが「いつ確定するか」を計算する。
 * 実機のペンで測った値ではなく、入力の時刻から確定の時刻を求める模擬計算。
 */
export function simulateCommits(
  strokes: PenStroke[],
  boxes: TokenBox[],
  opts: SimulateOptions = {},
): CommitEvent[] {
  const waitMs = opts.waitMs ?? 750
  const early = opts.early ?? true
  const legacy = opts.legacy ?? false
  const out: CommitEvent[] = []
  let pending: PenStroke[] = []
  let index = 0

  const startOf = (s: PenStroke) => timeOf([s], 'first') ?? 0
  const endOf = (s: PenStroke) => timeOf([s], 'last') ?? 0

  const commit = (at: number, reason: CommitEvent['reason'], nextStart: number | null) => {
    if (pending.length === 0) return
    const lastEnd = endOf(pending[pending.length - 1])
    out.push({
      index: index++,
      strokes: pending.length,
      at,
      afterLastStrokeMs: at - lastEnd,
      waitAfterNextStartMs: nextStart == null ? null : Math.max(0, at - nextStart),
      reason,
    })
    pending = []
  }

  for (const stroke of strokes) {
    const s = startOf(stroke)
    if (pending.length > 0) {
      const lastEnd = endOf(pending[pending.length - 1])
      if (s - lastEnd >= waitMs) {
        // 書き始める前に待ち時間が過ぎていた（もう確定している）
        commit(lastEnd + waitMs, 'timer', s)
      } else {
        const breakAtStart =
          !legacy &&
          early &&
          groupBreakReason(pending, [stroke[0]], boxes, { ...opts, mode: 'start' }) !== null
        if (breakAtStart) {
          commit(s, 'boundary-start', s)
        } else {
          const grouped = legacy
            ? legacyShouldGroupStrokes(pending, stroke)
            : shouldGroupStrokes(pending, stroke, boxes, { ...opts, mode: 'end' })
          if (!grouped) commit(endOf(stroke), 'boundary-end', s)
        }
      }
    }
    pending.push(stroke)
  }
  if (pending.length > 0) {
    const lastEnd = endOf(pending[pending.length - 1])
    commit(lastEnd + waitMs, 'timer', null)
  }
  return out
}
