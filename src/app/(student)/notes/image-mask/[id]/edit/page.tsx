'use client'

import { useParams } from 'next/navigation'
import { AppLayout } from '@/components/layout/AppLayout'
import { ImageMaskNoteEditor } from '@/components/image-mask/ImageMaskNoteEditor'

export default function EditImageMaskNotePage() {
  const params = useParams()
  const noteId = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : ''

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-extrabold text-ai mb-6">画像マスキングを編集</h1>
        <div className="bg-white rounded-card border border-gray-200 p-4 sm:p-6">
          {noteId ? (
            <ImageMaskNoteEditor noteId={noteId} />
          ) : (
            <div className="text-sm text-ink-2">ノートIDが不正です。</div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
