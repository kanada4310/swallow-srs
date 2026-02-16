'use client'

import Link from 'next/link'
import { Settings } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { SyncIndicator } from './SyncIndicator'

export function Header() {
  const { profile, logout } = useAuth()

  const handleLogout = async () => {
    await logout()
  }

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-14">
          {/* Logo / App Name */}
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl font-bold text-blue-600">つばめSRS</span>
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
            <Link
              href="/settings"
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              title="設定"
            >
              <Settings className="w-5 h-5" />
            </Link>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-md hover:bg-gray-100 transition-colors"
            >
              ログアウト
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
