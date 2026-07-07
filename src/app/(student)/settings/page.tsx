'use client'

import { useAuth } from '@/contexts/AuthContext'
import { AppLayout } from '@/components/layout/AppLayout'
import Link from 'next/link'
import { ArrowLeft, Volume2, Bell } from 'lucide-react'

export default function SettingsPage() {
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
          <h1 className="text-2xl font-extrabold text-ai">設定</h1>
        </div>

        <div className="space-y-6">
          {/* 整備中メッセージ */}
          <div className="bg-white rounded-card border border-gray-200 p-6">
            <p className="text-ink-3 text-sm">このページは整備中です。</p>

            <div className="mt-4 space-y-3">
              <div className="flex items-start gap-3 p-3 bg-sora-soft rounded-2xl">
                <Volume2 className="w-5 h-5 text-sora flex-shrink-0 mt-0.5" />
                <div className="text-sm text-ink-2">
                  <p className="font-bold text-ai">TTS（音声）設定</p>
                  <p className="mt-0.5">デッキ詳細設定の「音声」タブに移動しました。デッキごとにボイスと速度を設定できます。</p>
                </div>
              </div>

              <Link
                href="/settings/notifications"
                className="flex items-start gap-3 p-3 bg-gray-50 border border-gray-200 rounded-2xl hover:bg-gray-100 transition-colors"
              >
                <Bell className="w-5 h-5 text-ink-2 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-ink-2">
                  <p className="font-bold text-ai">通知設定</p>
                  <p className="mt-0.5 text-ink-3">学習リマインダーの設定はこちら</p>
                </div>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
