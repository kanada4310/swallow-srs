'use client'

import { useEffect, useState } from 'react'
import { Download, X, Share } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISSED_KEY = 'pwa-install-dismissed'
const DISMISS_DURATION = 7 * 24 * 60 * 60 * 1000 // 7 days

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    // Check if already installed (standalone mode)
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as { standalone?: boolean }).standalone === true
    setIsStandalone(standalone)

    if (standalone) return

    // Check if previously dismissed
    const dismissedAt = localStorage.getItem(DISMISSED_KEY)
    if (dismissedAt) {
      const dismissedTime = parseInt(dismissedAt, 10)
      if (Date.now() - dismissedTime < DISMISS_DURATION) {
        return
      }
    }

    // Check if iOS
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent)
    setIsIOS(isIOSDevice)

    if (isIOSDevice) {
      // Show iOS install instructions after a delay
      const timer = setTimeout(() => {
        setShowPrompt(true)
      }, 3000)
      return () => clearTimeout(timer)
    }

    // Listen for beforeinstallprompt (Android/Chrome)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      // Show install prompt after a short delay
      setTimeout(() => {
        setShowPrompt(true)
      }, 2000)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    }
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return

    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice

    if (outcome === 'accepted') {
      setShowPrompt(false)
    }
    setDeferredPrompt(null)
  }

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, Date.now().toString())
    setShowPrompt(false)
  }

  if (isStandalone || !showPrompt) {
    return null
  }

  // 学習セッションの邪魔をしない: 学習ページではプロンプトを出さない
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/study')) {
    return null
  }

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 animate-slide-up">
      <div className="bg-white rounded-card shadow-card border border-gray-200 p-4 max-w-md mx-auto">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-sora-soft rounded-2xl flex items-center justify-center flex-shrink-0">
            <Download className="w-5 h-5 text-sora" />
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-ai text-sm">
              アプリをインストール
            </h3>
            <p className="text-xs text-ink-2 mt-0.5">
              ホーム画面に追加して、より快適に利用できます
            </p>
          </div>

          <button
            onClick={handleDismiss}
            className="p-1 text-ink-3 hover:text-ink-2 transition-colors"
            aria-label="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isIOS ? (
          <div className="mt-3 p-3 bg-sora-soft rounded-2xl">
            <p className="text-xs text-ink-2 flex items-center gap-2">
              <Share className="w-4 h-4 text-sora" />
              Safari下部の共有ボタンから「ホーム画面に追加」を選択
            </p>
          </div>
        ) : (
          <div className="mt-3 flex gap-2">
            <button
              onClick={handleDismiss}
              className="flex-1 px-3 py-2 text-sm font-bold text-ink-3 hover:text-ink-2 hover:bg-gray-100 rounded-2xl transition-colors"
            >
              後で
            </button>
            <button
              onClick={handleInstall}
              className="flex-1 px-3 py-2 text-sm bg-sora text-white font-bold rounded-2xl hover:bg-sora-dark transition-all active:scale-95"
            >
              インストール
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
