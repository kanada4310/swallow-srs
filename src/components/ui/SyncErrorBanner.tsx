'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { subscribeSyncStatus, getSyncStatus, fullSync, type SyncStatus } from '@/lib/db/sync'
import { retryFailedSync } from '@/lib/db/sync-queue'

/**
 * Top-of-screen banner that surfaces sync problems that would otherwise be
 * invisible:
 *  - fullSync errors silently swallowed by AuthContext.fullSync(...).catch(console.error)
 *  - 送信キューの「隔離」記録（連続失敗でサーバーに届いていない学習記録）。
 *    これは以前カウントからも消え「同期済み」に見えていた=データ消失の予兆。
 *
 * Auto-hides while syncing or after the user dismisses it for the current session.
 * Dismissal is intentionally per-tab — the banner re-appears next page load if the
 * underlying problem persists, since masking a sync failure across sessions would
 * make this entire bug class invisible again.
 */
export function SyncErrorBanner() {
  const { userId } = useAuth()
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus)
  const [dismissed, setDismissed] = useState(false)
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    setStatus(getSyncStatus())
    const unsub = subscribeSyncStatus((s) => {
      setStatus(s)
      // A successful sync clears the dismissal so a new problem after recovery is shown again.
      if (!s.error && s.quarantinedCount === 0) setDismissed(false)
    })
    return unsub
  }, [])

  const handleRetry = useCallback(async () => {
    if (!userId || retrying) return
    setRetrying(true)
    try {
      // 隔離された記録を再送対象に戻してから同期（アップサートなので二重送信は無害）
      await retryFailedSync()
      await fullSync(userId)
    } catch {
      // status.error / quarantinedCount will reflect the result
    } finally {
      setRetrying(false)
    }
  }, [userId, retrying])

  const hasQuarantine = status.quarantinedCount > 0
  if ((!status.error && !hasQuarantine) || status.isSyncing || dismissed) return null

  return (
    <div role="alert" className="px-3 pt-2">
      <div className="bg-again-bg rounded-card px-4 py-2 flex items-center gap-3 text-sm">
        <svg className="w-4 h-4 text-again flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <div className="flex-1 min-w-0">
          {hasQuarantine ? (
            <>
              <span className="font-bold text-ai">未送信の記録があります</span>
              <span className="text-ink-2 ml-2 truncate">
                {status.quarantinedCount}件の学習記録がまだ届いていません
              </span>
            </>
          ) : (
            <>
              <span className="font-bold text-ai">同期エラー</span>
              <span className="text-ink-2 ml-2 truncate">{status.error}</span>
            </>
          )}
        </div>
        <button
          onClick={handleRetry}
          disabled={retrying || !status.isOnline}
          className="px-3 py-1 text-xs font-bold text-again bg-white rounded-full hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {retrying ? '再試行中…' : '再試行'}
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="text-ink-3 hover:text-ink-2 flex-shrink-0"
          aria-label="閉じる"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
