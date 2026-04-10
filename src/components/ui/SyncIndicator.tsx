'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { subscribeSyncStatus, getSyncStatus, fullSync, type SyncStatus } from '@/lib/db/sync'

export function SyncIndicator() {
  const { userId } = useAuth()
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus)
  const [showDetails, setShowDetails] = useState(false)

  useEffect(() => {
    setStatus(getSyncStatus())
    const unsub = subscribeSyncStatus(setStatus)
    return unsub
  }, [])

  const handleManualSync = useCallback(async () => {
    if (!userId || status.isSyncing) return
    try {
      await fullSync(userId)
    } catch {
      // Error is captured in sync status
    }
  }, [userId, status.isSyncing])

  const formatLastSync = (date: Date | null): string => {
    if (!date) return '未同期'
    const now = new Date()
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000)
    if (diff < 60) return 'たった今'
    if (diff < 3600) return `${Math.floor(diff / 60)}分前`
    if (diff < 86400) return `${Math.floor(diff / 3600)}時間前`
    return `${Math.floor(diff / 86400)}日前`
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="flex items-center gap-1 p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
        title={`同期: ${formatLastSync(status.lastSyncAt)}`}
      >
        {status.isSyncing ? (
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        ) : !status.isOnline ? (
          <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728M5.636 18.364a9 9 0 010-12.728" />
            <line x1="4" y1="4" x2="20" y2="20" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
          </svg>
        ) : status.error ? (
          <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        ) : (
          <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        )}
        {status.pendingCount > 0 && (
          <span className="text-xs font-medium text-amber-600">{status.pendingCount}</span>
        )}
      </button>

      {showDetails && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowDetails(false)} />
          <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 z-50 py-2">
            <div className="px-3 py-2 border-b border-gray-100">
              <div className="text-xs text-gray-500">最終同期</div>
              <div className="text-sm font-medium text-gray-900">
                {formatLastSync(status.lastSyncAt)}
              </div>
            </div>

            {status.pendingCount > 0 && (
              <div className="px-3 py-2 border-b border-gray-100">
                <div className="text-xs text-gray-500">未送信</div>
                <div className="text-sm font-medium text-amber-600">
                  {status.pendingCount}件
                </div>
              </div>
            )}

            {!status.isOnline && (
              <div className="px-3 py-2 border-b border-gray-100">
                <div className="text-sm text-amber-600">オフライン</div>
              </div>
            )}

            {status.error && (
              <div className="px-3 py-2 border-b border-gray-100">
                <div className="text-xs text-red-500 break-all">{status.error}</div>
              </div>
            )}

            <div className="px-3 py-1.5">
              <button
                onClick={handleManualSync}
                disabled={status.isSyncing || !status.isOnline}
                className="w-full text-sm text-left text-blue-600 hover:text-blue-700 disabled:text-gray-400 disabled:cursor-not-allowed py-1"
              >
                {status.isSyncing ? '同期中...' : '今すぐ同期'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
