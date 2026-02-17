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
  // Fallback to window.location when rendered outside Next.js routing (offline mode)
  const deckId = searchParams.get('deck') || (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('deck') : null)

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
