'use client'

import { useOnlineStatus, useSyncStatus } from '@/lib/db/hooks'

interface SyncStatusBadgeProps {
  className?: string
}

export function SyncStatusBadge({ className = '' }: SyncStatusBadgeProps) {
  const isOnline = useOnlineStatus()
  const { pendingCount, isSyncing, lastSyncAt } = useSyncStatus()

  const formatLastSync = (date: Date | null) => {
    if (!date) return '未同期'

    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)

    if (minutes < 1) return 'たった今'
    if (minutes < 60) return `${minutes}分前`
    if (hours < 24) return `${hours}時間前`
    return date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })
  }

  return (
    <div className={`flex items-center gap-2 text-sm ${className}`}>
      {/* Status indicator */}
      <div
        className={`w-2 h-2 rounded-full ${
          !isOnline
            ? 'bg-yellow-500'
            : isSyncing
            ? 'bg-blue-500 animate-pulse'
            : pendingCount > 0
            ? 'bg-orange-500'
            : 'bg-green-500'
        }`}
      />

      {/* Status text */}
      <span className="text-gray-600">
        {!isOnline ? (
          'オフライン'
        ) : isSyncing ? (
          '同期中...'
        ) : pendingCount > 0 ? (
          `${pendingCount}件待ち`
        ) : (
          formatLastSync(lastSyncAt)
        )}
      </span>
    </div>
  )
}
