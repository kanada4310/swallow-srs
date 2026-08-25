'use client'

/**
 * ペン専用の画面ガード（手のひら対策の本丸）。
 *
 * キャンバスの touch-action: none はキャンバスの上にしか効かないため、
 * キャンバスの外（画面の下側など）に載せた手のひらはページのスクロールや
 * ボタンのタップとして働いてしまう。このフックは「ペン入力を一度でも見たら、
 * 画面全体で指・手のひらのタッチ操作を無効化する」ことでそれを塞ぐ。
 *
 * - ペンはタッチイベントと別系統（pointerType 'pen'）なので、書く・ボタンを押すは
 *   ペンでそのまま操作できる
 * - ペンを一度も使っていない端末（指だけの生徒）では働かない＝指の操作は普通に生きる
 * - ガードは画面を離れる（部品が外れる）と解除される
 */

import { useEffect } from 'react'

export function usePenScreenGuard(active: boolean) {
  useEffect(() => {
    if (!active) return
    const block = (e: TouchEvent) => e.preventDefault()
    const opts: AddEventListenerOptions = { passive: false, capture: true }
    document.addEventListener('touchstart', block, opts)
    document.addEventListener('touchmove', block, opts)
    return () => {
      document.removeEventListener('touchstart', block, opts)
      document.removeEventListener('touchmove', block, opts)
    }
  }, [active])
}
