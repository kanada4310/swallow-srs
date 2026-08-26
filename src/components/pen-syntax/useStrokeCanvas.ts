'use client'

/**
 * ペン書き込みキャンバスの入力処理を1か所に集める（2026-08-26 基盤の作り込み）。
 *
 * これまで同じ処理（接触の受理判定→ポインタ捕捉→描画中の画面固定→座標変換→
 * 線の組み立て→入力の記録）が、書き込み部品・計測ページ・お手本キャンバスの
 * 3〜4か所に書き写されており、実機不具合の修正が1か所に入って他が直らない
 * 恐れがあった。入力イベントと座標変換と画面固定はこのフックだけが受け持つ。
 *
 * 機種差の吸収もここで行う:
 * - 接触の受理判定は palm.ts の evaluatePointer（ペン専用/マウス可/指も可）
 * - 座標変換は local-point.ts の resolveLocalPoint（ピンチズーム中は
 *   ブラウザ計算の要素相対座標へ切り替え）
 * - ポインタ捕捉の失敗（合成イベント等）は握りつぶして描画を続ける
 * - 描画中は freezeScreenDuringStroke で画面全体の移動を止める
 *
 * 判別・グルーピング・タップの意味づけは呼び出し側の仕事（層を分ける）。
 */

import { useEffect, useRef } from 'react'
import type { MutableRefObject, RefObject } from 'react'
import type { PenPoint } from '@/lib/pen-syntax/types'
import {
  evaluatePointer,
  initialPalmState,
  type InputPolicy,
  type PalmDecision,
  type PalmState,
} from '@/lib/pen-syntax/palm'
import { resolveLocalPoint } from '@/lib/pen-syntax/local-point'
import {
  captureScreenSnapshot,
  describeScreenShift,
  type PenInputLog,
  type ScreenSnapshot,
} from '@/lib/pen-syntax/input-log'
import { freezeScreenDuringStroke } from './usePenZoneGuard'

/** 書きかけの線（描画側が participates in redraw のため参照を共有する） */
export interface DrawingStroke {
  pointerId: number
  stroke: PenPoint[]
}

export interface StrokeCanvasHandlers {
  onPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => void
  onPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => void
  onPointerUp: (e: React.PointerEvent<HTMLCanvasElement>) => void
  onPointerCancel: (e: React.PointerEvent<HTMLCanvasElement>) => void
}

export interface StrokeCanvasOptions {
  /** 座標の基準枠（キャンバス自身でもよい） */
  containerRef: RefObject<HTMLElement | null>
  /** 書きかけの線の置き場（redraw が参照する。呼び出し側が作って渡す） */
  drawingRef: MutableRefObject<DrawingStroke | null>
  policy: InputPolicy
  /** false のとき新しい接触を受け付けない（無効化・候補チップ表示中など） */
  active?: boolean
  /** 診断用「入力の記録」。渡すと受理/拒否・座標・描画中の画面移動を記録する */
  log?: PenInputLog | null
  /** 接触の受理判定のたびに呼ばれる（受理・拒否の両方。計測カウンタの表示用） */
  onDecision?: (decision: PalmDecision, e: React.PointerEvent) => void
  /** 受理した接触で線を書き始めた直後（グルーピングの一時停止などに使う） */
  onStrokeStart?: (e: React.PointerEvent) => void
  /** 1画が確定した（ポインタを離した/中断した）。座標は枠相対・時刻つき */
  onStroke: (stroke: PenPoint[], phase: 'up' | 'cancel') => void
  /** 描画の更新が必要になった（線が伸びた・確定した） */
  onRedraw: () => void
}

export function useStrokeCanvas({
  containerRef,
  drawingRef,
  policy,
  active = true,
  log = null,
  onDecision,
  onStrokeStart,
  onStroke,
  onRedraw,
}: StrokeCanvasOptions): { handlers: StrokeCanvasHandlers; palmRef: MutableRefObject<PalmState> } {
  const palmRef = useRef<PalmState>(initialPalmState())
  const unfreezeRef = useRef<(() => void) | null>(null)
  const strokeScreenRef = useRef<ScreenSnapshot | null>(null)
  const lastMoveLogRef = useRef(0)
  const logRef = useRef<PenInputLog | null>(log)
  logRef.current = log

  useEffect(() => {
    return () => unfreezeRef.current?.()
  }, [])

  const toLocal = (e: React.PointerEvent): PenPoint => {
    const rect = containerRef.current!.getBoundingClientRect()
    const ne = e.nativeEvent as PointerEvent
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    // 毎イベントで枠の位置を測り直し（スクロール追従）、ピンチズーム中は
    // ブラウザ計算の要素相対座標に切り替える（座標系の食い違い対策）
    const p = resolveLocalPoint({
      clientX: e.clientX,
      clientY: e.clientY,
      rectLeft: rect.left,
      rectTop: rect.top,
      offsetX: typeof ne.offsetX === 'number' ? ne.offsetX : undefined,
      offsetY: typeof ne.offsetY === 'number' ? ne.offsetY : undefined,
      vvScale: vv ? vv.scale : null,
      vvOffsetLeft: vv ? vv.offsetLeft : null,
      vvOffsetTop: vv ? vv.offsetTop : null,
    })
    return { x: p.x, y: p.y, t: e.timeStamp }
  }

  const logPointer = (
    e: React.PointerEvent,
    phase: 'down' | 'move' | 'up' | 'cancel',
    local: PenPoint,
    accepted?: boolean,
    reason?: string,
  ) => {
    const lg = logRef.current
    if (!lg) return
    const ne = e.nativeEvent as PointerEvent
    lg.push({
      kind: 'pointer',
      at: e.timeStamp,
      phase,
      pointerType: e.pointerType,
      pointerId: e.pointerId,
      client: { x: e.clientX, y: e.clientY },
      local: { x: local.x, y: local.y },
      offset: typeof ne.offsetX === 'number' ? { x: ne.offsetX, y: ne.offsetY } : null,
      contact: { w: e.width || 0, h: e.height || 0 },
      accepted,
      reason,
      screen: captureScreenSnapshot(containerRef.current),
    })
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!active) return
    const decision = evaluatePointer(
      { pointerType: e.pointerType, width: e.width, height: e.height },
      policy,
      palmRef.current,
    )
    palmRef.current = decision.next
    onDecision?.(decision, e)
    logPointer(e, 'down', toLocal(e), decision.accept, decision.reason)
    if (!decision.accept) {
      // 拒否した接触はここで既定動作ごと止める（長押しの選択・後続のクリック化を防ぐ）
      e.preventDefault()
      return
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // 一部環境（合成イベント等）で失敗しても描画は続けられる
    }
    // 線を描いている間は画面全体のスクロールを止める（狙いがずれる不具合対策）
    unfreezeRef.current?.()
    unfreezeRef.current = freezeScreenDuringStroke()
    strokeScreenRef.current = logRef.current ? captureScreenSnapshot(containerRef.current) : null
    lastMoveLogRef.current = e.timeStamp
    onStrokeStart?.(e)
    drawingRef.current = { pointerId: e.pointerId, stroke: [toLocal(e)] }
    onRedraw()
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drawingRef.current
    if (!d || d.pointerId !== e.pointerId) return
    d.stroke.push(toLocal(e))
    // 描画中に画面が動いたら記録に残す（線ずれの原因特定用）
    const lg = logRef.current
    if (lg) {
      const snap = captureScreenSnapshot(containerRef.current)
      const base = strokeScreenRef.current
      const shift = base ? describeScreenShift(base, snap) : null
      if (shift) {
        lg.push({ kind: 'shift', at: e.timeStamp, during: 'stroke', detail: shift })
        strokeScreenRef.current = snap
      }
      if (shift || e.timeStamp - lastMoveLogRef.current > 150) {
        lastMoveLogRef.current = e.timeStamp
        logPointer(e, 'move', d.stroke[d.stroke.length - 1])
      }
    }
    onRedraw()
  }

  const finish = (e: React.PointerEvent<HTMLCanvasElement>, phase: 'up' | 'cancel') => {
    const d = drawingRef.current
    if (!d || d.pointerId !== e.pointerId) return
    unfreezeRef.current?.()
    unfreezeRef.current = null
    strokeScreenRef.current = null
    drawingRef.current = null
    const stroke = d.stroke
    logPointer(e, phase, stroke[stroke.length - 1] ?? toLocal(e))
    onStroke(stroke, phase)
  }

  return {
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: (e) => finish(e, 'up'),
      onPointerCancel: (e) => finish(e, 'cancel'),
    },
    palmRef,
  }
}
