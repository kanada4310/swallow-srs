'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { AppLayout } from '@/components/layout/AppLayout'
import { NoteTypeEditorClient } from '@/components/note-type/NoteTypeEditorClient'
import { db } from '@/lib/db/schema'
import type { NoteTypeWithTemplates } from '@/types/database'

export default function EditNoteTypePage() {
  const params = useParams<{ id: string }>()
  // Fallback to window.location when rendered outside Next.js routing (offline mode)
  const id = params.id || (typeof window !== 'undefined' ? window.location.pathname.split('/note-types/')[1]?.split('/')[0] : '') || ''
  const { isLoading } = useAuth()
  const [noteType, setNoteType] = useState<NoteTypeWithTemplates | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [isLoadingData, setIsLoadingData] = useState(true)

  useEffect(() => {
    if (!id) return

    const loadNoteType = async () => {
      setIsLoadingData(true)
      try {
        const nt = await db.noteTypes.get(id)
        if (!nt) {
          setNotFound(true)
          setIsLoadingData(false)
          return
        }

        const templates = await db.cardTemplates
          .where('note_type_id')
          .equals(id)
          .toArray()

        templates.sort((a, b) => a.ordinal - b.ordinal)

        setNoteType({
          ...nt,
          card_templates: templates,
        })
      } catch {
        setNotFound(true)
      } finally {
        setIsLoadingData(false)
      }
    }

    loadNoteType()
  }, [id])

  if (isLoading || isLoadingData) {
    return (
      <AppLayout>
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="h-8 bg-gray-200 rounded w-48 mb-6 animate-pulse" />
          <div className="h-64 bg-gray-200 rounded animate-pulse" />
        </div>
      </AppLayout>
    )
  }

  if (notFound || !noteType) {
    return (
      <AppLayout>
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="bg-again-bg border border-again/20 rounded-card p-4 text-again">
            ノートタイプが見つかりませんでした。
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-4 py-6">
        <NoteTypeEditorClient mode="edit" noteType={noteType} />
      </div>
    </AppLayout>
  )
}
