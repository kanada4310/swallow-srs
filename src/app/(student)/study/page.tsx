'use client'

import { Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { AppLayout } from '@/components/layout/AppLayout'
import { StudyPageClient } from './StudyPageClient'

function StudyPageInner() {
  const { userId, isLoading } = useAuth()
  const searchParams = useSearchParams()
  const router = useRouter()
  // Fallback to window.location when rendered outside Next.js routing (offline mode).
  // Accept both `deck` (SRS internal convention) and `deckId` (billing LINE deep-link convention).
  const getParam = (key: string) =>
    searchParams.get(key) ??
    (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get(key) : null)
  const deckId = getParam('deck') ?? getParam('deckId')

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4">
        <StudyPageClient />
      </div>
    )
  }

  // If no deck specified, redirect to decks page
  if (!deckId) {
    router.replace('/decks')
    return null
  }

  return (
    <div className="max-w-4xl mx-auto px-4">
      <StudyPageClient
        deckId={deckId}
        userId={userId || undefined}
      />
    </div>
  )
}

export default function StudyPage() {
  return (
    <AppLayout>
      <Suspense>
        <StudyPageInner />
      </Suspense>
    </AppLayout>
  )
}
