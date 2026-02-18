'use client'

import { useState, useEffect, useCallback } from 'react'
import { Bell, Loader2, Send, AlertTriangle } from 'lucide-react'
import {
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
  getExistingSubscription,
} from '@/lib/push/subscription'

interface NotificationSettingsData {
  enabled: boolean
  reminder_hour: number
}

export function NotificationSettings() {
  const [settings, setSettings] = useState<NotificationSettingsData>({
    enabled: true,
    reminder_hour: 7,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [supported, setSupported] = useState(true)

  const checkSubscription = useCallback(async () => {
    const existing = await getExistingSubscription()
    setIsSubscribed(!!existing)
  }, [])

  useEffect(() => {
    setSupported(isPushSupported())
    fetchSettings()
    checkSubscription()
  }, [checkSubscription])

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/push/settings')
      if (!response.ok) throw new Error('設定の取得に失敗しました')
      const data = await response.json()
      if (data.success && data.settings) {
        setSettings({
          enabled: data.settings.enabled ?? true,
          reminder_hour: data.settings.reminder_hour ?? 7,
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '設定の取得に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }

  const handleToggleEnabled = async () => {
    const newEnabled = !settings.enabled
    setSettings((prev) => ({ ...prev, enabled: newEnabled }))
    setError(null)

    if (newEnabled && !isSubscribed) {
      // Check if Service Worker is available
      if (!('serviceWorker' in navigator)) {
        setSettings((prev) => ({ ...prev, enabled: false }))
        setError('Service Workerが登録されていません。本番環境（HTTPS）またはPWAとしてインストールしてからお試しください。')
        return
      }

      // Wait for SW to be ready (covers initial install where controller is null)
      try {
        await Promise.race([
          navigator.serviceWorker.ready,
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
        ])
      } catch {
        setSettings((prev) => ({ ...prev, enabled: false }))
        setError('Service Workerの準備ができていません。ページを再読み込みしてからお試しください。')
        return
      }

      // Subscribe to push when enabling
      try {
        const result = await subscribeToPush()
        if (!result.ok) {
          setSettings((prev) => ({ ...prev, enabled: false }))
          setError(result.message)
          return
        }

        const subJson = result.subscription.toJSON()
        const response = await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: subJson.endpoint,
            keys: subJson.keys,
          }),
        })

        if (!response.ok) throw new Error('購読の保存に失敗しました')
        setIsSubscribed(true)
      } catch (err) {
        setSettings((prev) => ({ ...prev, enabled: false }))
        setError(err instanceof Error ? err.message : '通知の有効化に失敗しました')
        return
      }
    } else if (!newEnabled && isSubscribed) {
      // Unsubscribe when disabling
      try {
        const existing = await getExistingSubscription()
        if (existing) {
          await fetch('/api/push/subscribe', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: existing.endpoint }),
          })
        }
        await unsubscribeFromPush()
        setIsSubscribed(false)
      } catch {
        // Unsubscribe failure is non-critical
      }
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/push/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || '設定の保存に失敗しました')
      }

      setSuccess('設定を保存しました')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : '設定の保存に失敗しました')
    } finally {
      setIsSaving(false)
    }
  }

  const handleTestSend = async () => {
    setIsTesting(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/push/test', { method: 'POST' })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'テスト送信に失敗しました')
      }

      setSuccess(`テスト通知を送信しました（${data.sent}/${data.total} デバイス）`)
      setTimeout(() => setSuccess(null), 5000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'テスト送信に失敗しました')
    } finally {
      setIsTesting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!supported) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Bell className="w-6 h-6 text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900">通知設定</h2>
        </div>
        <div className="flex items-start gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-yellow-700">
            <p className="font-medium">お使いのブラウザはプッシュ通知に対応していません</p>
            <p className="mt-1">Chrome、Firefox、Edge、またはSafari（iOS 16.4+）をご利用ください。</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center gap-3 mb-6">
        <Bell className="w-6 h-6 text-blue-600" />
        <h2 className="text-lg font-semibold text-gray-900">通知設定</h2>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          {success}
        </div>
      )}

      <div className="space-y-6">
        {/* Enable/Disable Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              毎日の学習リマインダー
            </label>
            <p className="text-xs text-gray-500 mt-1">
              復習カードがある時に通知でお知らせします
            </p>
          </div>
          <button
            type="button"
            onClick={handleToggleEnabled}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              settings.enabled ? 'bg-blue-600' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                settings.enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {settings.enabled && (
          <>
            {/* Reminder Time */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                通知時刻
              </label>
              <select
                value={settings.reminder_hour}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    reminder_hour: parseInt(e.target.value, 10),
                  }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>
                    {String(i).padStart(2, '0')}:00
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                現在は毎朝07:00 (JST) に一括送信されます。個別時刻指定は今後対応予定です。
              </p>
            </div>

            {/* Test Send */}
            <div className="pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={handleTestSend}
                disabled={isTesting || !isSubscribed}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isTesting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    送信中...
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    テスト送信
                  </>
                )}
              </button>
              {!isSubscribed && settings.enabled && (
                <p className="mt-2 text-xs text-yellow-600">
                  通知の購読が完了していません。トグルをオフにして再度オンにしてください。
                </p>
              )}
            </div>

            {/* iOS Note */}
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs text-blue-700">
                <span className="font-medium">iOSをお使いの場合:</span>{' '}
                Safari で「ホーム画面に追加」した後に通知を有効にしてください。
                ホーム画面に追加していない場合、プッシュ通知は利用できません。
              </p>
            </div>
          </>
        )}

        {/* Save Button */}
        <div className="pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {isSaving ? '保存中...' : '設定を保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
