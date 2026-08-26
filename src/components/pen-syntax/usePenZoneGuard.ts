'use client'

/**
 * ペン専用の画面ガード＝ゾーン方式（2026-08-26 塾長裁定・時間窓方式を置き換え）。
 *
 * 画面を3つの区域に分ける（判定は zone-guard.ts の純ロジック）:
 * - 書き込みエリア（data-pen-write-zone）: ペン専用。指・手のひらは止める
 * - ペン用の操作部品（data-pen-ui・候補チップ/一覧/お手本登録の枠）: ペンも指も使える
 * - それ以外: ペンは無効（書く道具に徹する・ボタンは指で押す）。
 *   指は常時有効＝ペンを離した直後でも待ちなしでスクロールできる
 *
 * 手のひら対策は「描画中の画面固定（freezeScreenDuringStroke）」＋
 * 「ペン接触中に始まった指は離れるまで止める」の2段（zone-guard.ts 参照）。
 * ペン由来の互換タッチは常に通す（ペンのタップがクリックになる）。
 * ペンを使わない生徒（指だけ）への影響は、書き込みエリア内が指で書けないことだけ
 * （従来と同じ。「指でも書く」切り替えでガードごと外れる）。
 */

import { useEffect, useRef } from 'react'
import {
  createZoneGuardState,
  decidePenPointer,
  decideTouchEvent,
  releaseTouch,
  trackPen,
  zoneOfTarget,
  type PenZone,
  type ZoneGuardReason,
} from '@/lib/pen-syntax/zone-guard'

export interface PenGuardEvent {
  event: 'touchstart' | 'touchmove' | 'pen-down'
  action: 'blocked' | 'allowed'
  reason: ZoneGuardReason
  zone: PenZone
  x: number
  y: number
}

/** 抑止したペン接触の後続クリックとみなす時間（ms）と距離（px） */
const SUPPRESS_CLICK_MS = 600
const SUPPRESS_CLICK_RADIUS = 32

export function usePenZoneGuard(active: boolean, onEvent?: (e: PenGuardEvent) => void) {
  // コールバックの差し替えでリスナーを付け直さないよう ref 経由で持つ
  const cb = useRef(onEvent)
  cb.current = onEvent

  useEffect(() => {
    if (!active) return
    const state = createZoneGuardState()
    // 記録が touchmove で埋まらないよう、同種の連続イベントは間引いて通知する
    let lastNotified = 0
    // エリア外で抑止したペン接触（後続のクリックも握りつぶすための記憶）
    let suppressedPen: { x: number; y: number; t: number } | null = null

    const onPointer = (e: PointerEvent) => {
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
      if (e.type !== 'pointerdown') return
      const zone = zoneOfTarget(e.target)
      const d = decidePenPointer(zone)
      if (!d.allow) {
        // エリア外のペンは無効（既定動作ごと止め、クリック化も防ぐ）
        e.preventDefault()
        suppressedPen = { x: e.clientX, y: e.clientY, t: e.timeStamp }
        cb.current?.({
          event: 'pen-down',
          action: 'blocked',
          reason: d.reason,
          zone,
          x: e.clientX,
          y: e.clientY,
        })
      }
    }

    const onClick = (e: MouseEvent) => {
      const zone = zoneOfTarget(e.target)
      if (zone !== 'page') return
      // ペン由来のクリック（pointerType 付き）はエリア外では握りつぶす
      const pt = (e as PointerEvent).pointerType
      if (pt === 'pen') {
        e.preventDefault()
        e.stopPropagation()
        return
      }
      // pointerType が取れない環境の保険: 直前に抑止したペン接触の近くのクリックを止める
      if (suppressedPen && e.timeStamp - suppressedPen.t < SUPPRESS_CLICK_MS) {
        const dx = e.clientX - suppressedPen.x
        const dy = e.clientY - suppressedPen.y
        if (dx * dx + dy * dy <= SUPPRESS_CLICK_RADIUS * SUPPRESS_CLICK_RADIUS) {
          e.preventDefault()
          e.stopPropagation()
        }
      }
    }

    const guard = (ev: TouchEvent) => {
      const zone = zoneOfTarget(ev.target)
      const touches = Array.from(ev.changedTouches).map((t) => ({
        identifier: t.identifier,
        clientX: t.clientX,
        clientY: t.clientY,
        touchType: (t as Touch & { touchType?: string }).touchType,
      }))
      const decision = decideTouchEvent(state, touches, zone, ev.timeStamp)
      if (!decision.allow) ev.preventDefault()
      const type = ev.type === 'touchstart' ? 'touchstart' : 'touchmove'
      if (cb.current && (type === 'touchstart' || ev.timeStamp - lastNotified > 250)) {
        lastNotified = ev.timeStamp
        cb.current({
          event: type,
          action: decision.allow ? 'allowed' : 'blocked',
          reason: decision.reason,
          zone,
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
    document.addEventListener('pointerdown', onPointer, opts)
    document.addEventListener('pointermove', onPointer, trackOpts)
    document.addEventListener('pointerup', onPointer, trackOpts)
    document.addEventListener('pointercancel', onPointer, trackOpts)
    document.addEventListener('click', onClick, opts)
    document.addEventListener('touchstart', guard, opts)
    document.addEventListener('touchmove', guard, opts)
    document.addEventListener('touchend', release, trackOpts)
    document.addEventListener('touchcancel', release, trackOpts)
    return () => {
      document.removeEventListener('pointerdown', onPointer, opts)
      document.removeEventListener('pointermove', onPointer, trackOpts)
      document.removeEventListener('pointerup', onPointer, trackOpts)
      document.removeEventListener('pointercancel', onPointer, trackOpts)
      document.removeEventListener('click', onClick, opts)
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
