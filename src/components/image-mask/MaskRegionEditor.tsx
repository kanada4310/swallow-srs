'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// 画像マスキングの編集領域（クライアント内の作業用。保存時に included のみ直列化）
export interface EditRegion {
  id: string
  x: number // %
  y: number
  w: number
  h: number
  answer: string
  included: boolean
  source: 'ai' | 'manual'
}

export const MIN_SIZE = 2 // 最小ボックスサイズ（%）
const MOVE_THRESHOLD = 1.2 // これ未満の動きはタップ扱い（%）

export function clampPct(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

// AI候補 → EditRegion
export function candidateToRegion(c: {
  text: string
  x: number
  y: number
  w: number
  h: number
  recommended?: boolean
}): EditRegion {
  return {
    id: crypto.randomUUID(),
    x: clampPct(c.x, 0, 100),
    y: clampPct(c.y, 0, 100),
    w: clampPct(c.w, MIN_SIZE, 100),
    h: clampPct(c.h, MIN_SIZE, 100),
    answer: c.text || '',
    included: c.recommended !== false,
    source: 'ai',
  }
}

// 保存済み マスク領域(JSON) → EditRegion[]（再編集用。保存済みは全て出題対象）
export function maskJsonToRegions(json: string): EditRegion[] {
  try {
    const arr = JSON.parse(json)
    if (!Array.isArray(arr)) return []
    return arr
      .filter((r) => r && typeof r === 'object')
      .map((r) => ({
        id: typeof r.id === 'string' ? r.id : crypto.randomUUID(),
        x: clampPct(Number(r.x) || 0, 0, 100),
        y: clampPct(Number(r.y) || 0, 0, 100),
        w: clampPct(Number(r.w) || MIN_SIZE, MIN_SIZE, 100),
        h: clampPct(Number(r.h) || MIN_SIZE, MIN_SIZE, 100),
        answer: typeof r.answer === 'string' ? r.answer : '',
        included: true,
        source: 'ai' as const,
      }))
  } catch {
    return []
  }
}

// included のみを保存用JSON配列に（座標は小数2桁丸め）
export function regionsToMaskPayload(regions: EditRegion[]) {
  return regions
    .filter((r) => r.included)
    .map((r) => ({
      id: r.id,
      x: Math.round(r.x * 100) / 100,
      y: Math.round(r.y * 100) / 100,
      w: Math.round(r.w * 100) / 100,
      h: Math.round(r.h * 100) / 100,
      answer: r.answer.trim(),
    }))
}

type DragMode = 'move' | 'resize' | 'draw' | null
interface DragState {
  mode: DragMode
  id: string | null
  startPx: number
  startPy: number
  orig: { x: number; y: number; w: number; h: number }
  moved: boolean
  prevSelected: string | null
}

interface MaskRegionEditorProps {
  imageUrl: string
  regions: EditRegion[]
  onChange: (regions: EditRegion[]) => void
  /** 検出中スピナーを表示 */
  detecting?: boolean
}

// 画像＋マスク領域のビジュアル編集（controlled）。単一作成・一括レビュー・再編集で共有。
export function MaskRegionEditor({ imageUrl, regions, onChange, detecting }: MaskRegionEditorProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  // 常に最新の regions を保持（ドラッグ中の連続更新で参照）
  const regionsRef = useRef(regions)
  regionsRef.current = regions

  const includedCount = regions.filter((r) => r.included).length

  const pointerToPct = useCallback((e: PointerEvent | React.PointerEvent): { px: number; py: number } => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return { px: 0, py: 0 }
    return {
      px: clampPct(((e.clientX - rect.left) / rect.width) * 100, 0, 100),
      py: clampPct(((e.clientY - rect.top) / rect.height) * 100, 0, 100),
    }
  }, [])

  const emit = useCallback(
    (next: EditRegion[]) => {
      regionsRef.current = next
      onChange(next)
    },
    [onChange]
  )

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || !drag.mode) return
      const { px, py } = pointerToPct(e)
      const dx = px - drag.startPx
      const dy = py - drag.startPy

      if (!drag.moved && Math.hypot(dx, dy) < MOVE_THRESHOLD) return

      let current = regionsRef.current
      if (!drag.moved) {
        drag.moved = true
        if (drag.mode === 'draw' && !drag.id) {
          const id = crypto.randomUUID()
          drag.id = id
          current = [
            ...current,
            { id, x: drag.startPx, y: drag.startPy, w: 0, h: 0, answer: '', included: true, source: 'manual' },
          ]
          setSelectedId(id)
        }
      }

      const next = current.map((r) => {
        if (r.id !== drag.id) return r
        if (drag.mode === 'move') {
          return { ...r, x: clampPct(drag.orig.x + dx, 0, 100 - r.w), y: clampPct(drag.orig.y + dy, 0, 100 - r.h) }
        }
        if (drag.mode === 'resize') {
          return { ...r, w: clampPct(drag.orig.w + dx, MIN_SIZE, 100 - r.x), h: clampPct(drag.orig.h + dy, MIN_SIZE, 100 - r.y) }
        }
        if (drag.mode === 'draw') {
          const nx = Math.min(drag.startPx, px)
          const ny = Math.min(drag.startPy, py)
          return {
            ...r,
            x: nx,
            y: ny,
            w: clampPct(Math.abs(px - drag.startPx), 0, 100 - nx),
            h: clampPct(Math.abs(py - drag.startPy), 0, 100 - ny),
          }
        }
        return r
      })
      emit(next)
    },
    [pointerToPct, emit]
  )

  const onPointerUp = useCallback(() => {
    const drag = dragRef.current
    if (drag) {
      if (!drag.moved && drag.mode === 'draw' && drag.prevSelected) {
        // 画像タップ＝選択中の枠の中心をタップ位置へ移動
        emit(
          regionsRef.current.map((r) =>
            r.id === drag.prevSelected
              ? {
                  ...r,
                  x: clampPct(drag.startPx - r.w / 2, 0, 100 - r.w),
                  y: clampPct(drag.startPy - r.h / 2, 0, 100 - r.h),
                }
              : r
          )
        )
      } else if (drag.mode === 'draw' && drag.id) {
        // 小さすぎる描画は破棄
        emit(regionsRef.current.filter((r) => !(r.id === drag.id && (r.w < MIN_SIZE || r.h < MIN_SIZE))))
      }
    }
    dragRef.current = null
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
  }, [onPointerMove, emit])

  const startDrag = (mode: DragMode, id: string | null, e: React.PointerEvent, orig: DragState['orig']) => {
    e.preventDefault()
    e.stopPropagation()
    const { px, py } = pointerToPct(e)
    dragRef.current = { mode, id, startPx: px, startPy: py, orig, moved: false, prevSelected: selectedId }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  const handleContainerPointerDown = (e: React.PointerEvent) => {
    const { px, py } = pointerToPct(e)
    dragRef.current = {
      mode: 'draw',
      id: null,
      startPx: px,
      startPy: py,
      orig: { x: px, y: py, w: 0, h: 0 },
      moved: false,
      prevSelected: selectedId,
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  const nudge = (dx: number, dy: number) => {
    if (!selectedId) return
    emit(
      regionsRef.current.map((r) =>
        r.id === selectedId ? { ...r, x: clampPct(r.x + dx, 0, 100 - r.w), y: clampPct(r.y + dy, 0, 100 - r.h) } : r
      )
    )
  }
  const resizeBy = (dw: number, dh: number) => {
    if (!selectedId) return
    emit(
      regionsRef.current.map((r) =>
        r.id === selectedId
          ? { ...r, w: clampPct(r.w + dw, MIN_SIZE, 100 - r.x), h: clampPct(r.h + dh, MIN_SIZE, 100 - r.y) }
          : r
      )
    )
  }

  useEffect(() => {
    if (!selectedId) return
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      const step = e.shiftKey ? 3 : 0.5
      if (e.key === 'ArrowLeft') { e.preventDefault(); nudge(-step, 0) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); nudge(step, 0) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); nudge(0, -step) }
      else if (e.key === 'ArrowDown') { e.preventDefault(); nudge(0, step) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  const updateRegion = (id: string, patch: Partial<EditRegion>) => {
    emit(regionsRef.current.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }
  const deleteRegion = (id: string) => {
    emit(regionsRef.current.filter((r) => r.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        枠をタップで選択→ドラッグで移動・右下で拡大縮小。<b>選択中に画像をタップするとその位置へ移動</b>。何もない所をドラッグで新規マスク。下のボタン（PCは矢印キー）でも微調整できます。
      </p>

      {/* 画像＋オーバーレイ */}
      <div className="select-none overflow-hidden rounded-lg border border-gray-200">
        <div
          ref={containerRef}
          className="relative inline-block w-full touch-none"
          style={{ lineHeight: 0 }}
          onPointerDown={handleContainerPointerDown}
        >
          {imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="マスキング対象" className="block w-full h-auto" draggable={false} />
          )}
          {regions.map((r) => {
            const selected = r.id === selectedId
            return (
              <div
                key={r.id}
                onPointerDown={(e) => {
                  setSelectedId(r.id)
                  startDrag('move', r.id, e, { x: r.x, y: r.y, w: r.w, h: r.h })
                }}
                className="absolute cursor-move"
                style={{
                  left: `${r.x}%`,
                  top: `${r.y}%`,
                  width: `${r.w}%`,
                  height: `${r.h}%`,
                  border: selected ? '2px solid #2563eb' : '2px solid rgba(37,99,235,0.5)',
                  background: r.included ? 'rgba(37,99,235,0.25)' : 'rgba(148,163,184,0.15)',
                  borderRadius: 3,
                  boxSizing: 'border-box',
                }}
              >
                <div
                  onPointerDown={(e) => {
                    setSelectedId(r.id)
                    startDrag('resize', r.id, e, { x: r.x, y: r.y, w: r.w, h: r.h })
                  }}
                  className="absolute -right-2 -bottom-2 w-4 h-4 bg-blue-600 border-2 border-white rounded-sm cursor-se-resize shadow"
                  style={{ touchAction: 'none' }}
                />
              </div>
            )
          })}
        </div>
      </div>

      {detecting && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className="w-4 h-4 animate-spin rounded-full border-2 border-gray-200 border-t-blue-500" />
          AIがマスキング候補を検出中...
        </div>
      )}

      {/* 選択中の枠の微調整パッド */}
      {selectedId && (
        <div className="flex items-center justify-between gap-3 p-2 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500 mr-1">位置</span>
            <NudgeBtn onClick={() => nudge(-1, 0)} label="←" />
            <div className="flex flex-col gap-1">
              <NudgeBtn onClick={() => nudge(0, -1)} label="↑" />
              <NudgeBtn onClick={() => nudge(0, 1)} label="↓" />
            </div>
            <NudgeBtn onClick={() => nudge(1, 0)} label="→" />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500 mr-1">幅</span>
            <NudgeBtn onClick={() => resizeBy(-1, 0)} label="−" />
            <NudgeBtn onClick={() => resizeBy(1, 0)} label="＋" />
            <span className="text-xs text-gray-500 mx-1">高</span>
            <NudgeBtn onClick={() => resizeBy(0, -1)} label="−" />
            <NudgeBtn onClick={() => resizeBy(0, 1)} label="＋" />
          </div>
        </div>
      )}

      {/* 領域リスト */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-gray-700">
          マスク領域（{includedCount} / {regions.length}）
        </h3>
        {regions.length === 0 && !detecting && (
          <p className="text-sm text-gray-400">候補がありません。画像をドラッグしてマスクを描いてください。</p>
        )}
        {regions.map((r, i) => (
          <div
            key={r.id}
            onClick={() => setSelectedId(r.id)}
            className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer ${
              r.id === selectedId ? 'border-blue-400 bg-blue-50' : 'border-gray-200'
            }`}
          >
            <input
              type="checkbox"
              checked={r.included}
              onChange={(e) => updateRegion(r.id, { included: e.target.checked })}
              onClick={(e) => e.stopPropagation()}
              className="w-4 h-4"
              title="出題対象"
            />
            <span className="text-xs text-gray-400 w-5 flex-shrink-0">{i + 1}</span>
            <input
              type="text"
              value={r.answer}
              onChange={(e) => updateRegion(r.id, { answer: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              placeholder="正解テキスト"
              className="flex-1 min-w-0 px-2 py-1 text-sm border border-gray-300 rounded outline-none focus:ring-1 focus:ring-blue-500"
            />
            {r.source === 'ai' && <span className="text-[10px] text-purple-500 flex-shrink-0">AI</span>}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                deleteRegion(r.id)
              }}
              className="text-gray-400 hover:text-red-500 flex-shrink-0"
              title="削除"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function NudgeBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-8 h-7 flex items-center justify-center text-sm text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-100 active:bg-gray-200 select-none"
    >
      {label}
    </button>
  )
}
