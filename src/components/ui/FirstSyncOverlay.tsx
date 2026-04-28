'use client'

import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useAuth } from '@/contexts/AuthContext'
import { db } from '@/lib/db/schema'
import { subscribeSyncStatus, getSyncStatus, type SyncStatus } from '@/lib/db/sync'

const SLOW_SYNC_MS = 8000

/**
 * Full-screen overlay shown when:
 *   - the user is authenticated, AND
 *   - their IndexedDB is empty (no decks cached yet), AND
 *   - online and a sync is in progress (or about to be — we wait briefly).
 *
 * Targets the LIFF in-app browser case: opening a LINE deep link gives a fresh
 * IndexedDB, but background sync takes a couple of seconds. Without this overlay
 * the user lands on "デッキがありません" empty state and may bounce off before
 * the data arrives.
 *
 * Auto-dismisses as soon as any deck appears in IndexedDB (liveQuery driven).
 * Falls back to a "still syncing — keep waiting or reload" message after
 * SLOW_SYNC_MS so a stuck sync doesn't trap the user forever.
 */
export function FirstSyncOverlay() {
  const { userId, isLoading: authLoading } = useAuth()
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus)
  const [slowMode, setSlowMode] = useState(false)

  // Reactively know whether IndexedDB has any decks for this user.
  // Returns: undefined (still checking), 0 (empty), >0 (has data).
  const deckCount = useLiveQuery(async () => {
    if (!userId) return undefined
    return await db.decks.count()
  }, [userId])

  useEffect(() => {
    setStatus(getSyncStatus())
    const unsub = subscribeSyncStatus(setStatus)
    return unsub
  }, [])

  // Show "still syncing" hint if we've been waiting too long
  useEffect(() => {
    if (deckCount === 0 && status.isOnline) {
      const timer = setTimeout(() => setSlowMode(true), SLOW_SYNC_MS)
      return () => clearTimeout(timer)
    }
    setSlowMode(false)
  }, [deckCount, status.isOnline])

  // Don't render until we know what's going on
  if (authLoading || !userId) return null
  if (deckCount === undefined) return null

  // Have data — no overlay needed
  if (deckCount > 0) return null

  // Empty IndexedDB but offline → can't fetch anyway, let the page show its empty state
  if (!status.isOnline) return null

  // Already finished syncing once — the user genuinely has no decks. Show empty state, not overlay.
  if (status.lastSyncAt && !status.isSyncing) return null

  // Empty IndexedDB, online, no successful sync yet: show overlay until first sync completes
  return (
    <div
      className="fixed inset-0 z-[100] bg-white/95 backdrop-blur-sm flex flex-col items-center justify-center px-6"
      role="status"
      aria-live="polite"
    >
      <svg className="w-10 h-10 animate-spin text-blue-600 mb-4" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      <p className="text-gray-700 font-medium">データを取得しています…</p>
      <p className="text-gray-500 text-sm mt-1 text-center">
        初回起動のため、デッキデータをダウンロードしています。
      </p>

      {slowMode && (
        <div className="mt-6 max-w-sm text-center">
          <p className="text-sm text-amber-700 mb-2">少し時間がかかっています。</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            ページを再読み込み
          </button>
        </div>
      )}
    </div>
  )
}
