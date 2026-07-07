'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { SUPPORTED_IMAGE_TYPES, MAX_IMAGE_SIZE } from '@/lib/constants'
import type { NoteType } from '@/types/database'
import {
  MaskRegionEditor,
  candidateToRegion,
  regionsToMaskPayload,
  type EditRegion,
} from './MaskRegionEditor'
import { readAsDataUrl, uploadImage, detectCandidates } from './api'

interface BulkImageMaskCreatorProps {
  deckId: string
  noteType: NoteType
}

type ItemStatus = 'queued' | 'processing' | 'ready' | 'error' | 'saving' | 'done'

interface Item {
  id: string
  fileName: string
  imageUrl: string | null
  regions: EditRegion[]
  heading: string
  status: ItemStatus
  error?: string
  source?: string | null
  expanded: boolean
}

const CONCURRENCY = 3

export function BulkImageMaskCreator({ deckId, noteType }: BulkImageMaskCreatorProps) {
  const router = useRouter()
  const { profile } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [items, setItems] = useState<Item[]>([])
  const [maskCount, setMaskCount] = useState('')
  const [busy, setBusy] = useState(false) // 取り込み処理中
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  const patchItem = (id: string, patch: Partial<Item>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)))

  // 複数ファイル取り込み → 並列でアップロード＋AI検出
  const handleFiles = async (fileList: FileList) => {
    setError(null)
    const files = Array.from(fileList).filter((f) => {
      if (!SUPPORTED_IMAGE_TYPES.includes(f.type)) return false
      if (f.size > MAX_IMAGE_SIZE) return false
      return true
    })
    if (files.length === 0) {
      setError('対応形式（JPEG/PNG/WebP/GIF・10MBまで）の画像がありませんでした')
      return
    }

    const newItems: Item[] = files.map((f) => ({
      id: crypto.randomUUID(),
      fileName: f.name,
      imageUrl: null,
      regions: [],
      heading: f.name.replace(/\.[^.]+$/, ''),
      status: 'queued',
      expanded: false,
    }))
    setItems((prev) => [...prev, ...newItems])
    setBusy(true)

    // 並列プール
    let cursor = 0
    const worker = async () => {
      while (cursor < files.length) {
        const idx = cursor++
        const file = files[idx]
        const item = newItems[idx]
        patchItem(item.id, { status: 'processing' })
        try {
          const dataUrl = await readAsDataUrl(file)
          const detectPromise = detectCandidates(dataUrl, file.type)
          const url = await uploadImage(dataUrl, file.type)
          const detect = await detectPromise
          patchItem(item.id, {
            imageUrl: url,
            regions: detect.candidates.map(candidateToRegion),
            source: detect.source,
            status: 'ready',
          })
        } catch (e) {
          patchItem(item.id, { status: 'error', error: e instanceof Error ? e.message : '処理に失敗' })
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker))
    setBusy(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeItem = (id: string) => setItems((prev) => prev.filter((it) => it.id !== id))

  const readyItems = items.filter(
    (it) => it.status === 'ready' && it.imageUrl && it.regions.some((r) => r.included)
  )

  const handleCreateAll = async () => {
    setError(null)
    if (readyItems.length === 0) {
      setError('作成できるノートがありません（各画像で出題対象のマスクを1つ以上にしてください）')
      return
    }
    setCreating(true)
    setProgress({ done: 0, total: readyItems.length })
    let done = 0
    let failed = 0
    for (const it of readyItems) {
      patchItem(it.id, { status: 'saving' })
      try {
        const payload = regionsToMaskPayload(it.regions)
        const fieldValues: Record<string, string> = {
          画像: it.imageUrl!,
          マスク領域: JSON.stringify(payload),
          毎回隠す数: maskCount.trim(),
          見出し: it.heading.trim(),
          補足: '',
        }
        const resp = await fetch('/api/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deckId, noteTypeId: noteType.id, fieldValues }),
        })
        if (!resp.ok) {
          const d = await resp.json().catch(() => ({}))
          throw new Error(d.error || `HTTP ${resp.status}`)
        }
        patchItem(it.id, { status: 'done' })
      } catch (e) {
        failed++
        patchItem(it.id, { status: 'error', error: e instanceof Error ? e.message : '作成失敗' })
      }
      done++
      setProgress({ done, total: readyItems.length })
    }

    if (profile) {
      const { fullSync } = await import('@/lib/db/sync')
      await fullSync(profile.id).catch(() => {})
    }
    setCreating(false)
    if (failed === 0) {
      router.push(`/decks/${deckId}`)
    } else {
      setError(`${done - failed}件作成、${failed}件失敗しました。失敗分は残っています。`)
    }
  }

  const statusLabel = (it: Item) => {
    switch (it.status) {
      case 'queued':
        return '待機中'
      case 'processing':
        return '解析中…'
      case 'ready':
        return `${it.regions.filter((r) => r.included).length}/${it.regions.length} 個`
      case 'saving':
        return '作成中…'
      case 'done':
        return '✅ 作成済み'
      case 'error':
        return `⚠ ${it.error || 'エラー'}`
    }
  }

  const statusBadgeClass = (status: ItemStatus) => {
    switch (status) {
      case 'done':
        return 'bg-good-bg text-good'
      case 'error':
        return 'bg-again-bg text-again'
      case 'processing':
      case 'saving':
      case 'ready':
        return 'bg-sora-soft text-sora'
      default:
        return 'bg-gray-100 text-ink-3'
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-again-bg rounded-2xl text-again text-sm">{error}</div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={SUPPORTED_IMAGE_TYPES.join(',')}
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) handleFiles(e.target.files)
        }}
      />

      <div className="flex flex-wrap items-end gap-3">
        <button
          type="button"
          disabled={busy || creating}
          onClick={() => fileInputRef.current?.click()}
          className="px-4 py-2 bg-sora text-white rounded-2xl hover:bg-sora-dark disabled:opacity-50 font-bold transition-colors"
        >
          {busy ? '取り込み中…' : '画像を追加（複数可）'}
        </button>
        <div>
          <label className="block text-xs text-ink-3 mb-1">毎回隠す数（全件共通・空欄=約3割）</label>
          <input
            type="number"
            min={1}
            value={maskCount}
            onChange={(e) => setMaskCount(e.target.value)}
            placeholder="自動"
            className="w-28 px-3 py-1.5 border border-gray-300 rounded-xl outline-none focus:border-sora focus:ring-sora focus:ring-2"
          />
        </div>
      </div>

      {items.length > 0 && (
        <p className="text-xs text-ink-3">
          各画像が1ノート（1問）になります。枠を確認し、必要なら「編集」で微調整してください。見出しは庭・一覧で使われます。
        </p>
      )}

      {/* アイテム一覧 */}
      <div className="space-y-3">
        {items.map((it) => (
          <div key={it.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-3 p-3">
              {/* サムネ */}
              <div className="w-16 h-16 flex-shrink-0 bg-gray-50 rounded overflow-hidden flex items-center justify-center">
                {it.imageUrl ? (
                  <div className="relative inline-block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={it.imageUrl} alt="" className="max-w-[64px] max-h-[64px] block" />
                    {it.regions
                      .filter((r) => r.included)
                      .map((r) => (
                        <div
                          key={r.id}
                          className="absolute"
                          style={{
                            left: `${r.x}%`,
                            top: `${r.y}%`,
                            width: `${r.w}%`,
                            height: `${r.h}%`,
                            background: 'rgba(37,99,235,0.4)',
                          }}
                        />
                      ))}
                  </div>
                ) : it.status === 'processing' ? (
                  <span className="w-5 h-5 animate-spin rounded-full border-2 border-gray-200 border-t-sora" />
                ) : (
                  <span className="text-ink-3 text-xs">画像</span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <input
                  type="text"
                  value={it.heading}
                  onChange={(e) => patchItem(it.id, { heading: e.target.value })}
                  placeholder="見出し"
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded-xl outline-none focus:border-sora focus:ring-sora focus:ring-1"
                />
                <div className="mt-1">
                  <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${statusBadgeClass(it.status)}`}
                  >
                    {statusLabel(it)}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-1 flex-shrink-0">
                {it.status === 'ready' && (
                  <button
                    type="button"
                    onClick={() => patchItem(it.id, { expanded: !it.expanded })}
                    className="px-3 py-1 text-xs font-bold text-sora border border-sora rounded-2xl hover:bg-sora-soft transition-colors"
                  >
                    {it.expanded ? '閉じる' : '編集'}
                  </button>
                )}
                {it.status !== 'done' && it.status !== 'saving' && (
                  <button
                    type="button"
                    onClick={() => removeItem(it.id)}
                    className="px-3 py-1 text-xs font-bold text-ink-3 border border-gray-200 rounded-2xl hover:text-ink-2 hover:bg-gray-50 transition-colors"
                  >
                    除外
                  </button>
                )}
              </div>
            </div>

            {it.expanded && it.imageUrl && (
              <div className="border-t border-gray-100 p-3 bg-gray-50/50">
                {it.source && (
                  <p className="text-[11px] text-ink-3 mb-2">
                    検出: {it.source === 'google-vision' ? '高精度OCR（Google Vision）' : 'AI推定（要微調整）'}
                  </p>
                )}
                <MaskRegionEditor
                  imageUrl={it.imageUrl}
                  regions={it.regions}
                  onChange={(rs) => patchItem(it.id, { regions: rs })}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {items.length > 0 && (
        <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={() => router.push(`/decks/${deckId}`)}
            className="px-4 py-2 bg-white border-2 border-sora text-sora rounded-2xl hover:bg-sora-soft font-bold transition-colors"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleCreateAll}
            disabled={creating || busy || readyItems.length === 0}
            className="flex-1 px-4 py-2 bg-sora text-white rounded-2xl hover:bg-sora-dark disabled:bg-gray-300 font-bold transition-colors"
          >
            {creating
              ? `作成中… ${progress?.done ?? 0}/${progress?.total ?? 0}`
              : `全て作成（${readyItems.length}件）`}
          </button>
        </div>
      )}
    </div>
  )
}
