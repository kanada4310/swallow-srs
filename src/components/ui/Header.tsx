'use client'

import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { SyncIndicator } from './SyncIndicator'
import { SwallowMark } from './SwallowMark'

// 通知設定・設定・ログアウトへの導線は「もっと」（/more）に集約（ADR 20260707-student-first-navigation）
export function Header() {
  const { profile } = useAuth()

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-14">
          {/* Logo / App Name */}
          <Link href="/" className="flex items-center gap-2">
            <SwallowMark className="w-7 h-auto" fill="#1C2B4B" />
            <span className="text-lg font-extrabold text-ai tracking-wide">つばめSRS</span>
          </Link>

          {/* User Info & Actions */}
          <div className="flex items-center gap-2 sm:gap-4">
            {profile && (
              <div className="hidden sm:flex items-center gap-2 text-sm text-gray-600">
                <span>{profile.name}</span>
                <span className="px-2 py-0.5 bg-gray-100 rounded text-xs">
                  {profile.role === 'teacher' ? '講師' : profile.role === 'admin' ? '管理者' : '生徒'}
                </span>
              </div>
            )}
            <SyncIndicator />
          </div>
        </div>
      </div>
    </header>
  )
}
