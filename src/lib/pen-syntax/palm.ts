/**
 * 手のひら誤反応（パーム）対策の判定ロジック。
 *
 * 方針:
 * - ペン（pointerType 'pen'）の入力だけを線として受け付けるのが基本（ペン専用モード）
 * - 指・手のひら（'touch'）はキャンバス上では線にせず、画面スクロールに流す
 *   （CSS の touch-action と組み合わせる。拒否した接触は計測用に数える）
 * - ペンの無い端末（PC のマウス・検証用）向けに受け付けを広げるモードを用意する
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
