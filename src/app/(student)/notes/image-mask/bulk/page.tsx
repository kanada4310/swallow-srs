'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { AppLayout } from '@/components/layout/AppLayout'
import { BulkImageMaskCreator } from '@/components/image-mask/BulkImageMaskCreator'
import { IMAGE_OCCLUSION_NOTE_TYPE_NAME } from '@/lib/constants'
import { db } from '@/lib/db/schema'
import type { NoteType } from '@/types/database'

export default function BulkImageMaskPage() {
  const { isLoading } = useAuth()
  const searchParams = useSearchParams()
  const deckId = searchParams.get('deck') || ''

  const [noteType, setNoteType] = useState<NoteType | null>(null)
  const [resolved, setResolved] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const all = await db.noteTypes.toArray()
        const found = all.find((nt) => nt.name === IMAGE_OCCLUSION_NOTE_TYPE_NAME)
        setNoteType((found as NoteType) || null)
      } catch {
        setNoteType(null)
      } finally {
        setResolved(true)
      }
    }
    load()
  }, [])

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-extrabold text-ai mb-1">画像マスキングを一括作成</h1>
        <p className="text-sm text-ink-2 mb-6">
          複数の画像をまとめてアップロードすると、各画像にAIがマスキング候補を付けます。確認・微調整して一度に作成できます。
        </p>

        {!deckId ? (
          <div className="p-4 bg-hard-bg rounded-xl text-hard text-sm">
            デッキが指定されていません。
            <Link href="/decks" className="underline font-bold ml-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai">
              デッキ一覧へ
            </Link>
          </div>
        ) : !resolved || isLoading ? (
          <div className="h-40 bg-gray-100 rounded-2xl animate-pulse" />
        ) : !noteType ? (
          <div className="p-4 bg-hard-bg rounded-xl text-hard text-sm">
            ノートタイプ「{IMAGE_OCCLUSION_NOTE_TYPE_NAME}」が見つかりません。
          </div>
        ) : (
          <div className="bg-white rounded-card border border-gray-200 p-4 sm:p-6">
            <BulkImageMaskCreator deckId={deckId} noteType={noteType} />
          </div>
        )}
      </div>
    </AppLayout>
  )
}
