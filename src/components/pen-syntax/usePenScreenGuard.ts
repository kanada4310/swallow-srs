'use client'

/**
 * ペン専用の画面ガード（手のひら対策の本丸）。
 *
 * キャンバスの touch-action: none はキャンバスの上にしか効かないため、
 * キャンバスの外（画面の下側など）に載せた手のひらはページのスクロールや
 * ボタンのタップとして働いてしまう。このフックはそれを塞ぐ。
 *
 * ★2026-08-26 改修（使いやすさ）: 以前は「ペンを一度でも見たら画面全体で
 * 指を常時無効化」していたが、描画エリア外を指でスクロールする普通の操作まで
 * 止めてしまい使いづらかった。判定を finger-guard.ts の時間窓方式に置き換え、
 * 「ペンの接近・接触中と離した直後だけ」指を止める。
 * - 手のひらを載せたまま書ける（ペンが近くにある間の指は止める）
 * - ペンを離してしばらく経てば、指のスクロール・タップは普通に効く
 * - ペン由来の互換タッチは常に通す（ペンのタップがクリックになる。8/26 修正の維持）
 * - ペンを一度も使っていない端末（指だけの生徒）では何も止めない
 * - ガードは画面を離れる（部品が外れる）と解除される
 */

import { useEffect, useRef } from 'react'
import {
  createFingerGuardState,
  decideTouchEvent,
  releaseTouch,
  trackPen,
  type FingerGuardReason,
} from '@/lib/pen-syntax/finger-guard'

export interface PenGuardEvent {
  event: 'touchstart' | 'touchmove'
  action: 'blocked' | 'allowed'
  reason: FingerGuardReason
  x: number
  y: number
}

export function usePenScreenGuard(active: boolean, onEvent?: (e: PenGuardEvent) => void) {
  // コールバックの差し替えでリスナーを付け直さないよう ref 経由で持つ
  const cb = useRef(onEvent)
  cb.current = onEvent

  useEffect(() => {
    if (!active) return
    const state = createFingerGuardState()
    // 記録が touchmove で埋まらないよう、同種の連続イベントは間引いて通知する
    let lastNotified = 0

    const track = (e: PointerEvent) => {
      if (e.pointerType !== 'pen') return
      const phase =
        e.type === 'pointerdown'
          ? 'down'
          : e.type === 'pointerup'
            ? 'up'
            : e.type === 'pointercancel'
              ? 'cancel'
              : 'move'
      trackPen(state, phase, e.clientX, e.clientY, e.timeStamp)
    }

    const guard = (ev: TouchEvent) => {
      const touches = Array.from(ev.changedTouches).map((t) => ({
        identifier: t.identifier,
        clientX: t.clientX,
        clientY: t.clientY,
        touchType: (t as Touch & { touchType?: string }).touchType,
      }))
      const decision = decideTouchEvent(state, touches, ev.timeStamp)
      if (!decision.allow) ev.preventDefault()
      const type = ev.type === 'touchstart' ? 'touchstart' : 'touchmove'
      if (cb.current && (type === 'touchstart' || ev.timeStamp - lastNotified > 250)) {
        lastNotified = ev.timeStamp
        cb.current({
          event: type,
          action: decision.allow ? 'allowed' : 'blocked',
          reason: decision.reason,
          x: touches[0]?.clientX ?? 0,
          y: touches[0]?.clientY ?? 0,
        })
      }
    }

    const release = (ev: TouchEvent) => {
      for (const t of Array.from(ev.changedTouches)) releaseTouch(state, t.identifier)
    }

    const opts: AddEventListenerOptions = { passive: false, capture: true }
    const trackOpts: AddEventListenerOptions = { capture: true }
    document.addEventListener('pointerdown', track, trackOpts)
    document.addEventListener('pointermove', track, trackOpts)
    document.addEventListener('pointerup', track, trackOpts)
    document.addEventListener('pointercancel', track, trackOpts)
    document.addEventListener('touchstart', guard, opts)
    document.addEventListener('touchmove', guard, opts)
    document.addEventListener('touchend', release, trackOpts)
    document.addEventListener('touchcancel', release, trackOpts)
    return () => {
      document.removeEventListener('pointerdown', track, trackOpts)
      document.removeEventListener('pointermove', track, trackOpts)
      document.removeEventListener('pointerup', track, trackOpts)
      document.removeEventListener('pointercancel', track, trackOpts)
      document.removeEventListener('touchstart', guard, opts)
      document.removeEventListener('touchmove', guard, opts)
      document.removeEventListener('touchend', release, trackOpts)
      document.removeEventListener('touchcancel', release, trackOpts)
    }
  }, [active])
}

/**
 * 線を描いている最中だけ、画面全体のスクロールを止める（2026-08-26 実機不具合対策）。
 * 描画中に画面が動くと、狙った位置と線の位置がずれるため
 * 「描画中は書き込み欄を含む画面全体の移動を止める」。
 * 返り値の関数で解除する（ポインタを離したとき・部品が外れるときに必ず呼ぶ）。
 */
export function freezeScreenDuringStroke(): () => void {
  if (typeof document === 'undefined') return () => {}
  const block = (e: Event) => {
    if (e.cancelable) e.preventDefault()
  }
  const opts: AddEventListenerOptions = { passive: false, capture: true }
  document.addEventListener('touchmove', block, opts)
  document.addEventListener('wheel', block, opts)
  return () => {
    document.removeEventListener('touchmove', block, opts)
    document.removeEventListener('wheel', block, opts)
  }
}
