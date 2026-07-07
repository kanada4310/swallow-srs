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

interface ImageMaskEditorProps {
  deckId: string
  noteType: NoteType
}

// 単一の画像マスキングノートを作成（アップロード→AI候補→編集→保存）
export function ImageMaskEditor({ deckId, noteType }: ImageMaskEditorProps) {
  const router = useRouter()
  const { profile } = useAuth()

  const [step, setStep] = useState<'upload' | 'edit'>('upload')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [regions, setRegions] = useState<EditRegion[]>([])
  const [maskCount, setMaskCount] = useState('')
  const [heading, setHeading] = useState('')
  const [note, setNote] = useState('')

  const [loading, setLoading] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [detectSource, setDetectSource] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])

  const fileInputRef = useRef<HTMLInputElement>(null)

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
      const detectPromise = detectCandidates(dataUrl, file.type)

      const url = await uploadImage(dataUrl, file.type)
      setImageUrl(url)
      setStep('edit')
      setLoading(false)

      const detect = await detectPromise
      setDetecting(false)
      setDetectSource(detect.source)
      const newWarnings = [...detect.warnings]
      if (!detect.ok) {
        newWarnings.unshift(
          `候補の自動検出に失敗しました（${detect.error}）。手動でマスクを描いてください。`
        )
      } else if (detect.candidates.length === 0) {
        newWarnings.push('用語の候補が見つかりませんでした。画像をドラッグして手動でマスクを描いてください。')
      }
      setWarnings(newWarnings)
      setRegions(detect.candidates.map(candidateToRegion))
    } catch (err) {
      setError(err instanceof Error ? err.message : '処理に失敗しました')
      setLoading(false)
      setDetecting(false)
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleSave = async () => {
    setError(null)
    if (!imageUrl) return
    const payload = regionsToMaskPayload(regions)
    if (payload.length === 0) {
      setError('出題対象のマスクを1つ以上にしてください')
      return
    }
    setSaving(true)
    try {
      const fieldValues: Record<string, string> = {
        画像: imageUrl,
        マスク領域: JSON.stringify(payload),
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
          <div className="p-3 bg-again-bg rounded-2xl text-again text-sm">{error}</div>
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
          className="w-full flex flex-col items-center justify-center gap-2 py-12 border-2 border-dashed border-gray-300 rounded-card text-ink-3 hover:border-sora hover:text-sora transition-colors disabled:opacity-50"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="w-5 h-5 animate-spin rounded-full border-2 border-gray-200 border-t-sora" />
              アップロード中...
            </span>
          ) : (
            <>
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="font-bold">画像を選択</span>
              <span className="text-xs text-ink-3">AIがマスキング候補を提案します</span>
            </>
          )}
        </button>
        <p className="text-center text-xs text-ink-3">
          複数枚をまとめて登録するなら{' '}
          <button
            type="button"
            onClick={() => router.push(`/notes/image-mask/bulk?deck=${deckId}`)}
            className="text-sora font-bold underline"
          >
            一括作成
          </button>
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-again-bg rounded-2xl text-again text-sm">{error}</div>
      )}
      {warnings.length > 0 && (
        <div className="p-3 bg-hard-bg rounded-2xl text-hard text-xs">
          {warnings.map((w, i) => (
            <div key={i}>{w}</div>
          ))}
        </div>
      )}
      {detectSource && (
        <p className="text-[11px] text-ink-3">
          検出エンジン: {detectSource === 'google-vision'
            ? '高精度OCR（Google Vision）— 枠は文字にほぼ正確に合います'
            : 'AI推定（位置はおおまか／要微調整）'}
        </p>
      )}

      {imageUrl && (
        <MaskRegionEditor imageUrl={imageUrl} regions={regions} onChange={setRegions} detecting={detecting} />
      )}

      {/* 設定 */}
      <div className="grid grid-cols-1 gap-3 pt-2 border-t border-gray-100">
        <div>
          <label className="block text-sm font-medium text-ink-2 mb-1">見出し（庭・一覧用の短いラベル）</label>
          <input
            type="text"
            value={heading}
            onChange={(e) => setHeading(e.target.value)}
            placeholder="例: 植物細胞の構造"
            className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:border-sora focus:ring-sora focus:ring-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink-2 mb-1">毎回隠す数（空欄=約3割を自動）</label>
          <input
            type="number"
            min={1}
            value={maskCount}
            onChange={(e) => setMaskCount(e.target.value)}
            placeholder="自動"
            className="w-32 px-3 py-2 border border-gray-300 rounded-xl outline-none focus:border-sora focus:ring-sora focus:ring-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink-2 mb-1">補足（裏面に表示・任意）</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:border-sora focus:ring-sora focus:ring-2 resize-none"
          />
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={() => router.push(`/decks/${deckId}`)}
          className="flex-1 px-4 py-2 bg-white border-2 border-sora text-sora rounded-2xl hover:bg-sora-soft font-bold transition-colors"
        >
          キャンセル
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex-1 px-4 py-2 bg-sora text-white rounded-2xl hover:bg-sora-dark disabled:opacity-50 font-bold transition-colors"
        >
          {saving ? '作成中...' : 'ノートを作成'}
        </button>
      </div>
    </div>
  )
}
