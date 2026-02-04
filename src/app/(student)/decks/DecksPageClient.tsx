'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { AppLayout } from '@/components/layout/AppLayout'
import { useOnlineStatus, usePrefetchAllDecks } from '@/lib/db/hooks'
import { getDecksWithStatsOffline, db } from '@/lib/db/schema'

interface DeckWithStats {
  id: string
  name: string
  owner_id: string
  is_distributed: boolean
  is_own: boolean
  total_cards: number
  new_count: number
  learning_count: number
  review_count: number
}

interface DecksPageClientProps {
  initialDecks?: DeckWithStats[]
  userProfile?: { id: string; name: string; role: string }
}

export function DecksPageClient({ initialDecks, userProfile: userProfileProp }: DecksPageClientProps) {
  const isOnline = useOnlineStatus()
  const [offlineDecks, setOfflineDecks] = useState<DeckWithStats[] | null>(null)
  const [offlineProfile, setOfflineProfile] = useState<{ id: string; name: string; role: string } | null>(null)
  const [isLoadingOffline, setIsLoadingOffline] = useState(false)

  const hasServerData = initialDecks !== undefined && userProfileProp !== undefined

  // Resolved profile (server or offline)
  const userProfile = userProfileProp || offlineProfile

  // Prefetch deck data for offline use
  const deckIds = (hasServerData ? initialDecks : offlineDecks)?.map(d => d.id) || []
  usePrefetchAllDecks(deckIds)

  // Load offline data when server data unavailable
  useEffect(() => {
    if (hasServerData) return

    const loadOfflineData = async () => {
      setIsLoadingOffline(true)
      try {
        // Load profile from IndexedDB if not provided
        let resolvedUserId: string | null = userProfileProp?.id || null
        if (!resolvedUserId) {
          const profile = await db.profiles.toCollection().first()
          if (profile) {
            resolvedUserId = profile.id
            setOfflineProfile({ id: profile.id, name: profile.name, role: profile.role })
          } else {
            setOfflineDecks([])
            return
          }
        }

        const decks = await getDecksWithStatsOffline(resolvedUserId)
        setOfflineDecks(decks)
      } catch (err) {
        console.error('Failed to load offline decks:', err)
        setOfflineDecks([])
      } finally {
        setIsLoadingOffline(false)
      }
    }

    loadOfflineData()
  }, [hasServerData, userProfileProp?.id])

  const decks = hasServerData ? initialDecks : offlineDecks

  // Wrap in AppLayout when in standalone mode (no server-side layout)
  const needsLayout = !userProfileProp
  const wrapInLayout = (content: React.ReactNode) => {
    if (needsLayout && userProfile) {
      return (
        <AppLayout userName={userProfile.name} userRole={userProfile.role as 'student' | 'teacher' | 'admin'}>
          {content}
        </AppLayout>
      )
    }
    return content
  }

  if (!hasServerData && isLoadingOffline) {
    return wrapInLayout(<DecksLoadingSkeleton />)
  }

  if (!decks) {
    return wrapInLayout(<DecksLoadingSkeleton />)
  }

  const ownDecks = decks.filter(d => d.is_own)
  const assignedDecks = decks.filter(d => !d.is_own)

  return wrapInLayout(
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">デッキ一覧</h1>
        {userProfile && userProfile.role !== 'student' && (
          <Link
            href="/decks/new"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            新規作成
          </Link>
        )}
      </div>

      {!isOnline && (
        <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21" />
          </svg>
          オフラインモード - キャッシュされたデータを表示中
        </div>
      )}

      {/* 自分のデッキ */}
      {ownDecks.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-700 mb-4">マイデッキ</h2>
          <div className="space-y-3">
            {ownDecks.map((deck) => (
              <DeckCard key={deck.id} deck={deck} />
            ))}
          </div>
        </section>
      )}

      {/* 配布されたデッキ */}
      {assignedDecks.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-700 mb-4">配布デッキ</h2>
          <div className="space-y-3">
            {assignedDecks.map((deck) => (
              <DeckCard key={deck.id} deck={deck} />
            ))}
          </div>
        </section>
      )}

      {/* デッキがない場合 */}
      {decks.length === 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
          <div className="text-gray-400 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <h2 className="text-lg font-medium text-gray-900 mb-2">
            {!isOnline ? 'オフラインデータがありません' : 'デッキがありません'}
          </h2>
          <p className="text-gray-500">
            {!isOnline
              ? 'オンライン時にデッキを開くと、データが自動的にキャッシュされます。'
              : userProfile?.role === 'student'
                ? '講師からデッキが配布されるのを待ちましょう。'
                : 'デッキを作成して、生徒に配布しましょう。'}
          </p>
        </div>
      )}
    </div>
  )
}

function DeckCard({ deck }: { deck: DeckWithStats }) {
  const hasDueCards = deck.review_count > 0 || deck.learning_count > 0 || deck.new_count > 0

  return (
    <Link
      href={`/decks/${deck.id}`}
      className="block bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md hover:border-gray-300 transition-all"
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <h3 className="font-medium text-gray-900">{deck.name}</h3>
          <p className="text-sm text-gray-500 mt-1">
            {deck.total_cards} 枚のカード
            {!deck.is_own && <span className="ml-2 text-blue-600">（配布）</span>}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* 学習状況バッジ */}
          <div className="flex items-center gap-2 text-sm">
            {deck.new_count > 0 && (
              <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded font-medium">
                新規 {deck.new_count}
              </span>
            )}
            {deck.learning_count > 0 && (
              <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded font-medium">
                学習中 {deck.learning_count}
              </span>
            )}
            {deck.review_count > 0 && (
              <span className="px-2 py-1 bg-green-100 text-green-700 rounded font-medium">
                復習 {deck.review_count}
              </span>
            )}
            {!hasDueCards && deck.total_cards > 0 && (
              <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded">
                完了
              </span>
            )}
          </div>

          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </Link>
  )
}

function DecksLoadingSkeleton() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div className="h-8 w-32 bg-gray-200 rounded animate-pulse" />
        <div className="h-10 w-20 bg-gray-200 rounded-lg animate-pulse" />
      </div>
      <div className="h-5 w-24 bg-gray-200 rounded animate-pulse mb-4" />
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="h-5 w-40 bg-gray-200 rounded animate-pulse" />
                <div className="h-4 w-24 bg-gray-100 rounded animate-pulse mt-2" />
              </div>
              <div className="flex items-center gap-2">
                <div className="h-7 w-16 bg-gray-100 rounded animate-pulse" />
                <div className="h-7 w-16 bg-gray-100 rounded animate-pulse" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
