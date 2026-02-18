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
          <div className="h-8 bg-gray-200 rounded w-24 mb-6 animate-pulse" />
          <div className="h-40 bg-gray-200 rounded animate-pulse" />
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
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            戻る
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">設定</h1>
        </div>

        <div className="space-y-6">
          {/* 整備中メッセージ */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <p className="text-gray-500 text-sm">このページは整備中です。</p>

            <div className="mt-4 space-y-3">
              <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <Volume2 className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-700">
                  <p className="font-medium">TTS（音声）設定</p>
                  <p className="mt-0.5">デッキ詳細設定の「音声」タブに移動しました。デッキごとにボイスと速度を設定できます。</p>
                </div>
              </div>

              <Link
                href="/settings/notifications"
                className="flex items-start gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <Bell className="w-5 h-5 text-gray-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-gray-700">
                  <p className="font-medium">通知設定</p>
                  <p className="mt-0.5 text-gray-500">学習リマインダーの設定はこちら</p>
                </div>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
