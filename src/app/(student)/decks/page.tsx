'use client'

import { useAuth } from '@/contexts/AuthContext'
import { AppLayout } from '@/components/layout/AppLayout'
import { DecksPageClient } from './DecksPageClient'

export default function DecksPage() {
  const { profile, isLoading } = useAuth()

  if (isLoading) {
    return (
      <AppLayout>
        <DecksPageClient />
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <DecksPageClient
        userProfile={profile ? { id: profile.id, name: profile.name, role: profile.role } : undefined}
      />
    </AppLayout>
  )
}
