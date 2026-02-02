'use client'

import { useEffect, useState } from 'react'
import { WifiOff, RefreshCw, Database } from 'lucide-react'

export default function OfflinePage() {
  const [isOnline, setIsOnline] = useState(false)

  useEffect(() => {
    setIsOnline(navigator.onLine)

    const handleOnline = () => {
      setIsOnline(true)
      // オンラインに復帰したら自動でホームにリダイレクト
      setTimeout(() => {
        window.location.href = '/'
      }, 1500)
    }

    const handleOffline = () => {
      setIsOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const handleRefresh = () => {
    window.location.reload()
  }

  if (isOnline) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
            <RefreshCw className="w-8 h-8 text-green-600 animate-spin" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            オンラインに復帰しました
          </h1>
          <p className="text-gray-600">
            ホームページにリダイレクトしています...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <div className="w-20 h-20 mx-auto mb-6 bg-gray-100 rounded-full flex items-center justify-center">
          <WifiOff className="w-10 h-10 text-gray-400" />
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          オフラインです
        </h1>

        <p className="text-gray-600 mb-8">
          インターネット接続が見つかりません。
          <br />
          接続を確認してから再度お試しください。
        </p>

        <button
          onClick={handleRefresh}
          className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <RefreshCw className="w-5 h-5" />
          再読み込み
        </button>

        <div className="mt-12 p-4 bg-blue-50 rounded-lg text-left">
          <div className="flex items-start gap-3">
            <Database className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <h2 className="font-medium text-blue-900 mb-1">
                オフラインでもできること
              </h2>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>- 以前学習したカードの復習</li>
                <li>- 学習記録はオンライン復帰後に同期</li>
              </ul>
            </div>
          </div>
        </div>

        <p className="mt-8 text-xs text-gray-400">
          つばめSRS - オフラインファースト学習アプリ
        </p>
      </div>
    </div>
  )
}
