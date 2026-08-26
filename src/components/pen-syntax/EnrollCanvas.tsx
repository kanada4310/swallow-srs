'use client'

/**
 * お手本登録用の書き込みキャンバス（初回登録フローで使う共通部品）。
 *
 * 判別キャンバスと同じポインタ判定（手のひらを線にしない）・描画中の画面固定・
 * ピンチズーム対応の座標変換を備える。書き終えるたびに onStrokesChange で全画を親へ渡す。
 * 親が resetToken を変えると白紙に戻る。
 */

import { useCallback, useEffect, useRef } from 'react'
import type { PenPoint, PenStroke } from '@/lib/pen-syntax/types'
import { evaluatePointer, initialPalmState, type InputPolicy, type PalmState } from '@/lib/pen-syntax/palm'
import { resolveLocalPoint } from '@/lib/pen-syntax/local-point'
import { freezeScreenDuringStroke } from './usePenScreenGuard'

interface EnrollCanvasProps {
  policy: InputPolicy
  onStrokesChange: (strokes: PenStroke[]) => void
  /** 値が変わるとキャンバスを白紙に戻す */
  resetToken: number
  width?: number
  height?: number
}

export function EnrollCanvas({
  policy,
  onStrokesChange,
  resetToken,
  width = 280,
  height = 150,
}: EnrollCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const strokesRef = useRef<PenStroke[]>([])
  const drawingRef = useRef<{ pointerId: number; stroke: PenPoint[] } | null>(null)
  const palmRef = useRef<PalmState>(initialPalmState())
  const unfreezeRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    return () => unfreezeRef.current?.()
  }, [])

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#1C2B4B'
    const paint = (stroke: PenPoint[]) => {
      if (stroke.length < 2) return
      ctx.beginPath()
      ctx.moveTo(stroke[0].x, stroke[0].y)
      for (let i = 1; i < stroke.length; i++) ctx.lineTo(stroke[i].x, stroke[i].y)
      ctx.stroke()
    }
    for (const s of strokesRef.current) paint(s)
    if (drawingRef.current) paint(drawingRef.current.stroke)
  }, [])

  useEffect(() => {
    strokesRef.current = []
    drawingRef.current = null
    redraw()
    onStrokesChange([])
    // resetToken が変わったときだけ白紙に戻す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetToken])

  const toLocal = (e: React.PointerEvent<HTMLCanvasElement>): PenPoint => {
    const rect = e.currentTarget.getBoundingClientRect()
    const ne = e.nativeEvent as PointerEvent
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
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

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="max-w-full rounded-xl border border-dashed border-gray-300 bg-paper"
      style={{ touchAction: 'none' }}
      onPointerDown={(e) => {
        const decision = evaluatePointer(
          { pointerType: e.pointerType, width: e.width, height: e.height },
          policy,
          palmRef.current,
        )
        palmRef.current = decision.next
        if (!decision.accept) {
          e.preventDefault()
          return
        }
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          // 失敗しても書ける
        }
        // 線を描いている間は画面全体のスクロールを止める（狙いがずれる不具合対策）
        unfreezeRef.current?.()
        unfreezeRef.current = freezeScreenDuringStroke()
        drawingRef.current = { pointerId: e.pointerId, stroke: [toLocal(e)] }
        redraw()
      }}
      onPointerMove={(e) => {
        const d = drawingRef.current
        if (!d || d.pointerId !== e.pointerId) return
        d.stroke.push(toLocal(e))
        redraw()
      }}
      onPointerUp={(e) => {
        const d = drawingRef.current
        if (!d || d.pointerId !== e.pointerId) return
        unfreezeRef.current?.()
        unfreezeRef.current = null
        drawingRef.current = null
        if (d.stroke.length >= 2) {
          strokesRef.current = [...strokesRef.current, d.stroke]
          onStrokesChange(strokesRef.current)
        }
        redraw()
      }}
      onPointerCancel={(e) => {
        const d = drawingRef.current
        if (!d || d.pointerId !== e.pointerId) return
        unfreezeRef.current?.()
        unfreezeRef.current = null
        drawingRef.current = null
        redraw()
      }}
    />
  )
}
