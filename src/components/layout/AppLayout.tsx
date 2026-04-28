'use client'

import { Header } from '@/components/ui/Header'
import { BottomNav } from '@/components/ui/BottomNav'
import { InstallPrompt } from '@/components/ui/InstallPrompt'
import { SyncErrorBanner } from '@/components/ui/SyncErrorBanner'
import { FirstSyncOverlay } from '@/components/ui/FirstSyncOverlay'
import { useAuth } from '@/contexts/AuthContext'

interface AppLayoutProps {
  children: React.ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const { profile } = useAuth()
  const userRole = profile?.role || 'student'

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />
      <SyncErrorBanner />
      <main className="flex-1 pb-16">
        {children}
      </main>
      <BottomNav role={userRole} />
      <InstallPrompt />
      <FirstSyncOverlay />
    </div>
  )
}
