'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Users } from 'lucide-react'
import { GARDEN_ENABLED } from '@/lib/garden/feature'

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
}

interface BottomNavProps {
  role: 'student' | 'teacher' | 'admin'
}

// SVG Icons as components
const HomeIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
)

const DecksIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
  </svg>
)

const StatsIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
)

const StudentsIcon = () => <Users className="w-6 h-6" strokeWidth={2} />

const GardenIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 21v-9m0 0C12 8 9.5 6 6.5 6 6.5 9.5 9 12 12 12zm0 0c0-4 2.5-6 5.5-6C17.5 9.5 15 12 12 12z" />
  </svg>
)

const MoreIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" />
  </svg>
)

const gardenNavItem: NavItem = { href: '/garden', label: '庭', icon: <GardenIcon /> }

// 生徒の下メニューは「毎日使うもの」だけに絞る。
// 作る側の道具（ノート/テンプレート）や設定は /more に格納（ADR 20260707-student-first-navigation）
const studentNavItems: NavItem[] = [
  { href: '/', label: 'ホーム', icon: <HomeIcon /> },
  { href: '/decks', label: 'デッキ', icon: <DecksIcon /> },
  ...(GARDEN_ENABLED ? [gardenNavItem] : []),
  { href: '/stats', label: '統計', icon: <StatsIcon /> },
  { href: '/more', label: 'もっと', icon: <MoreIcon /> },
]

const teacherNavItems: NavItem[] = [
  { href: '/', label: 'ホーム', icon: <HomeIcon /> },
  { href: '/decks', label: 'デッキ', icon: <DecksIcon /> },
  ...(GARDEN_ENABLED ? [gardenNavItem] : []),
  { href: '/students', label: '生徒', icon: <StudentsIcon /> },
  { href: '/stats', label: '統計', icon: <StatsIcon /> },
  { href: '/more', label: 'もっと', icon: <MoreIcon /> },
]

export function BottomNav({ role }: BottomNavProps) {
  const pathname = usePathname()
  const navItems = role === 'teacher' || role === 'admin' ? teacherNavItems : studentNavItems

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
      <div className="max-w-lg mx-auto px-4">
        <div className="flex justify-around">
          {navItems.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== '/' && pathname.startsWith(item.href))

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center py-2 px-1.5 min-w-0 transition-colors ${
                  isActive
                    ? 'text-sora font-bold'
                    : 'text-ink-3 hover:text-ink-2'
                }`}
              >
                {item.icon}
                <span className="text-[11px] mt-0.5 whitespace-nowrap font-semibold">{item.label}</span>
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
