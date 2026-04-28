'use client'

import { AppLayout } from '@/components/layout/AppLayout'
import { DecksPageClient } from './DecksPageClient'

export default function DecksPage() {
  // DecksPageClient reads userId/profile from useAuth() and decks from Dexie via liveQuery.
  return (
    <AppLayout>
      <DecksPageClient />
    </AppLayout>
  )
}
