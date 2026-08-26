/**
 * ペン入力モード中の「指をいつ止め、いつ通すか」の判定（2026-08-26 使いやすさ改修）。
 *
 * 旧方式（ペンを一度でも見たら画面全体で指を常時無効化）は手のひらの誤反応は
 * 防げたが、ペンを置いた後に描画エリア外を指でスクロールする普通の操作まで
 * 止めてしまい使いづらかった（塾長の実機フィードバック）。
 *
 * 新方式は「ペンの接近・接触中と、離した直後の短い時間だけ」指を止める時間窓方式。
 * - ペンが接触中／ホバー中／離して間もない間に始まった指の接触＝手のひらとみなして止める
 * - 一度止めた接触は、窓が明けても離れるまで止め続ける（載せたままの手のひらが
 *   途中からスクロールに化けない）
 * - ペンが十分離れてから始まった指の接触は普通に通す＝描画エリア外のスクロールが効く
 * - ペン由来の互換タッチ（touchType='stylus'・直近ペンと時間位置が近い）は常に通す
 *   （止めるとペンのタップがクリックにならない。2026-08-26 の修正を維持）
 *
 * 実機のブラウザは接触の大きさ（手のひらの太さ）を報告しないことが多いため、
 * 接触面積による見分けには頼らない（2026-08-25 調査済み）。
 * 線を描いている最中の画面固定は freezeScreenDuringStroke が別途受け持つ。
 */

import { classifyTouchContact, type RecentPen } from './palm'

/** ペンを離して（ホバーも消えて）から、指の操作を再び受け付けるまでの時間（ms）。
 * 複数画の記号は画と画の間に最長 750ms（GROUP_WAIT_MS）ペンが浮くため、それより長くとる。 */
export const PEN_RELEASE_MS = 1200

export type FingerGuardReason =
  | 'stylus-type' // ペン由来（touchType が stylus）→ 通す
  | 'pen-nearby' // ペン由来（直近のペン接触と時間・位置が近い）→ 通す
  | 'pen-writing' // ペンが接触中に始まった指＝手のひら → 止める
  | 'pen-recent' // ペンの接近中・離した直後に始まった指＝手のひら → 止める
  | 'blocked-continued' // 止めた接触の続き → 止め続ける
  | 'finger-free' // ペンが十分離れている → 通す（普通のスクロール等）

export interface FingerGuardState {
  /** ペンが画面に接触中か */
  penDown: boolean
  /** 最後にペンを観測した時刻（接触・ホバーとも）。null=まだ見ていない */
  lastPenAt: number | null
  /** ペン由来タッチ判定（classifyTouchContact）用の直近ペン位置 */
  recentPen: RecentPen | null
  /** 止めた接触の識別番号。離れるまで止め続けるために覚える */
  blockedTouchIds: Set<number>
}

export function createFingerGuardState(): FingerGuardState {
  return { penDown: false, lastPenAt: null, recentPen: null, blockedTouchIds: new Set() }
}

/** ペンのポインタイベントを状態に反映する（接触・ホバーとも） */
export function trackPen(
  state: FingerGuardState,
  phase: 'down' | 'move' | 'up' | 'cancel',
  x: number,
  y: number,
  t: number,
): void {
  state.lastPenAt = t
  state.recentPen = { x, y, t }
  if (phase === 'down') state.penDown = true
  if (phase === 'up' || phase === 'cancel') state.penDown = false
}

export interface FingerGuardDecision {
  allow: boolean
  reason: FingerGuardReason
}

export interface TouchContactLike {
  identifier: number
  clientX: number
  clientY: number
  touchType?: string
}

/** タッチ1点を通すか止めるか判定する（状態のカウンタ・識別番号集合も更新する） */
export function decideTouch(
  state: FingerGuardState,
  touch: TouchContactLike,
  now: number,
): FingerGuardDecision {
  const origin = classifyTouchContact(touch, state.recentPen, now)
  if (origin !== 'finger') {
    // ペン由来と分かったら（過去に誤って止めていても）止める対象から外す
    state.blockedTouchIds.delete(touch.identifier)
    return { allow: true, reason: origin }
  }
  if (state.blockedTouchIds.has(touch.identifier)) {
    return { allow: false, reason: 'blocked-continued' }
  }
  if (state.penDown) {
    state.blockedTouchIds.add(touch.identifier)
    return { allow: false, reason: 'pen-writing' }
  }
  if (state.lastPenAt != null && now - state.lastPenAt <= PEN_RELEASE_MS) {
    state.blockedTouchIds.add(touch.identifier)
    return { allow: false, reason: 'pen-recent' }
  }
  return { allow: true, reason: 'finger-free' }
}

/**
 * タッチイベント1回ぶん（changedTouches）をまとめて判定する。
 * preventDefault はイベント単位にしか効かないため、1つの結論に畳む:
 * - ペン由来の接触が1つでもあれば通す（止めるとペンのタップが死ぬ）
 * - それ以外で止める判定が1つでもあれば止める
 */
export function decideTouchEvent(
  state: FingerGuardState,
  touches: TouchContactLike[],
  now: number,
): FingerGuardDecision {
  let blocked: FingerGuardDecision | null = null
  let allowed: FingerGuardDecision | null = null
  for (const t of touches) {
    const d = decideTouch(state, t, now)
    if (d.allow && (d.reason === 'stylus-type' || d.reason === 'pen-nearby')) return d
    if (!d.allow && !blocked) blocked = d
    if (d.allow && !allowed) allowed = d
  }
  return blocked ?? allowed ?? { allow: true, reason: 'finger-free' }
}

/** 接触が終わったら止める対象から外す（次の新しい接触は改めて判定する） */
export function releaseTouch(state: FingerGuardState, identifier: number): void {
  state.blockedTouchIds.delete(identifier)
}
