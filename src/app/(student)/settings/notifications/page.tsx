'use client'

import { useAuth } from '@/contexts/AuthContext'
import { AppLayout } from '@/components/layout/AppLayout'
import { NotificationSettings } from '@/components/notifications/NotificationSettings'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function NotificationsSettingsPage() {
  const { isLoading } = useAuth()

  if (isLoading) {
    return (
      <AppLayout>
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="h-8 bg-gray-200 rounded-xl w-24 mb-6 animate-pulse" />
          <div className="h-40 bg-gray-200 rounded-card animate-pulse" />
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm font-bold text-ink-3 hover:text-ink-2 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            戻る
          </Link>
          <h1 className="text-2xl font-extrabold text-ai">通知設定</h1>
        </div>

        <div className="space-y-6">
          <NotificationSettings />
        </div>
      </div>
    </AppLayout>
  )
}
