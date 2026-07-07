'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { db } from '@/lib/db/schema'
import {
  MaskRegionEditor,
  maskJsonToRegions,
  regionsToMaskPayload,
  type EditRegion,
} from './MaskRegionEditor'

interface ImageMaskNoteEditorProps {
  noteId: string
}

// 既存の画像マスキングノートをビジュアル編集（画像は保持、マスク領域・設定を編集）
export function ImageMaskNoteEditor({ noteId }: ImageMaskNoteEditorProps) {
  const router = useRouter()
  const { profile } = useAuth()

  const [loaded, setLoaded] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [deckId, setDeckId] = useState<string>('')
  const [imageUrl, setImageUrl] = useState<string>('')
  const [regions, setRegions] = useState<EditRegion[]>([])
  const [maskCount, setMaskCount] = useState('')
  const [heading, setHeading] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const n = await db.notes.get(noteId)
        const fv = (n?.field_values || {}) as Record<string, string>
        if (!n || !fv['画像'] || fv['マスク領域'] === undefined) {
          setNotFound(true)
          return
        }
        setDeckId(n.deck_id)
        setImageUrl(fv['画像'])
        setRegions(maskJsonToRegions(fv['マスク領域'] || '[]'))
        setMaskCount(fv['毎回隠す数'] || '')
        setHeading(fv['見出し'] || '')
        setNote(fv['補足'] || '')
      } catch {
        setNotFound(true)
      } finally {
        setLoaded(true)
      }
    }
    load()
  }, [noteId])

  const handleSave = async () => {
    setError(null)
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
      const resp = await fetch(`/api/notes/${noteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field_values: fieldValues }),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(data.error || '保存に失敗しました')

      const { updateNoteLocally } = await import('@/lib/db/schema')
      await updateNoteLocally(noteId, fieldValues).catch(() => {})
      if (profile) {
        const { fullSync } = await import('@/lib/db/sync')
        await fullSync(profile.id).catch(() => {})
      }
      router.push(`/decks/${deckId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました')
      setSaving(false)
    }
  }

  if (!loaded) return <div className="h-40 bg-gray-100 rounded-card animate-pulse" />
  if (notFound) {
    return (
      <div className="p-4 bg-hard-bg rounded-2xl text-hard text-sm">
        画像マスキングノートが見つかりませんでした。
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-again-bg rounded-2xl text-again text-sm">{error}</div>
      )}

      <MaskRegionEditor imageUrl={imageUrl} regions={regions} onChange={setRegions} />

      <div className="grid grid-cols-1 gap-3 pt-2 border-t border-gray-100">
        <div>
          <label className="block text-sm font-medium text-ink-2 mb-1">見出し</label>
          <input
            type="text"
            value={heading}
            onChange={(e) => setHeading(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none focus:border-sora focus:ring-sora focus:ring-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink-2 mb-1">毎回隠す数（空欄=約3割）</label>
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
          onClick={() => router.push(deckId ? `/decks/${deckId}` : '/decks')}
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
          {saving ? '保存中...' : '保存'}
        </button>
      </div>
    </div>
  )
}
