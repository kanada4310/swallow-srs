'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { AppLayout } from '@/components/layout/AppLayout'
import { ImageMaskEditor } from '@/components/image-mask/ImageMaskEditor'
import { IMAGE_OCCLUSION_NOTE_TYPE_NAME } from '@/lib/constants'
import { db } from '@/lib/db/schema'
import type { NoteType } from '@/types/database'

export default function NewImageMaskNotePage() {
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
        <h1 className="text-2xl font-bold text-gray-900 mb-1">画像マスキングノートを作成</h1>
        <p className="text-sm text-gray-500 mb-6">
          画像をアップロードすると用語のマスキング候補が提示されます。選んで保存すると、復習ごとにランダムな箇所が隠れて出題されます。
        </p>

        {!deckId ? (
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm">
            デッキが指定されていません。
            <Link href="/decks" className="underline ml-1">
              デッキ一覧へ
            </Link>
          </div>
        ) : !resolved || isLoading ? (
          <div className="h-40 bg-gray-100 rounded-lg animate-pulse" />
        ) : !noteType ? (
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm">
            ノートタイプ「{IMAGE_OCCLUSION_NOTE_TYPE_NAME}」が見つかりません。管理者に作成を依頼してください。
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
            <ImageMaskEditor deckId={deckId} noteType={noteType} />
          </div>
        )}
      </div>
    </AppLayout>
  )
}
