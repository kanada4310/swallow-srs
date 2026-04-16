'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { db } from '@/lib/db/schema'
import { fullSync } from '@/lib/db/sync'
import type { Profile } from '@/types/database'

interface AuthContextValue {
  userId: string | null
  profile: Profile | null
  isLoading: boolean
  isAuthenticated: boolean
  logout: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

// Public paths that don't require auth
const publicPaths = ['/login', '/setup']

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const isPublicPath = publicPaths.some(p => pathname.startsWith(p))

  // Load profile from Dexie (instant) then refresh from Supabase
  const loadProfile = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        // Offline時はgetUser()が失敗してuser=nullになる場合がある
        // IndexedDBにキャッシュがあればそれを使う
        if (!navigator.onLine) {
          console.log('[AuthContext] getUser returned null while offline, trying IndexedDB')
          try {
            const localProfile = await db.profiles.toCollection().first()
            if (localProfile) {
              setUserId(localProfile.id)
              setProfile(localProfile)
              setIsLoading(false)
              return
            }
          } catch {
            // IndexedDB not available
          }
        }
        setUserId(null)
        setProfile(null)
        setIsLoading(false)
        if (!isPublicPath) {
          router.replace('/login')
        }
        return
      }

      setUserId(user.id)

      // Try loading from IndexedDB first (instant)
      try {
        const localProfile = await db.profiles.get(user.id)
        if (localProfile) {
          setProfile(localProfile)
          setIsLoading(false)
        }
      } catch {
        // IndexedDB might not be available
      }

      // Fetch latest from Supabase
      const { data: serverProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (serverProfile) {
        const profileData = serverProfile as Profile
        setProfile(profileData)
        // Update IndexedDB cache
        try {
          await db.profiles.put(profileData)
        } catch {
          // Ignore IndexedDB write errors
        }
      } else if (!profile) {
        // No profile anywhere - redirect to setup
        if (!pathname.startsWith('/setup')) {
          router.replace('/setup')
        }
      }

      setIsLoading(false)

      // Trigger background sync
      if (serverProfile) {
        fullSync(user.id).catch(console.error)
      }
    } catch (error) {
      console.error('Auth load error:', error)
      // If network error, try IndexedDB only
      try {
        const localProfile = await db.profiles.toCollection().first()
        if (localProfile) {
          setUserId(localProfile.id)
          setProfile(localProfile)
        }
      } catch {
        // Nothing we can do
      }
      setIsLoading(false)
    }
  }, [router, isPublicPath, pathname, profile])

  // Listen for auth state changes
  useEffect(() => {
    loadProfile()

    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event) => {
        console.log('[AuthContext] onAuthStateChange:', event, 'online:', navigator.onLine)
        if (event === 'SIGNED_OUT') {
          // Offline時のトークンリフレッシュ失敗をSIGNED_OUTとして扱わない
          if (!navigator.onLine) {
            console.log('[AuthContext] Ignoring SIGNED_OUT while offline')
            return
          }
          setUserId(null)
          setProfile(null)
          router.replace('/login')
        } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          loadProfile()
        }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Periodic background sync (every 5 minutes)
  useEffect(() => {
    if (!userId) return

    const interval = setInterval(() => {
      fullSync(userId).catch(console.error)
    }, 5 * 60 * 1000)

    return () => clearInterval(interval)
  }, [userId])

  // Sync on visibility change (tab focus)
  useEffect(() => {
    if (!userId) return

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fullSync(userId).catch(console.error)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [userId])

  const logout = useCallback(async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    try {
      const { clearAllData } = await import('@/lib/db/schema')
      await clearAllData()
    } catch {
      // Ignore cleanup errors
    }
    setUserId(null)
    setProfile(null)
    router.replace('/login')
  }, [router])

  const refreshProfile = useCallback(async () => {
    await loadProfile()
  }, [loadProfile])

  return (
    <AuthContext.Provider
      value={{
        userId,
        profile,
        isLoading,
        isAuthenticated: !!userId && !!profile,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
