/**
 * 書いた線を単語の位置に吸着させる。
 *
 * 単語の箱（TokenBox）はコンテナ相対の画面座標で受け取り、
 * 記号の種類ごとに「どの単語（の前後・範囲）に付くか」を決める。
 */

import type { Lane, PenStroke, TokenBox } from './types'
import { strokesBBox } from './geometry'

/** 文が折り返して複数行になったときの1行ぶんの単語箱 */
export interface LineBoxes {
  top: number
  bottom: number
  boxes: TokenBox[]
}

/** 単語箱を表示上の行ごとにまとめる（top の近さでまとめる） */
export function groupLines(boxes: TokenBox[]): LineBoxes[] {
  const sorted = [...boxes].sort((a, b) => a.top - b.top || a.left - b.left)
  const lines: LineBoxes[] = []
  for (const t of sorted) {
    const line = lines.find((l) => Math.abs(l.top - t.top) < (t.bottom - t.top) * 0.6)
    if (line) {
      line.boxes.push(t)
      line.top = Math.min(line.top, t.top)
      line.bottom = Math.max(line.bottom, t.bottom)
    } else {
      lines.push({ top: t.top, bottom: t.bottom, boxes: [t] })
    }
  }
  return lines
}

/** 線の重心に一番近い行を選ぶ（吸着・行判定はその行の単語箱だけで行う） */
export function pickLine(strokes: PenStroke[], lines: LineBoxes[]): LineBoxes | null {
  if (lines.length === 0) return null
  const b = strokesBBox(strokes)
  let best: LineBoxes | null = null
  let bestD = Infinity
  for (const line of lines) {
    const cy = (line.top + line.bottom) / 2
    const d = Math.abs(b.cy - cy)
    if (d < bestD) {
      bestD = d
      best = line
    }
  }
  return best
}

/** 線の重心の縦位置から、どの行（上=品詞/本文/下=働き）に書かれたかを決める */
export function laneOf(strokes: PenStroke[], boxes: TokenBox[]): Lane {
  if (boxes.length === 0) return 'band'
  const b = strokesBBox(strokes)
  const top = Math.min(...boxes.map((t) => t.top))
  const bottom = Math.max(...boxes.map((t) => t.bottom))
  if (b.cy < top) return 'above'
  if (b.cy > bottom) return 'below'
  return 'band'
}

export interface SnapPoint {
  index: number
  /** 吸着先までの水平距離（px）。計測で精度を数えるのに使う */
  distance: number
}

/**
 * 括弧の吸着は「単語の中央」を境界にして決める（2026-09-01 項目4）。
 *
 * 従来は「一番近い単語の端」へ吸着していたため、同じすき間に閉じ括弧を重ねて
 * 書いたり、すき間が狭くて次の単語に少し食い込んで書いたりすると、
 * 付く位置が1語ぶん前後した（検討会・論点1の症状3）。
 * 「中心が単語の真ん中を越えるまでは前のすき間の括弧」と決めれば、
 * 同じすき間に書いた括弧は何個でも・多少食い込んでも同じ単語に付く。
 */

const centerOf = (t: TokenBox) => (t.left + t.right) / 2

/** 開き括弧: 中心より右に真ん中がある最初の単語の**前**に付く */
export function snapOpenBracket(strokes: PenStroke[], boxes: TokenBox[]): SnapPoint | null {
  if (boxes.length === 0) return null
  const b = strokesBBox(strokes)
  const sorted = [...boxes].sort((x, y) => x.left - y.left)
  const next = sorted.find((t) => centerOf(t) >= b.cx) ?? sorted[sorted.length - 1]
  return { index: next.index, distance: Math.abs(next.left - b.cx) }
}

/** 閉じ括弧: 中心より左に真ん中がある最後の単語の**後ろ**に付く */
export function snapCloseBracket(strokes: PenStroke[], boxes: TokenBox[]): SnapPoint | null {
  if (boxes.length === 0) return null
  const b = strokesBBox(strokes)
  const sorted = [...boxes].sort((x, y) => x.left - y.left)
  const prevs = sorted.filter((t) => centerOf(t) <= b.cx)
  const prev = prevs.length > 0 ? prevs[prevs.length - 1] : sorted[0]
  return { index: prev.index, distance: Math.abs(prev.right - b.cx) }
}

export interface SnapRange {
  from: number
  to: number
}

/** 下線・波線: 横に重なっている単語の範囲へ吸着 */
export function snapHorizontalRange(strokes: PenStroke[], boxes: TokenBox[]): SnapRange | null {
  if (boxes.length === 0) return null
  const b = strokesBBox(strokes)
  const covered = boxes.filter((t) => {
    const overlap = Math.min(b.right, t.right) - Math.max(b.left, t.left)
    return overlap > Math.min(t.right - t.left, 1) * 0.35
  })
  if (covered.length === 0) {
    // どの単語にも十分重なっていない: 一番近い単語1語に付ける
    const nearest = snapNearestToken(strokes, boxes)
    return nearest ? { from: nearest.index, to: nearest.index } : null
  }
  return {
    from: Math.min(...covered.map((t) => t.index)),
    to: Math.max(...covered.map((t) => t.index)),
  }
}

/** ○囲み: 円の中に中心が入っている単語の範囲へ吸着 */
export function snapEnclosedRange(strokes: PenStroke[], boxes: TokenBox[]): SnapRange | null {
  if (boxes.length === 0) return null
  const b = strokesBBox(strokes)
  const inside = boxes.filter((t) => {
    const cx = (t.left + t.right) / 2
    const cy = (t.top + t.bottom) / 2
    return cx >= b.left && cx <= b.right && cy >= b.top - 4 && cy <= b.bottom + 4
  })
  if (inside.length === 0) {
    const nearest = snapNearestToken(strokes, boxes)
    return nearest ? { from: nearest.index, to: nearest.index } : null
  }
  return {
    from: Math.min(...inside.map((t) => t.index)),
    to: Math.max(...inside.map((t) => t.index)),
  }
}

/** 文字・その他: 横方向に一番近い単語1語へ吸着 */
export function snapNearestToken(strokes: PenStroke[], boxes: TokenBox[]): SnapPoint | null {
  if (boxes.length === 0) return null
  const b = strokesBBox(strokes)
  let best: SnapPoint | null = null
  for (const t of boxes) {
    const cx = (t.left + t.right) / 2
    // 箱の横幅の中に入っていれば距離0扱い
    const d = b.cx >= t.left && b.cx <= t.right ? 0 : Math.min(Math.abs(cx - b.cx), Math.abs(t.left - b.cx), Math.abs(t.right - b.cx))
    if (!best || d < best.distance) best = { index: t.index, distance: d }
  }
  return best
}

/** 下線の表示用の連結線分（コンテナ相対座標） */
export interface UnderlineSegment {
  left: number
  right: number
  /** 線を引く縦位置（文字のベースラインのすぐ下） */
  y: number
}

/**
 * 下線のまとまり（from〜to）を、単語の間で途切れない連結線分にする（表示用）。
 * 文が折り返して複数行にまたがる場合は行ごとに1本ずつ返す。
 *
 * 縦位置は**文字のベースライン基準**（2026-08-27 塾長の希望「下線はもっと
 * 文字にピッタリ出したい」）。q・y・g・p の下に伸びる部分は下線を突き抜けてよい
 * ので、突き抜けを避ける処理はあえて入れていない。ベースラインが採寸できない
 * ときだけ、従来どおり語要素の外枠の下端で代用する。
 * この y は表示にしか使わない（吸着・採点には無関係）。
 */
export function underlineSegments(
  span: { from: number; to: number },
  boxes: TokenBox[],
  gap = 2,
): UnderlineSegment[] {
  const covered = boxes.filter((t) => t.index >= span.from && t.index <= span.to)
  if (covered.length === 0) return []
  return groupLines(covered).map((line) => ({
    left: Math.min(...line.boxes.map((t) => t.left)),
    right: Math.max(...line.boxes.map((t) => t.right)),
    y: Math.max(...line.boxes.map((t) => t.baseline ?? t.bottom)) + gap,
  }))
}

/* ---------- 下線・波線のタッチの当たり判定（2026-09-02 項目3） ---------- */

/** タッチが当たった線（下線 or 波線）。index は spans / extras の中の位置 */
export interface LineHit {
  kind: 'ul' | 'wavy'
  index: number
  from: number
  to: number
}

/** 線の当たりとみなす縦の許容（px）。働きの欄（本文の下）とは lane で切り分ける */
const LINE_HIT_TOL = 9
/** 線の当たりとみなす横の許容（px） */
const LINE_HIT_SLOP = 4

/**
 * タッチした位置に描かれている下線・波線を探す（項目3・タッチ修正の入口）。
 *
 * 表示と同じ underlineSegments で線の位置を出し、横は線分の幅の中・縦は
 * 線から LINE_HIT_TOL px 以内なら当たりとする。下線と波線の両方に当たるとき
 * （ほぼ同じ場所に重なって描かれているとき）は波線を先にする
 * （誤って下線と判定された波線を直すのが主目的のため）。同じ種類どうしは近いほう。
 */
export function findLineAt(
  point: { x: number; y: number },
  spans: Array<{ from: number; to: number; type: string }>,
  extras: Array<{ kind: string; from: number; to: number }>,
  boxes: TokenBox[],
): LineHit | null {
  const hits: Array<LineHit & { dist: number }> = []
  const check = (kind: 'ul' | 'wavy', index: number, range: { from: number; to: number }) => {
    for (const seg of underlineSegments(range, boxes, 1)) {
      if (point.x < seg.left - LINE_HIT_SLOP || point.x > seg.right + LINE_HIT_SLOP) continue
      // 波線は高さのある波形なので、当たりの中心を波の中央に置く
      const y = kind === 'wavy' ? seg.y + WAVY_H / 2 : seg.y
      const dist = Math.abs(point.y - y)
      if (dist <= LINE_HIT_TOL) hits.push({ kind, index, from: range.from, to: range.to, dist })
    }
  }
  spans.forEach((s, i) => {
    if (s.type === 'ul') check('ul', i, s)
  })
  extras.forEach((x, i) => {
    if (x.kind === 'wavy') check('wavy', i, x)
  })
  if (hits.length === 0) return null
  hits.sort(
    (a, b) => (a.kind === b.kind ? 0 : a.kind === 'wavy' ? -1 : 1) || a.dist - b.dist,
  )
  const best = hits[0]
  return { kind: best.kind, index: best.index, from: best.from, to: best.to }
}

/* ---------- 波線の重ね描き（下線と同じ連結線分＋波形の道筋） ---------- */

/** 波線の描画の高さ（svg の縦幅・px）。波の中心はこの半分の位置 */
export const WAVY_H = 6
/** 波の半周期（px）と振幅（px）。見た目の調整用 */
const WAVY_HALF = 4
const WAVY_AMP = 2.2

/**
 * 波線1本ぶんの SVG パス（幅 width・高さ WAVY_H の箱の中に描く）。
 *
 * 従来は単語ごとの文字飾り（CSS の波線）だったため単語の間で途切れていた。
 * 下線と同じく連結線分（underlineSegments）ごとに1本の波を描く（2026-09-02 項目2）。
 * 端数の幅でも滑らかに終わるよう、最後の半周期だけ短くする。
 */
export function wavyPath(width: number): string {
  if (width <= 0) return ''
  const mid = WAVY_H / 2
  let d = `M0,${mid}`
  let x = 0
  let up = true
  while (x < width) {
    const step = Math.min(WAVY_HALF, width - x)
    const dy = (up ? -WAVY_AMP : WAVY_AMP) * (step / WAVY_HALF)
    d += ` q ${(step / 2).toFixed(1)},${dy.toFixed(1)} ${step.toFixed(1)},0`
    x += step
    up = !up
  }
  return d
}

/* ---------- 括弧の重ね描き（単語の並びから外して置く） ---------- */

/** 同じ深さの括弧が並ぶときの1つぶんの幅（px） */
export const BRACKET_SLOT_W = 6
/**
 * 同じすき間に並ぶ括弧1つぶんの縦のずらし（px・2026-08-31）。
 * すき間は実測12〜19画素しかなく、横に6pxずつずらすだけでは字（約8〜10px幅）が
 * 重なって読めなかった。横と合わせて斜めに離す。値は見た目の調整用。
 */
export const BRACKET_SLOT_H = 8
/** 行頭・行末でとなりの単語が無いときに空ける見込み幅（px） */
export const BRACKET_EDGE_GAP = 8

/**
 * 働きの欄1マスの高さ（px）。単語の下に置く働きのマス（Cell の min-h-6＝24px）と
 * 同じ値をここに持ち、**同じ行の働きはすべてこの帯の中央にそろえる**。
 * 2026-08-27 に括弧を重ね描きへ変えたとき、括弧の真下に書いた働きだけが
 * 別の計算（上端そろえ・小さい文字）になり、単語の下の働きと高さがズレていた。
 */
export const ROLE_ROW_H = 24

/** 括弧を重ね描きするときの置き場所（コンテナ相対・中心座標） */
export interface BracketMark {
  /** 記号の中心の横位置 */
  x: number
  /** 記号の中心の縦位置（本文の行の中央） */
  y: number
  /** 開始カッコの真下に置く働きの上端 */
  roleTop: number
}

/** 同じ表示行か（groupLines と同じ基準） */
function onSameLine(a: TokenBox, b: TokenBox): boolean {
  return Math.abs(a.top - b.top) < (b.bottom - b.top) * 0.6
}

/**
 * 括弧を単語の並びに差し込まずに重ね描きするための置き場所を返す（表示用）。
 *
 * 括弧を文の流れに入れると、書いた瞬間に後ろの単語が右へ押されて
 * 書き込もうとしていた場所が動く（2026-08-27 塾長の実機の指摘）。そこで
 * 下線と同じ重ね描きに寄せ、**単語と単語のすき間の中央**へ置く。
 * すき間は左右の単語の余白ぶんだけ空いているので、文字とは重ならない。
 *
 * 同じすき間に複数の括弧が並ぶときは、横（BRACKET_SLOT_W）に加えて
 * **縦（BRACKET_SLOT_H）にもずらして斜めに離す**（2026-08-31・確定仕様5。
 * 横だけでは、いちばんせまいすき間で入れ子の字が重なって読めなかった）。
 * 縦の並びは開き・閉じとも**外側のまとまりほど上**（同じまとまりの開きと閉じが
 * 同じ高さにそろう向き）。深さ別の4色の色分けはそのまま。
 *
 * @param order 同じ位置に複数の括弧が並ぶときの並び順（0 が一番左）
 * @param count 同じ位置に並ぶ括弧の数
 */
export function bracketMark(
  box: TokenBox,
  boxes: TokenBox[],
  side: 'open' | 'close',
  order = 0,
  count = 1,
): BracketMark {
  const line = boxes.filter((t) => onSameLine(t, box))
  let center: number
  if (side === 'open') {
    const prev = line.filter((t) => t.right <= box.left).sort((a, b) => b.right - a.right)[0]
    center = prev ? (prev.right + box.left) / 2 : box.left - BRACKET_EDGE_GAP
  } else {
    const next = line.filter((t) => t.left >= box.right).sort((a, b) => a.left - b.left)[0]
    center = next ? (box.right + next.left) / 2 : box.right + BRACKET_EDGE_GAP
  }
  // 開き側は order 0 が外側（左）、閉じ側は order 0 が内側（左）なので、
  // 「外側ほど上」にそろえるため閉じ側は縦の並びを反転する
  const vOrder = side === 'open' ? order : count - 1 - order
  return {
    x: center + (order - (count - 1) / 2) * BRACKET_SLOT_W,
    y: (box.top + box.bottom) / 2 + (vOrder - (count - 1) / 2) * BRACKET_SLOT_H,
    roleTop: box.bottom,
  }
}

/* ---------- 括弧の字形（重ね描き用の SVG パス・2026-09-02 項目5） ---------- */

/** 括弧の字形の描画領域（px）。4種の括弧すべてがこの同じ箱に収まる */
export const BRACKET_GLYPH_W = 8
export const BRACKET_GLYPH_H = 20

/** 括弧になるまとまりの種類（ul＝下線には括弧の字形が無い） */
export type BracketSpanType = 'adv' | 'n' | 'adjm' | 'comp'

/**
 * 開き括弧の字形（幅 BRACKET_GLYPH_W × 高さ BRACKET_GLYPH_H の箱に描く線）。
 * 閉じ括弧は同じパスを左右反転して使う（描く側が transform で反転する）。
 *
 * フォントの字（( ) [ ] { } ⟨ ⟩）で描くのをやめた理由（2026-09-02 項目5）:
 * 日本語フォントの丸括弧は字面が大きく基線より下にぶら下がって設計されており、
 * ⟨ ⟩（U+27E8/E9）は日本語フォントに無く別のフォントへ落ちるため、同じ組の
 * 括弧なのに大きさ・基線がそろわなかった（半角そろえ 20260828-symbol-halfwidth は
 * 「どの字を使うか」だけをそろえ、フォントごとの字面の違いまでは吸収できていなかった）。
 * 自前の線で描けば、端末のフォントによらず4種とも同じ大きさ・同じ中心になる。
 * 4種とも上端 y=1.5・下端 y=18.5 で始終し、視覚上の高さと中心が完全に一致する。
 */
const OPEN_GLYPH_PATHS: Record<BracketSpanType, string> = {
  // （: 円弧
  adv: 'M6.5,1.5 Q1.2,10 6.5,18.5',
  // [: 直角2つ
  n: 'M6.5,1.5 L2,1.5 L2,18.5 L6.5,18.5',
  // ⟨: 頂点1つの2本線
  adjm: 'M6.5,1.5 L2,10 L6.5,18.5',
  // {: 中央にツノ
  comp: 'M6.5,1.5 Q3.6,1.5 3.6,5 Q3.6,8.8 1.4,10 Q3.6,11.2 3.6,15 Q3.6,18.5 6.5,18.5',
}

export function bracketGlyphPath(type: BracketSpanType): string {
  return OPEN_GLYPH_PATHS[type]
}

/* ---------- 採点の注記の重ね描き（単語の並びから外して置く） ---------- */

/** 採点の注記（正しい品詞・働き）の置き場所（コンテナ相対） */
export interface NoteMark {
  /** 注記の中心の横位置 */
  x: number
  /** 注記の上端（働きの欄のすぐ下） */
  top: number
}

/**
 * 採点の注記を単語の並びに差し込まずに重ね描きするための置き場所を返す（表示用）。
 *
 * 注記を文の流れに入れると、採点した瞬間に注記の幅ぶん単語が右へ押されて
 * 並びがガタつく（2026-08-27 塾長の実機の指摘）。括弧と同じ重ね描きに寄せ、
 * **その単語の働きの欄のすぐ下**へ置く。注記は「品詞 n」のように短くするので、
 * 1マスの幅（最小 2.2rem）に収まり、となりの単語の注記とぶつからない。
 */
export function noteMark(box: TokenBox): NoteMark {
  return { x: (box.left + box.right) / 2, top: box.bottom + ROLE_ROW_H }
}

/**
 * 画のまとめ判定（shouldGroupStrokes）は grouping.ts へ移した（2026-08-27）。
 * 場所の比較相手を「まとまり全体の外接箱」から「直前の1画」に変え、
 * 単語の箱・段の境界も見るようになったため、吸着とは別の関心事として分けている。
 */
