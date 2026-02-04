'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { StudySession } from '@/components/card/StudySession'
import { AppLayout } from '@/components/layout/AppLayout'
import { useOnlineStatus } from '@/lib/db/hooks'
import { getStudyCardsOffline, getDecksWithStatsOffline, db } from '@/lib/db/schema'
import Link from 'next/link'
import type { FieldDefinition, GeneratedContent } from '@/types/database'
import type { CardSchedule } from '@/lib/srs/scheduler'

interface CardData {
  id: string
  noteId: string
  fieldValues: Record<string, string>
  audioUrls: Record<string, string> | null
  generatedContent: GeneratedContent | null
  template: {
    front: string
    back: string
    css: string
  }
  fields?: FieldDefinition[]
  clozeNumber?: number
  schedule: CardSchedule
}

interface StudyPageClientProps {
  deckId?: string | null
  deckName?: string
  initialCards?: CardData[]
  userId?: string
  userProfile?: { name: string; role: string }
}

export function StudyPageClient({
  deckId: deckIdProp,
  deckName,
  initialCards,
  userId: userIdProp,
  userProfile: userProfileProp,
}: StudyPageClientProps) {
  const isOnline = useOnlineStatus()
  const searchParams = useSearchParams()

  // Resolve deckId: prop takes precedence, then URL param
  const deckId = deckIdProp ?? searchParams.get('deck') ?? null

  // State for data loaded from IndexedDB
  const [offlineUserId, setOfflineUserId] = useState<string | null>(null)
  const [offlineProfile, setOfflineProfile] = useState<{ name: string; role: string } | null>(null)
  const [offlineCards, setOfflineCards] = useState<CardData[] | null>(null)
  const [offlineDeckName, setOfflineDeckName] = useState<string | null>(null)
  const [offlineDecks, setOfflineDecks] = useState<
    Array<{ id: string; name: string; total_cards: number; new_count: number; learning_count: number; review_count: number }>
  >([])
  const [isLoadingOffline, setIsLoadingOffline] = useState(false)
  const [offlineError, setOfflineError] = useState<string | null>(null)

  // Determine if we have server-provided data
  const hasServerData = initialCards !== undefined && userIdProp !== undefined

  // Resolved values (server data or offline data)
  const userId = userIdProp || offlineUserId
  const userProfile = userProfileProp || offlineProfile

  // Load offline data when server data is unavailable
  useEffect(() => {
    if (hasServerData) return

    const loadOfflineData = async () => {
      setIsLoadingOffline(true)
      setOfflineError(null)

      try {
        // Load profile from IndexedDB if not provided
        let resolvedUserId = userIdProp || null
        if (!resolvedUserId) {
          const profile = await db.profiles.toCollection().first()
          if (profile) {
            resolvedUserId = profile.id
            setOfflineUserId(profile.id)
            setOfflineProfile({ name: profile.name, role: profile.role })
          } else {
            setOfflineError('オフラインデータがありません。オンラインでログインしてください。')
            return
          }
        }

        if (deckId) {
          // Load study cards for specific deck
          const cards = await getStudyCardsOffline(resolvedUserId, deckId)
          setOfflineCards(cards)

          // Get deck name
          const deck = await db.decks.get(deckId)
          setOfflineDeckName(deck?.name || 'デッキ')
        } else {
          // Show deck selection from offline data
          const decks = await getDecksWithStatsOffline(resolvedUserId)
          setOfflineDecks(decks)
        }
      } catch (err) {
        console.error('Failed to load offline data:', err)
        setOfflineError('オフラインデータの読み込みに失敗しました')
      } finally {
        setIsLoadingOffline(false)
      }
    }

    loadOfflineData()
  }, [hasServerData, deckId, userIdProp])

  // Wrap content in AppLayout when in standalone mode (no server-side layout)
  const needsLayout = !userProfileProp
  const wrapInLayout = (content: React.ReactNode) => {
    if (needsLayout && userProfile) {
      return (
        <AppLayout userName={userProfile.name} userRole={userProfile.role as 'student' | 'teacher' | 'admin'}>
          <div className="max-w-4xl mx-auto px-4">
            {content}
          </div>
        </AppLayout>
      )
    }
    return content
  }

  // Loading state for offline
  if (!hasServerData && isLoadingOffline) {
    return wrapInLayout(<StudyLoadingSkeleton />)
  }

  // Error state
  if (!hasServerData && offlineError) {
    return wrapInLayout(
      <div className="py-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {offlineError}
        </div>
      </div>
    )
  }

  // No deck selected - show deck selection
  if (!deckId) {
    if (hasServerData) {
      return null
    }

    // Offline deck selection
    return wrapInLayout(
      <div className="py-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">学習</h1>
        <OfflineBadge />

        {offlineDecks.length > 0 ? (
          <div className="space-y-3">
            {offlineDecks.map(deck => (
              <Link
                key={deck.id}
                href={`/study?deck=${deck.id}`}
                className="block bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md hover:border-gray-300 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900">{deck.name}</h3>
                    <p className="text-sm text-gray-500 mt-1">{deck.total_cards} 枚のカード</p>
                  </div>
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
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
            <h2 className="text-lg font-medium text-gray-900 mb-2">
              オフラインデータがありません
            </h2>
            <p className="text-gray-500">
              オンライン時にデッキを開くと、データが自動的にキャッシュされます。
            </p>
          </div>
        )}
      </div>
    )
  }

  // Determine which cards to use
  const cards = hasServerData ? initialCards : offlineCards
  const resolvedDeckName = deckName || offlineDeckName || 'デッキ'

  if (!cards || !userId) {
    return wrapInLayout(<StudyLoadingSkeleton />)
  }

  return wrapInLayout(
    <div className="py-0">
      {!isOnline && <OfflineBadge />}
      <StudySession
        deckName={resolvedDeckName}
        initialCards={cards}
        userId={userId}
      />
    </div>
  )
}

function OfflineBadge() {
  return (
    <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21" />
      </svg>
      オフラインモード - キャッシュされたデータを使用中
    </div>
  )
}

function StudyLoadingSkeleton() {
  return (
    <div className="py-6">
      <div className="max-w-2xl mx-auto mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-16 bg-gray-200 rounded animate-pulse" />
        </div>
        <div className="h-2 bg-gray-200 rounded-full" />
      </div>
      <div className="w-full max-w-2xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 min-h-[300px] flex flex-col">
          <div className="flex-1 p-8 flex flex-col items-center justify-center gap-4">
            <div className="h-6 w-48 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 w-32 bg-gray-100 rounded animate-pulse" />
          </div>
        </div>
        <div className="mt-6 flex justify-center">
          <div className="h-12 w-48 bg-gray-200 rounded-lg animate-pulse" />
        </div>
      </div>
    </div>
  )
}
