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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)
  const [isDeletingDeck, setIsDeletingDeck] = useState(false)
  const [deckDeleteError, setDeckDeleteError] = useState<string | null>(null)

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

  const [localDecks, setLocalDecks] = useState<DeckWithStats[] | null>(null)
  const sourceDecks = hasServerData ? initialDecks : offlineDecks
  const decks = localDecks ?? sourceDecks

  // Sync localDecks when source changes
  useEffect(() => {
    setLocalDecks(null)
  }, [sourceDecks])

  const handleDeleteDeck = async (deckId: string) => {
    setIsDeletingDeck(true)
    setDeckDeleteError(null)
    try {
      const response = await fetch(`/api/decks/${deckId}`, { method: 'DELETE' })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'デッキの削除に失敗しました')
      }
      // Optimistic update
      setLocalDecks(prev => (prev ?? sourceDecks ?? []).filter(d => d.id !== deckId))
      setShowDeleteConfirm(null)
      // Clean up IndexedDB in background
      import('@/lib/db/schema').then(({ deleteDeckLocally }) => {
        deleteDeckLocally(deckId).catch(console.error)
      })
    } catch (err) {
      setDeckDeleteError(err instanceof Error ? err.message : 'デッキの削除に失敗しました')
    } finally {
      setIsDeletingDeck(false)
    }
  }

  const deletingDeckName = showDeleteConfirm
    ? decks?.find(d => d.id === showDeleteConfirm)?.name || ''
    : ''

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
              <DeckCard
                key={deck.id}
                deck={deck}
                canDelete={userProfile?.role !== 'student'}
                onDelete={() => setShowDeleteConfirm(deck.id)}
              />
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

      {/* Deck Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">デッキを削除</h3>
            <p className="text-sm text-gray-600 mb-1">
              「{deletingDeckName}」を削除しますか？
            </p>
            <p className="text-sm text-red-600 mb-4">
              デッキ内のすべてのノート・カード・学習記録が完全に削除されます。この操作は元に戻せません。
            </p>
            {deckDeleteError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {deckDeleteError}
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(null)
                  setDeckDeleteError(null)
                }}
                disabled={isDeletingDeck}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={() => handleDeleteDeck(showDeleteConfirm)}
                disabled={isDeletingDeck}
                className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {isDeletingDeck ? '削除中...' : 'デッキを削除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DeckCard({ deck, canDelete, onDelete }: { deck: DeckWithStats; canDelete?: boolean; onDelete?: () => void }) {
  const hasDueCards = deck.review_count > 0 || deck.learning_count > 0 || deck.new_count > 0

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md hover:border-gray-300 transition-all">
      <div className="flex items-center justify-between">
        <Link href={`/decks/${deck.id}`} className="flex-1 min-w-0">
          <h3 className="font-medium text-gray-900">{deck.name}</h3>
          <p className="text-sm text-gray-500 mt-1">
            {deck.total_cards} 枚のカード
            {!deck.is_own && <span className="ml-2 text-blue-600">（配布）</span>}
          </p>
        </Link>

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

          {canDelete && onDelete ? (
            <button
              onClick={(e) => {
                e.preventDefault()
                onDelete()
              }}
              className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
              title="デッキを削除"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          ) : (
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          )}
        </div>
      </div>
    </div>
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
