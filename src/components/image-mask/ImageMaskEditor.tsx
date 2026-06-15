'use client'

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { SUPPORTED_IMAGE_TYPES, MAX_IMAGE_SIZE } from '@/lib/constants'
import type { NoteType } from '@/types/database'

interface EditRegion {
  id: string
  x: number // %
  y: number
  w: number
  h: number
  answer: string
  included: boolean
  source: 'ai' | 'manual'
}

interface ImageMaskEditorProps {
  deckId: string
  noteType: NoteType
}

type DragMode = 'move' | 'resize' | 'draw' | null
interface DragState {
  mode: DragMode
  id: string | null
  startPx: number // pointer start in %
  startPy: number
  orig: { x: number; y: number; w: number; h: number }
}

const MIN_SIZE = 2 // 最小ボックスサイズ（%）

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

export function ImageMaskEditor({ deckId, noteType }: ImageMaskEditorProps) {
  const router = useRouter()
  const { profile } = useAuth()

  const [step, setStep] = useState<'upload' | 'edit'>('upload')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [regions, setRegions] = useState<EditRegion[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [maskCount, setMaskCount] = useState('')
  const [heading, setHeading] = useState('')
  const [note, setNote] = useState('')

  const [loading, setLoading] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])

  const fileInputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)

  const readAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })

  // 画像選択 → アップロード＋候補検出を並行実行
  const handleFile = async (file: File) => {
    setError(null)
    setWarnings([])
    if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
      setError('対応形式: JPEG / PNG / WebP / GIF')
      return
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setError('画像サイズは10MBまでです')
      return
    }

    setLoading(true)
    setDetecting(true)
    try {
      const dataUrl = await readAsDataUrl(file)

      const uploadPromise = fetch('/api/images/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl, imageType: file.type }),
      }).then((r) => r.json())

      const detectPromise = fetch('/api/image-mask-candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl, imageType: file.type }),
      })
        .then((r) => r.json())
        .catch(() => ({ candidates: [] }))

      const uploadData = await uploadPromise
      if (!uploadData.imageUrl) {
        throw new Error(uploadData.error || '画像アップロードに失敗しました')
      }
      setImageUrl(uploadData.imageUrl)
      setStep('edit')
      setLoading(false)

      // 候補検出は時間がかかるので別途待つ
      const detectData = await detectPromise
      setDetecting(false)
      if (Array.isArray(detectData.warnings)) setWarnings(detectData.warnings)
      const candidates = Array.isArray(detectData.candidates) ? detectData.candidates : []
      setRegions(
        candidates.map(
          (c: { text: string; x: number; y: number; w: number; h: number }): EditRegion => ({
            id: crypto.randomUUID(),
            x: clamp(c.x, 0, 100),
            y: clamp(c.y, 0, 100),
            w: clamp(c.w, MIN_SIZE, 100),
            h: clamp(c.h, MIN_SIZE, 100),
            answer: c.text || '',
            included: true,
            source: 'ai',
          })
        )
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : '処理に失敗しました')
      setLoading(false)
      setDetecting(false)
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // pointer → コンテナ相対の %
  const pointerToPct = useCallback((e: PointerEvent | React.PointerEvent): { px: number; py: number } => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return { px: 0, py: 0 }
    return {
      px: clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100),
      py: clamp(((e.clientY - rect.top) / rect.height) * 100, 0, 100),
    }
  }, [])

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || !drag.mode) return
      const { px, py } = pointerToPct(e)
      const dx = px - drag.startPx
      const dy = py - drag.startPy

      setRegions((prev) =>
        prev.map((r) => {
          if (drag.id && r.id !== drag.id && drag.mode !== 'draw') return r
          if (drag.mode === 'move' && r.id === drag.id) {
            return {
              ...r,
              x: clamp(drag.orig.x + dx, 0, 100 - r.w),
              y: clamp(drag.orig.y + dy, 0, 100 - r.h),
            }
          }
          if (drag.mode === 'resize' && r.id === drag.id) {
            return {
              ...r,
              w: clamp(drag.orig.w + dx, MIN_SIZE, 100 - r.x),
              h: clamp(drag.orig.h + dy, MIN_SIZE, 100 - r.y),
            }
          }
          if (drag.mode === 'draw' && r.id === drag.id) {
            const nx = Math.min(drag.startPx, px)
            const ny = Math.min(drag.startPy, py)
            return {
              ...r,
              x: nx,
              y: ny,
              w: clamp(Math.abs(px - drag.startPx), 0, 100 - nx),
              h: clamp(Math.abs(py - drag.startPy), 0, 100 - ny),
            }
          }
          return r
        })
      )
    },
    [pointerToPct]
  )

  const onPointerUp = useCallback(() => {
    const drag = dragRef.current
    if (drag?.mode === 'draw' && drag.id) {
      // 小さすぎる描画は破棄
      setRegions((prev) =>
        prev.filter((r) => !(r.id === drag.id && (r.w < MIN_SIZE || r.h < MIN_SIZE)))
      )
    }
    dragRef.current = null
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
  }, [onPointerMove])

  const startDrag = (mode: DragMode, id: string | null, e: React.PointerEvent, orig: DragState['orig']) => {
    e.preventDefault()
    e.stopPropagation()
    const { px, py } = pointerToPct(e)
    dragRef.current = { mode, id, startPx: px, startPy: py, orig }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  // 背景でのドラッグ開始 → 新規ボックス描画
  const handleContainerPointerDown = (e: React.PointerEvent) => {
    if (e.target !== containerRef.current && e.target !== e.currentTarget) {
      // 画像自体の上で開始した場合も描画扱いにする
    }
    const { px, py } = pointerToPct(e)
    const id = crypto.randomUUID()
    const newRegion: EditRegion = { id, x: px, y: py, w: 0, h: 0, answer: '', included: true, source: 'manual' }
    setRegions((prev) => [...prev, newRegion])
    setSelectedId(id)
    startDrag('draw', id, e, { x: px, y: py, w: 0, h: 0 })
  }

  const updateRegion = (id: string, patch: Partial<EditRegion>) => {
    setRegions((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  const deleteRegion = (id: string) => {
    setRegions((prev) => prev.filter((r) => r.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  const includedRegions = regions.filter((r) => r.included)

  const handleSave = async () => {
    setError(null)
    if (!imageUrl) return
    if (includedRegions.length === 0) {
      setError('出題対象のマスクを1つ以上にしてください')
      return
    }
    setSaving(true)
    try {
      const maskRegions = includedRegions.map((r) => ({
        id: r.id,
        x: Math.round(r.x * 100) / 100,
        y: Math.round(r.y * 100) / 100,
        w: Math.round(r.w * 100) / 100,
        h: Math.round(r.h * 100) / 100,
        answer: r.answer.trim(),
      }))

      const fieldValues: Record<string, string> = {
        画像: imageUrl,
        マスク領域: JSON.stringify(maskRegions),
        毎回隠す数: maskCount.trim(),
        見出し: heading.trim(),
        補足: note.trim(),
      }

      const resp = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deckId, noteTypeId: noteType.id, fieldValues }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'ノートの作成に失敗しました')

      // 即時オフライン反映のため同期
      if (profile) {
        const { fullSync } = await import('@/lib/db/sync')
        await fullSync(profile.id).catch(() => {})
      }
      router.push(`/decks/${deckId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ノートの作成に失敗しました')
      setSaving(false)
    }
  }

  if (step === 'upload') {
    return (
      <div className="space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept={SUPPORTED_IMAGE_TYPES.join(',')}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
          }}
        />
        <button
          type="button"
          disabled={loading}
          onClick={() => fileInputRef.current?.click()}
          className="w-full flex flex-col items-center justify-center gap-2 py-12 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-blue-400 hover:text-blue-500 transition-colors disabled:opacity-50"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="w-5 h-5 animate-spin rounded-full border-2 border-gray-200 border-t-blue-500" />
              アップロード中...
            </span>
          ) : (
            <>
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="font-medium">画像を選択</span>
              <span className="text-xs text-gray-400">AIがマスキング候補を提案します</span>
            </>
          )}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}
      {warnings.length > 0 && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-700 text-xs">
          {warnings.map((w, i) => (
            <div key={i}>{w}</div>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-500">
        候補をタップで選択/解除、ドラッグで移動・右下で拡大縮小。画像の余白をドラッグすると新しいマスクを描けます。
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
                {/* リサイズハンドル（右下） */}
                <div
                  onPointerDown={(e) => {
                    setSelectedId(r.id)
                    startDrag('resize', r.id, e, { x: r.x, y: r.y, w: r.w, h: r.h })
                  }}
                  className="absolute -right-1.5 -bottom-1.5 w-3 h-3 bg-blue-600 rounded-sm cursor-se-resize"
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

      {/* 領域リスト */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-700">
            マスク領域（{includedRegions.length} / {regions.length}）
          </h3>
        </div>
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

      {/* 設定 */}
      <div className="grid grid-cols-1 gap-3 pt-2 border-t border-gray-100">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">見出し（庭・一覧用の短いラベル）</label>
          <input
            type="text"
            value={heading}
            onChange={(e) => setHeading(e.target.value)}
            placeholder="例: 植物細胞の構造"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">毎回隠す数（空欄=約3割を自動）</label>
          <input
            type="number"
            min={1}
            value={maskCount}
            onChange={(e) => setMaskCount(e.target.value)}
            placeholder="自動"
            className="w-32 px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">補足（裏面に表示・任意）</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={() => router.push(`/decks/${deckId}`)}
          className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
        >
          キャンセル
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 font-medium"
        >
          {saving ? '作成中...' : 'ノートを作成'}
        </button>
      </div>
    </div>
  )
}
