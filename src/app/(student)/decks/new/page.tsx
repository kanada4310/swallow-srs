'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { AppLayout } from '@/components/layout/AppLayout'
import { DeckForm } from '@/components/deck/DeckForm'
import { db } from '@/lib/db/schema'

export default function NewDeckPage() {
  const { profile, isLoading } = useAuth()
  const searchParams = useSearchParams()
  const parentId = searchParams.get('parent') || ''

  const [parentDecks, setParentDecks] = useState<Array<{ id: string; name: string }>>([])

  useEffect(() => {
    if (!profile) return

    const loadDecks = async () => {
      try {
        const decks = await db.decks
          .where('owner_id')
          .equals(profile.id)
          .toArray()
        setParentDecks(
          decks
            .map(d => ({ id: d.id, name: d.name }))
            .sort((a, b) => a.name.localeCompare(b.name))
        )
      } catch {
        setParentDecks([])
      }
    }

    loadDecks()
  }, [profile])

  if (isLoading) {
    return (
      <AppLayout>
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="h-8 bg-gray-200 rounded-xl w-48 mb-6 animate-pulse" />
          <div className="bg-white rounded-card border border-gray-200 p-6">
            <div className="space-y-4">
              <div className="h-10 bg-gray-200 rounded-xl animate-pulse" />
              <div className="h-10 bg-gray-200 rounded-xl animate-pulse" />
            </div>
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-extrabold text-ai mb-6">新しいデッキを作成</h1>
        <div className="bg-white rounded-card border border-gray-200 p-6">
          <DeckForm
            mode="create"
            parentDecks={parentDecks}
            defaultParentId={parentId}
          />
        </div>
      </div>
    </AppLayout>
  )
}
