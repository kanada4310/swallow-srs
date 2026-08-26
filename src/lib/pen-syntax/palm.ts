/**
 * 手のひら誤反応（パーム）対策の判定ロジック。
 *
 * 方針（2026-08-25 実機フィードバック反映）:
 * - ペン（pointerType 'pen'）の入力だけを線として受け付ける「ペン専用」が既定
 * - 指・手のひら（'touch'）は線にしない。接触楕円の大きさ（width/height）による判定は、
 *   実機ブラウザが大きさを報告せず 0 のままのことが多く当てにならないため、補助にとどめる
 * - キャンバスの外（画面の下側）に載せた手のひらの誤操作（スクロール・ボタン）は
 *   ここでは防げない。usePenZoneGuard＋zone-guard.ts（ゾーン方式: 書き込みエリア内は
 *   ペン専用・エリア外は指のみ・ペン接触中に載った指は離れるまで止める）が受け持つ
 * - ペンの無い端末（PC のマウス・指しかない端末）向けに受け付けを広げるモードを用意する
 */

export type InputPolicy =
  | 'pen-only' // ペンのみ（タブレット実運用の既定）
  | 'pen-or-mouse' // ペン＋マウス（PC での検証用）
  | 'any' // 指でも書ける（ペンの無い端末の逃げ道）

export interface PointerLike {
  pointerType: string // 'pen' | 'touch' | 'mouse'
  /** 接触楕円の大きさ（px）。手のひらは大きく出ることが多い */
  width?: number
  height?: number
}

export interface PalmCounters {
  /** ペンを見た後に拒否した指・手のひらの接触数（＝誤反応を防いだ数） */
  rejectedTouches: number
  /** 線として受理した指の接触数（any モードのみ増える） */
  acceptedTouches: number
}

export interface PalmState extends PalmCounters {
  /** このセッションでペン入力を一度でも見たか */
  penSeen: boolean
}

export function initialPalmState(): PalmState {
  return { penSeen: false, rejectedTouches: 0, acceptedTouches: 0 }
}

/** 手のひらとみなす接触楕円の大きさ（px） */
export const PALM_CONTACT_SIZE = 22

export interface PalmDecision {
  accept: boolean
  reason: 'pen' | 'mouse' | 'touch-ok' | 'touch-rejected-policy' | 'touch-rejected-palm' | 'touch-rejected-pen-seen' | 'mouse-rejected-policy'
  next: PalmState
}

/** ポインタ接触を線として受け付けるか判定し、計測カウンタを更新した状態を返す */
export function evaluatePointer(e: PointerLike, policy: InputPolicy, state: PalmState): PalmDecision {
  if (e.pointerType === 'pen') {
    return { accept: true, reason: 'pen', next: { ...state, penSeen: true } }
  }
  if (e.pointerType === 'mouse') {
    if (policy === 'pen-only') {
      return { accept: false, reason: 'mouse-rejected-policy', next: state }
    }
    return { accept: true, reason: 'mouse', next: state }
  }
  // touch
  const big = (e.width ?? 0) >= PALM_CONTACT_SIZE || (e.height ?? 0) >= PALM_CONTACT_SIZE
  if (big) {
    return {
      accept: false,
      reason: 'touch-rejected-palm',
      next: { ...state, rejectedTouches: state.rejectedTouches + 1 },
    }
  }
  if (policy !== 'any') {
    return {
      accept: false,
      reason: 'touch-rejected-policy',
      next: { ...state, rejectedTouches: state.rejectedTouches + 1 },
    }
  }
  if (state.penSeen) {
    // 指でも書けるモードでも、ペンを使い始めたら指は手のひらの可能性が高いので拒否する
    return {
      accept: false,
      reason: 'touch-rejected-pen-seen',
      next: { ...state, rejectedTouches: state.rejectedTouches + 1 },
    }
  }
  return {
    accept: true,
    reason: 'touch-ok',
    next: { ...state, acceptedTouches: state.acceptedTouches + 1 },
  }
}

/* ---------- ペン由来タッチの判定（画面ガード用） ---------- */

/**
 * 多くのタブレットでは、ペンの接触そのものが互換タッチイベントも発生させる。
 * 画面ガード（指・手のひらの無効化）がこれまで全タッチを一律に止めていたため、
 * ペンのタップまで「クリックにならない＝ボタンが反応しない」不具合が出た
 * （2026-08-26 実機）。そこで「ペン由来とみなせるタッチは止めない」判定を設ける。
 */

/** ペン由来のタッチとみなす、直近のペン接触からの距離（px） */
export const PEN_TOUCH_RADIUS = 32
/** ペン由来のタッチとみなす、直近のペン接触からの時間差（ms） */
export const PEN_TOUCH_MS = 500

/** 直近に観測したペンの位置と時刻 */
export interface RecentPen {
  x: number
  y: number
  t: number
}

export type TouchOrigin = 'stylus-type' | 'pen-nearby' | 'finger'

/**
 * タッチ1点がペン由来かを判定する。
 * - iPad 系は touchType が 'stylus' と報告される → 即ペン由来
 * - それ以外は「直近のペン接触と時間・位置が近い」ことで判定する
 *   （ペンの互換タッチはペンのポインタイベント直後・同じ位置で発生するため）
 */
export function classifyTouchContact(
  touch: { clientX: number; clientY: number; touchType?: string },
  recentPen: RecentPen | null,
  now: number,
): TouchOrigin {
  if (touch.touchType === 'stylus') return 'stylus-type'
  if (recentPen && now - recentPen.t <= PEN_TOUCH_MS) {
    const dx = touch.clientX - recentPen.x
    const dy = touch.clientY - recentPen.y
    if (dx * dx + dy * dy <= PEN_TOUCH_RADIUS * PEN_TOUCH_RADIUS) return 'pen-nearby'
  }
  return 'finger'
}
