'use client'

import { useAuth } from '@/contexts/AuthContext'
import { AppLayout } from '@/components/layout/AppLayout'
import { NoteTypeEditorClient } from '@/components/note-type/NoteTypeEditorClient'

export default function NewNoteTypePage() {
  const { isLoading } = useAuth()

  if (isLoading) {
    return (
      <AppLayout>
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="h-8 bg-gray-200 rounded w-48 mb-6 animate-pulse" />
          <div className="h-64 bg-gray-200 rounded animate-pulse" />
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-4 py-6">
        <NoteTypeEditorClient mode="create" />
      </div>
    </AppLayout>
  )
}
