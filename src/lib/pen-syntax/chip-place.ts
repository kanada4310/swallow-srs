/**
 * 迷ったときの候補（チップ）を、いま書いた場所を避けて置く（2026-08-27）。
 *
 * これまでは「書いた線の中心x・上端yの58画素上」に固定で出していたため、
 * 単語の枠も欄の種別も画面の端も見ておらず、**書きたいマスの上に候補が重なって
 * 同じ場所に書き直せない**（塾長の実機フィードバック）。
 *
 * 置き方の決まり:
 * - 縦は**書いた段の反対側**へ出す（品詞の段に書いたら行の下・働きの段に書いたら行の上）。
 *   紙で言えば「いま鉛筆を置いている手のひら側を避ける」置き方。
 *   避ける範囲は「書いた線」と「その行の本文」を合わせた帯（行そのものも隠さない）
 * - その側が枠からはみ出すなら反対側へ折り返す。どちらも枠に収まらないとき
 *   （1行だけの短い文など、枠に余白が無いとき）は**枠の外（下）へはみ出させる**。
 *   枠の中へ無理に収めると、必ず書いた場所か本文の上に重なるため
 * - 横は線の中心にそろえたうえで、左右のはみ出しを抑える（枠より広いときは左端）
 * 純関数。画面部品は測った寸法を渡すだけ。
 */

import type { Lane } from './types'

export interface ChipRect {
  left: number
  right: number
  top: number
  bottom: number
}

export interface ChipPlacement {
  left: number
  top: number
}

export interface ChipPlaceInput {
  /** 書いた線の外接箱（枠相対の画素） */
  stroke: ChipRect
  /** 書いた行の本文の上下（分かるとき）。行そのものを隠さないために使う */
  row?: { top: number; bottom: number } | null
  /** どの段に書いたか（above=品詞 / band=本文 / below=働き） */
  lane: Lane
  /** 書き込み枠の大きさ */
  container: { width: number; height: number }
  /** 候補の枠の大きさ（描画後に測った実寸） */
  chip: { width: number; height: number }
  /** 線と候補のすき間（既定8画素） */
  gap?: number
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), Math.max(min, max))
}

export function placeChipBox(input: ChipPlaceInput): ChipPlacement {
  const { stroke, row, lane, container, chip } = input
  const gap = input.gap ?? 8

  // 避ける帯＝書いた線＋その行の本文（行を隠すと単語が読めなくなる）
  const avoidTop = Math.min(stroke.top, row?.top ?? stroke.top)
  const avoidBottom = Math.max(stroke.bottom, row?.bottom ?? stroke.bottom)
  const above = avoidTop - gap - chip.height
  const below = avoidBottom + gap
  // 品詞の段（上）に書いたら下へ、働きの段（下）に書いたら上へ。本文の帯は上を優先
  const order = lane === 'above' ? [below, above] : [above, below]
  const fits = (t: number) => t >= 0 && t + chip.height <= container.height
  // どちらも枠に収まらないときは下へはみ出させる（上へ出すと画面の外に出て押せなくなる）
  const top = order.find(fits) ?? below

  const cx = (stroke.left + stroke.right) / 2
  const left = clamp(cx - chip.width / 2, 0, container.width - chip.width)

  return { left, top }
}
