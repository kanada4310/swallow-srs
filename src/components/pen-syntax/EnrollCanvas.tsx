'use client'

/**
 * お手本登録用の書き込みキャンバス（初回登録フロー・計測ページの登録欄で共用）。
 *
 * 入力処理（接触の受理判定・描画中の画面固定・ピンチズーム対応の座標変換）は
 * 判別キャンバスと同じ useStrokeCanvas を使う（入力層の一本化・2026-08-26）。
 * 書き終えるたびに onStrokesChange で全画を親へ渡す。
 * 親が resetToken を変えると白紙に戻る。
 */

import { useCallback, useEffect, useRef } from 'react'
import type { PenPoint, PenStroke } from '@/lib/pen-syntax/types'
import type { InputPolicy } from '@/lib/pen-syntax/palm'
import { useStrokeCanvas, type DrawingStroke } from './useStrokeCanvas'
import { PEN_WRITE_ZONE_ATTR } from '@/lib/pen-syntax/zone-guard'

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
  const drawingRef = useRef<DrawingStroke | null>(null)

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

  const { handlers } = useStrokeCanvas({
    containerRef: canvasRef,
    drawingRef,
    policy,
    onStroke: (stroke, phase) => {
      // 中断（cancel）した画は登録に数えない
      if (phase === 'up' && stroke.length >= 2) {
        strokesRef.current = [...strokesRef.current, stroke]
        onStrokesChange(strokesRef.current)
      }
      redraw()
    },
    onRedraw: redraw,
  })

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="max-w-full rounded-xl border border-dashed border-gray-300 bg-paper"
      style={{ touchAction: 'none' }}
      {...{ [PEN_WRITE_ZONE_ATTR]: '' }}
      {...handlers}
    />
  )
}
