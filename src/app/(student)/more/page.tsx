'use client'

import Link from 'next/link'
import { FileText, LayoutTemplate, Bell, Settings, LogOut, ChevronRight } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { AppLayout } from '@/components/layout/AppLayout'

interface MoreItem {
  href: string
  title: string
  description: string
  icon: React.ReactNode
}

const moreItems: MoreItem[] = [
  {
    href: '/notes',
    title: 'ノート',
    description: 'カードの中身をまとめて検索・編集する',
    icon: <FileText className="w-5 h-5" />,
  },
  {
    href: '/note-types',
    title: 'テンプレート',
    description: 'カードの形式（ノートタイプ）を管理する',
    icon: <LayoutTemplate className="w-5 h-5" />,
  },
  {
    href: '/settings/notifications',
    title: '通知設定',
    description: '学習リマインダーのオン・オフ',
    icon: <Bell className="w-5 h-5" />,
  },
  {
    href: '/settings',
    title: '設定',
    description: 'その他の設定',
    icon: <Settings className="w-5 h-5" />,
  },
]

export default function MorePage() {
  const { profile, isLoading, logout } = useAuth()

  if (isLoading) {
    return (
      <AppLayout>
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="h-8 bg-gray-200 rounded-xl w-24 mb-6 animate-pulse" />
          <div className="h-64 bg-gray-200 rounded-card animate-pulse" />
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-extrabold text-ai mb-6">もっと</h1>

        {/* ツールと設定 */}
        <div className="bg-white rounded-card shadow-card border border-gray-200 divide-y divide-gray-100 mb-6">
          {moreItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors first:rounded-t-card last:rounded-b-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
            >
              <span className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-2xl bg-sora-soft text-sora">
                {item.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold text-ai">{item.title}</span>
                <span className="block text-sm text-ink-3 mt-0.5">{item.description}</span>
              </span>
              <ChevronRight className="w-5 h-5 text-ink-3 flex-shrink-0" />
            </Link>
          ))}
        </div>

        {/* ログアウト */}
        <div className="bg-white rounded-card shadow-card border border-gray-200">
          <button
            onClick={() => logout()}
            className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 transition-colors rounded-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
          >
            <span className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-2xl bg-again-bg text-again">
              <LogOut className="w-5 h-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold text-again">ログアウト</span>
              {profile && (
                <span className="block text-sm text-ink-3 mt-0.5">{profile.name} としてログイン中</span>
              )}
            </span>
          </button>
        </div>
      </div>
    </AppLayout>
  )
}
