'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface HeaderProps {
  userName?: string
  userRole?: 'student' | 'teacher' | 'admin'
}

export function Header({ userName, userRole }: HeaderProps) {
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
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
          <div className="flex items-center gap-4">
            {userName && (
              <div className="hidden sm:flex items-center gap-2 text-sm text-gray-600">
                <span>{userName}</span>
                {userRole && (
                  <span className="px-2 py-0.5 bg-gray-100 rounded text-xs">
                    {userRole === 'teacher' ? '講師' : userRole === 'admin' ? '管理者' : '生徒'}
                  </span>
                )}
              </div>
            )}
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
