'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { AppLayout } from '@/components/layout/AppLayout'
import { NoteTypeListClient } from './NoteTypeListClient'
import { db } from '@/lib/db/schema'

export default function NoteTypesPage() {
  const { userId, isLoading } = useAuth()
  const [noteTypes, setNoteTypes] = useState<Array<{
    id: string
    name: string
    owner_id: string | null
    fields: Array<{ name: string; ord: number }>
    is_system: boolean
    template_count: number
    created_at: string
  }> | null>(null)

  useEffect(() => {
    if (!userId) return

    const loadNoteTypes = async () => {
      try {
        // Load from Dexie first
        const localNoteTypes = await db.noteTypes
          .filter(nt => nt.is_system || nt.owner_id === userId)
          .toArray()

        const localTemplates = await db.cardTemplates.toArray()
        const templateCountMap = new Map<string, number>()
        for (const t of localTemplates) {
          templateCountMap.set(t.note_type_id, (templateCountMap.get(t.note_type_id) || 0) + 1)
        }

        const mapped = localNoteTypes
          .map(nt => ({
            id: nt.id,
            name: nt.name,
            owner_id: nt.owner_id,
            fields: (nt.fields || []) as Array<{ name: string; ord: number }>,
            is_system: nt.is_system,
            template_count: templateCountMap.get(nt.id) || 0,
            created_at: nt.created_at,
          }))
          .sort((a, b) => {
            if (a.is_system !== b.is_system) return a.is_system ? -1 : 1
            return a.name.localeCompare(b.name)
          })

        setNoteTypes(mapped)
      } catch {
        setNoteTypes([])
      }
    }

    loadNoteTypes()
  }, [userId])

  if (isLoading || noteTypes === null) {
    return (
      <AppLayout>
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex justify-between items-center mb-6">
            <div className="h-8 bg-gray-200 rounded w-48 animate-pulse" />
            <div className="h-10 bg-gray-200 rounded w-24 animate-pulse" />
          </div>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 h-20 animate-pulse" />
            ))}
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">ノートタイプ管理</h1>
            <p className="text-sm text-gray-500 mt-1">
              カード表示用のテンプレートを管理します
            </p>
          </div>
          <Link
            href="/note-types/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            新規作成
          </Link>
        </div>

        <NoteTypeListClient initialNoteTypes={noteTypes} />
      </div>
    </AppLayout>
  )
}
