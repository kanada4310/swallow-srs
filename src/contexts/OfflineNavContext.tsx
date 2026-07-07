'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode, type ComponentType } from 'react'

// Eagerly import page components so they're available offline
// (included in the main bundle, no network fetch needed)
import DashboardPage from '@/app/page'
import DecksPage from '@/app/(student)/decks/page'
import DeckDetailPage from '@/app/(student)/decks/[id]/page'
import NewDeckPage from '@/app/(student)/decks/new/page'
import StudyPage from '@/app/(student)/study/page'
import StatsPage from '@/app/(student)/stats/page'
import NotesPage from '@/app/(student)/notes/page'
import MorePage from '@/app/(student)/more/page'
import SettingsPage from '@/app/(student)/settings/page'
import NotificationsSettingsPage from '@/app/(student)/settings/notifications/page'
import NoteTypesPage from '@/app/(teacher)/note-types/page'
import EditNoteTypePage from '@/app/(teacher)/note-types/[id]/page'
import NewNoteTypePage from '@/app/(teacher)/note-types/new/page'
import StudentsPage from '@/app/(teacher)/students/page'
import ClassDetailPage from '@/app/(teacher)/students/class/[id]/page'

// Static route map (exact match)
const pageMap: Record<string, ComponentType> = {
  '/': DashboardPage,
  '/decks': DecksPage,
  '/decks/new': NewDeckPage,
  '/study': StudyPage,
  '/stats': StatsPage,
  '/notes': NotesPage,
  '/more': MorePage,
  '/settings': SettingsPage,
  '/settings/notifications': NotificationsSettingsPage,
  '/note-types': NoteTypesPage,
  '/note-types/new': NewNoteTypePage,
  '/students': StudentsPage,
}

// Dynamic route patterns (checked after exact match fails)
const dynamicRoutes: Array<{ pattern: RegExp; component: ComponentType }> = [
  { pattern: /^\/decks\/[^/]+$/, component: DeckDetailPage },
  { pattern: /^\/note-types\/[^/]+$/, component: EditNoteTypePage },
  { pattern: /^\/students\/class\/[^/]+$/, component: ClassDetailPage },
]

function matchRoute(pathname: string): ComponentType | null {
  // Exact match first (includes /decks/new, /note-types/new)
  if (pageMap[pathname]) return pageMap[pathname]

  // Dynamic patterns
  for (const route of dynamicRoutes) {
    if (route.pattern.test(pathname)) return route.component
  }

  return null
}

interface OfflineNavContextValue {
  offlinePath: string | null
  clearOfflineNav: () => void
}

const OfflineNavContext = createContext<OfflineNavContextValue>({
  offlinePath: null,
  clearOfflineNav: () => {},
})

export function useOfflineNav() {
  return useContext(OfflineNavContext)
}

export function OfflineNavProvider({ children }: { children: ReactNode }) {
  const [offlinePath, setOfflinePath] = useState<string | null>(null)

  const clearOfflineNav = useCallback(() => {
    setOfflinePath(null)
  }, [])

  // Intercept link clicks when offline
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (navigator.onLine) return

      const anchor = (e.target as HTMLElement).closest('a')
      if (!anchor) return

      const href = anchor.getAttribute('href')
      if (!href || !href.startsWith('/')) return
      if (href.startsWith('#')) return

      // Extract pathname (remove query string)
      const pathname = href.split('?')[0]

      // Same page - ignore
      if (pathname === window.location.pathname) return

      // Check if we have a component for this route
      if (!matchRoute(pathname)) {
        // For unmapped routes, prevent MPA fallback and show toast
        e.preventDefault()
        e.stopPropagation()
        return
      }

      // Prevent Next.js navigation (which would trigger MPA fallback)
      e.preventDefault()
      e.stopPropagation()

      // Update URL bar
      window.history.pushState({}, '', href)

      // Trigger offline page render
      setOfflinePath(pathname)
    }

    document.addEventListener('click', handler, true) // capture phase
    return () => document.removeEventListener('click', handler, true)
  }, [])

  // Handle browser back/forward while in offline mode
  useEffect(() => {
    if (!offlinePath) return

    const handler = () => {
      const pathname = window.location.pathname
      if (matchRoute(pathname)) {
        setOfflinePath(pathname)
      } else {
        setOfflinePath(null)
      }
    }

    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [offlinePath])

  // Clear offline nav when back online
  useEffect(() => {
    const handler = () => {
      if (navigator.onLine && offlinePath) {
        setOfflinePath(null)
      }
    }

    window.addEventListener('online', handler)
    return () => window.removeEventListener('online', handler)
  }, [offlinePath])

  // Prevent page reload when offline
  useEffect(() => {
    // F5, Ctrl+R, Cmd+R
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!navigator.onLine) {
        if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.key === 'r')) {
          e.preventDefault()
        }
      }
    }

    // Navigation API (Chrome/Edge 102+): intercepts browser refresh button
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav = (window as any).navigation
    const handleNavigate = nav ? (event: { navigationType: string; canIntercept: boolean; preventDefault: () => void }) => {
      if (!navigator.onLine && event.navigationType === 'reload' && event.canIntercept) {
        event.preventDefault()
      }
    } : null

    // Fallback for browsers without Navigation API (Firefox, Safari)
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!navigator.onLine) {
        e.preventDefault()
        e.returnValue = ''
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    if (nav && handleNavigate) {
      nav.addEventListener('navigate', handleNavigate)
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (nav && handleNavigate) {
        nav.removeEventListener('navigate', handleNavigate)
      }
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [])

  return (
    <OfflineNavContext.Provider value={{ offlinePath, clearOfflineNav }}>
      {offlinePath ? <OfflinePageRenderer path={offlinePath} /> : children}
    </OfflineNavContext.Provider>
  )
}

function OfflinePageRenderer({ path }: { path: string }) {
  const PageComponent = matchRoute(path)

  if (!PageComponent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-6">
          <p className="text-gray-600">このページはオフラインでは表示できません</p>
        </div>
      </div>
    )
  }

  return <PageComponent />
}
