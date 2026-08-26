'use client'

/**
 * ペン専用の画面ガード（手のひら対策の本丸）。
 *
 * キャンバスの touch-action: none はキャンバスの上にしか効かないため、
 * キャンバスの外（画面の下側など）に載せた手のひらはページのスクロールや
 * ボタンのタップとして働いてしまう。このフックは「ペン入力を一度でも見たら、
 * 画面全体で指・手のひらのタッチ操作を無効化する」ことでそれを塞ぐ。
 *
 * ★2026-08-26 修正: 多くのタブレットでは、ペンの接触そのものが互換タッチ
 * イベントも発生させる。以前は全タッチを一律に preventDefault していたため、
 * ペンのタップがクリックにならず「正しい部分でもペンが反応しない」不具合が
 * 実機で発生した。ペン由来とみなせるタッチ（touchType が 'stylus'、または
 * 直近のペン接触と時間・位置が近い）は止めないようにした。
 *
 * - ペンの線・タップはそのまま生きる（ポインタ・クリックとも）
 * - ペンを一度も使っていない端末（指だけの生徒）では働かない＝指の操作は普通に生きる
 * - ガードは画面を離れる（部品が外れる）と解除される
 */

import { useEffect, useRef } from 'react'
import { classifyTouchContact, type RecentPen, type TouchOrigin } from '@/lib/pen-syntax/palm'

export interface PenGuardEvent {
  event: 'touchstart' | 'touchmove'
  action: 'blocked' | 'allowed'
  reason: TouchOrigin
  x: number
  y: number
}

export function usePenScreenGuard(active: boolean, onEvent?: (e: PenGuardEvent) => void) {
  // コールバックの差し替えでリスナーを付け直さないよう ref 経由で持つ
  const cb = useRef(onEvent)
  cb.current = onEvent

  useEffect(() => {
    if (!active) return
    let recentPen: RecentPen | null = null
    // 記録が touchmove で埋まらないよう、同種の連続イベントは間引いて通知する
    let lastNotified = 0

    const trackPen = (e: PointerEvent) => {
      if (e.pointerType === 'pen') recentPen = { x: e.clientX, y: e.clientY, t: e.timeStamp }
    }

    const guard = (ev: TouchEvent) => {
      const touches = Array.from(ev.changedTouches)
      let origin: TouchOrigin = 'finger'
      for (const t of touches) {
        const o = classifyTouchContact(
          {
            clientX: t.clientX,
            clientY: t.clientY,
            touchType: (t as Touch & { touchType?: string }).touchType,
          },
          recentPen,
          ev.timeStamp,
        )
        if (o !== 'finger') {
          origin = o
          break
        }
      }
      // ペン由来のタッチを止めるとペンのタップがクリックにならなくなるため通す
      const blocked = origin === 'finger'
      if (blocked) ev.preventDefault()
      const type = ev.type === 'touchstart' ? 'touchstart' : 'touchmove'
      if (cb.current && (type === 'touchstart' || ev.timeStamp - lastNotified > 250)) {
        lastNotified = ev.timeStamp
        cb.current({
          event: type,
          action: blocked ? 'blocked' : 'allowed',
          reason: origin,
          x: touches[0]?.clientX ?? 0,
          y: touches[0]?.clientY ?? 0,
        })
      }
    }

    const opts: AddEventListenerOptions = { passive: false, capture: true }
    const trackOpts: AddEventListenerOptions = { capture: true }
    document.addEventListener('pointerdown', trackPen, trackOpts)
    document.addEventListener('pointermove', trackPen, trackOpts)
    document.addEventListener('touchstart', guard, opts)
    document.addEventListener('touchmove', guard, opts)
    return () => {
      document.removeEventListener('pointerdown', trackPen, trackOpts)
      document.removeEventListener('pointermove', trackPen, trackOpts)
      document.removeEventListener('touchstart', guard, opts)
      document.removeEventListener('touchmove', guard, opts)
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
