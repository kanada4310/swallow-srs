/**
 * ペン入力モード中の「どの接触を通し、どれを止めるか」の判定＝ゾーン方式
 * （2026-08-26 塾長裁定。時間窓方式を置き換える）。
 *
 * 画面を3つの区域に分けて役割をはっきりさせる:
 * - 書き込みエリアの中（write）: ペン専用。指・手のひらの接触は止める
 * - ペン用の操作部品（ui・候補チップや一覧など）: ペンでも指でも押せる
 * - それ以外（page）: ペンは無効（書く道具に徹する）・指は常時有効
 *   （時間窓の待ちなし。「ペンを離して1〜2秒はラグがありすぎる」への対応）
 *
 * 手のひら対策は次の2段で成立する:
 * 1. 線を描いている最中は freezeScreenDuringStroke が画面全体の移動を止める
 * 2. ペンが接触している間に始まった指の接触（＝載せた手のひら）は、
 *    どの区域でも止め、離れるまで止め続ける（途中からスクロールに化けない）
 *    → 手のひらを載せたまま複数画の記号を書いても画面が暴れない
 * ペンが離れている間に新しく始まった指の接触は、エリア外なら即座に通す。
 *
 * ペン由来の互換タッチ（多くのタブレットでペンの接触が発生させる touch イベント）は
 * 常に通す。止めるとペンのタップがクリックにならない（2026-08-26 実機不具合の再発防止）。
 */

import { classifyTouchContact, type RecentPen } from './palm'

/** 画面の区域。write=書き込みエリア / ui=ペン用の操作部品 / page=それ以外 */
export type PenZone = 'write' | 'ui' | 'page'

export type ZoneGuardReason =
  | 'stylus-type' // ペン由来（touchType が stylus）→ 通す
  | 'pen-nearby' // ペン由来（直近のペン接触と時間・位置が近い）→ 通す
  | 'while-writing' // ペンが接触中に始まった指＝手のひら → 止める（区域を問わない）
  | 'in-write-zone' // 書き込みエリア内の指 → 止める（ペン専用）
  | 'blocked-continued' // 止めた接触の続き → 止め続ける
  | 'free-finger' // エリア外の指（ペンは離れている）→ 通す（普通のスクロール・タップ）
  | 'pen-out-of-zone' // エリア外のペン → 無効（書く道具に徹する・ボタンは指で押す）
  | 'pen-in-zone' // 書き込みエリア・ペン用の操作部品の中のペン → 通す

export interface ZoneGuardState {
  /** ペンが画面に接触中か */
  penDown: boolean
  /** ペン由来タッチ判定（classifyTouchContact）用の直近ペン位置 */
  recentPen: RecentPen | null
  /** 止めた接触の識別番号。離れるまで止め続けるために覚える */
  blockedTouchIds: Set<number>
}

export function createZoneGuardState(): ZoneGuardState {
  return { penDown: false, recentPen: null, blockedTouchIds: new Set() }
}

/** ペンのポインタイベントを状態に反映する（接触・ホバーとも） */
export function trackPen(
  state: ZoneGuardState,
  phase: 'down' | 'move' | 'up' | 'cancel',
  x: number,
  y: number,
  t: number,
): void {
  state.recentPen = { x, y, t }
  if (phase === 'down') state.penDown = true
  if (phase === 'up' || phase === 'cancel') state.penDown = false
}

export interface ZoneGuardDecision {
  allow: boolean
  reason: ZoneGuardReason
}

export interface ZoneTouchLike {
  identifier: number
  clientX: number
  clientY: number
  touchType?: string
}

/** タッチ1点を通すか止めるか判定する（状態の識別番号集合も更新する） */
export function decideTouch(
  state: ZoneGuardState,
  touch: ZoneTouchLike,
  zone: PenZone,
  now: number,
): ZoneGuardDecision {
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
    // 書いている最中に載った手のひらは、区域を問わず止める（合格条件）
    state.blockedTouchIds.add(touch.identifier)
    return { allow: false, reason: 'while-writing' }
  }
  if (zone === 'write') {
    state.blockedTouchIds.add(touch.identifier)
    return { allow: false, reason: 'in-write-zone' }
  }
  return { allow: true, reason: 'free-finger' }
}

/**
 * タッチイベント1回ぶん（changedTouches）をまとめて判定する。
 * preventDefault はイベント単位にしか効かないため、1つの結論に畳む:
 * - ペン由来の接触が1つでもあれば通す（止めるとペンのタップが死ぬ）
 * - それ以外で止める判定が1つでもあれば止める
 */
export function decideTouchEvent(
  state: ZoneGuardState,
  touches: ZoneTouchLike[],
  zone: PenZone,
  now: number,
): ZoneGuardDecision {
  let blocked: ZoneGuardDecision | null = null
  let allowed: ZoneGuardDecision | null = null
  for (const t of touches) {
    const d = decideTouch(state, t, zone, now)
    if (d.allow && (d.reason === 'stylus-type' || d.reason === 'pen-nearby')) return d
    if (!d.allow && !blocked) blocked = d
    if (d.allow && !allowed) allowed = d
  }
  return blocked ?? allowed ?? { allow: true, reason: 'free-finger' }
}

/** 接触が終わったら止める対象から外す（次の新しい接触は改めて判定する） */
export function releaseTouch(state: ZoneGuardState, identifier: number): void {
  state.blockedTouchIds.delete(identifier)
}

/**
 * ペンのポインタ接触を通すか（ゾーン方式: ペンは書き込みエリアと
 * ペン用の操作部品の中でだけ働く。エリア外のボタンは指で押す）。
 */
export function decidePenPointer(zone: PenZone): ZoneGuardDecision {
  if (zone === 'page') return { allow: false, reason: 'pen-out-of-zone' }
  return { allow: true, reason: 'pen-in-zone' }
}

/* ---------- 区域の目印（DOM 属性） ---------- */

/** 書き込みエリアの目印。書き込みキャンバスを含む枠に付ける */
export const PEN_WRITE_ZONE_ATTR = 'data-pen-write-zone'
/** ペン用の操作部品の目印。候補チップ・一覧・お手本登録の枠などに付ける */
export const PEN_UI_ATTR = 'data-pen-ui'

/** イベントの発生元がどの区域か（一番近い目印が勝つ） */
export function zoneOfTarget(target: EventTarget | null): PenZone {
  if (target && target instanceof Element) {
    const hit = target.closest(`[${PEN_WRITE_ZONE_ATTR}],[${PEN_UI_ATTR}]`)
    if (hit) return hit.hasAttribute(PEN_WRITE_ZONE_ATTR) ? 'write' : 'ui'
  }
  return 'page'
}
