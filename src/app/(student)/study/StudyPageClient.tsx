'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useLiveQuery } from 'dexie-react-hooks'
import { StudySession } from '@/components/card/StudySession'
import { useAuth } from '@/contexts/AuthContext'
import { useOnlineStatus } from '@/lib/db/hooks'
import { getStudyCardsOffline, getPracticeCardsOffline, getDecksWithStatsOffline, getRootDeckId, db } from '@/lib/db/schema'
import Link from 'next/link'
import type { FieldDefinition, GeneratedContent, DeckSettings } from '@/types/database'
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
  deckSettings?: Partial<DeckSettings>
}

interface OfflineStudyData {
  cards: CardData[]
  deckName: string
  deckSettings: Partial<DeckSettings>
}

export function StudyPageClient({
  deckId: deckIdProp,
  deckName,
  initialCards,
  userId: userIdProp,
  deckSettings,
}: StudyPageClientProps) {
  const isOnline = useOnlineStatus()
  const searchParams = useSearchParams()
  const { userId: authUserId } = useAuth()

  // Resolve deckId: prop takes precedence, then URL param.
  // Accept both `deck` (SRS internal convention) and `deckId` (billing LINE deep-link convention).
  const deckId = deckIdProp ?? searchParams.get('deck') ?? searchParams.get('deckId') ?? null

  // Priority card ID from LINE notification deep link. Same dual-key compat.
  const priorityCardId =
    searchParams.get('card') ??
    searchParams.get('cardId') ??
    (typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('card') ??
        new URLSearchParams(window.location.search).get('cardId')
      : null)

  const hasServerData = initialCards !== undefined && userIdProp !== undefined

  // Resolve userId: prop > auth context > first IndexedDB profile (true offline).
  // Wrapped in liveQuery so an arriving profile from sync auto-updates the page.
  const offlineUserId = useLiveQuery(
    async () => {
      if (userIdProp || authUserId) return null
      const p = await db.profiles.toCollection().first()
      return p?.id ?? null
    },
    [userIdProp, authUserId],
  )
  const userId = userIdProp || authUserId || offlineUserId || null

  // Live query: study cards + deck name + merged settings for the chosen deck.
  // Returns:
  //   - undefined while loading
  //   - null if no userId or no deckId
  //   - { cards, deckName, deckSettings } once data is available
  const offlineStudyData = useLiveQuery<OfflineStudyData | null>(
    async () => {
      if (hasServerData || !userId || !deckId) return null

      const cards = await getStudyCardsOffline(userId, deckId)
      const deck = await db.decks.get(deckId)
      const rootId = await getRootDeckId(deckId)
      const rootDeck = rootId !== deckId ? await db.decks.get(rootId) : deck
      const userSettingsId = `${userId}:${rootId}`
      const userDeckSetting = await db.userDeckSettings.get(userSettingsId).catch(() => undefined)
      const merged = {
        ...(rootDeck?.settings || {}),
        ...(userDeckSetting?.settings || {}),
      }

      return {
        cards,
        deckName: deck?.name || 'デッキ',
        deckSettings: merged as Partial<DeckSettings>,
      }
    },
    [hasServerData, userId, deckId],
  )

  // Live query: deck list when no specific deck is chosen
  const offlineDecks = useLiveQuery(
    async () => {
      if (hasServerData || deckId || !userId) return null
      return await getDecksWithStatsOffline(userId)
    },
    [hasServerData, deckId, userId],
  )

  // 練習モード（繰り上げ学習）の状態。完了画面の「もっと練習する」で起動する。
  // 練習カードは getPracticeCardsOffline で都度取得し、key を変えて StudySession を再マウントする。
  const [practiceRound, setPracticeRound] = useState(0)
  const [practiceCards, setPracticeCards] = useState<CardData[] | null>(null)
  const [practiceLoading, setPracticeLoading] = useState(false)
  const [practiceUnavailable, setPracticeUnavailable] = useState(false)

  const handleRequestPractice = async () => {
    if (!userId || !deckId) return
    setPracticeLoading(true)
    setPracticeUnavailable(false)
    try {
      const cards = await getPracticeCardsOffline(userId, deckId, 20)
      if (cards.length === 0) {
        setPracticeUnavailable(true)
      } else {
        setPracticeCards(cards)
        setPracticeRound(r => r + 1)
      }
    } catch (e) {
      console.error('練習カードの取得に失敗:', e)
      setPracticeUnavailable(true)
    } finally {
      setPracticeLoading(false)
    }
  }

  // Loading: still resolving userId or live queries
  if (!hasServerData && !userId && offlineUserId === undefined) {
    return <StudyLoadingSkeleton />
  }

  // Definitively no profile available, even after Dexie check
  if (!hasServerData && !userId && offlineUserId === null) {
    return (
      <div className="py-6">
        <div className="bg-again-bg rounded-card p-4 text-again">
          オフラインデータがありません。オンラインでログインしてください。
        </div>
      </div>
    )
  }

  // No deck selected - show deck selection
  if (!deckId) {
    if (hasServerData) {
      return null
    }

    if (offlineDecks === undefined) {
      return <StudyLoadingSkeleton />
    }

    const decks = offlineDecks ?? []
    return (
      <div className="py-6">
        <h1 className="text-2xl font-extrabold text-ai mb-6">学習</h1>
        <OfflineBadge />

        {decks.length > 0 ? (
          <div className="space-y-3">
            {decks.map(deck => (
              <Link
                key={deck.id}
                href={`/study?deck=${deck.id}`}
                className="block bg-white rounded-2xl border border-gray-200 p-4 hover:border-sora transition-all"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-ai">{deck.name}</h3>
                    <p className="text-sm text-ink-3 mt-1">{deck.total_cards} 枚のカード</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {deck.new_count > 0 && (
                      <span className="rounded-full px-2.5 py-0.5 text-xs font-bold bg-easy-bg text-easy tabular-nums">
                        新規 {deck.new_count}
                      </span>
                    )}
                    {deck.learning_count > 0 && (
                      <span className="rounded-full px-2.5 py-0.5 text-xs font-bold bg-hard-bg text-hard tabular-nums">
                        学習中 {deck.learning_count}
                      </span>
                    )}
                    {deck.review_count > 0 && (
                      <span className="rounded-full px-2.5 py-0.5 text-xs font-bold bg-good-bg text-good tabular-nums">
                        復習 {deck.review_count}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-card border border-gray-200 p-8 text-center">
            <h2 className="text-lg font-bold text-ai mb-2">
              {isOnline ? '同期中…' : 'オフラインデータがありません'}
            </h2>
            <p className="text-ink-3">
              {isOnline
                ? 'デッキを取得しています。少々お待ちください。'
                : 'オンライン時にデッキを開くと、データが自動的にキャッシュされます。'}
            </p>
          </div>
        )}
      </div>
    )
  }

  // Specific deck chosen
  const cards = hasServerData ? initialCards : offlineStudyData?.cards
  const resolvedDeckName = deckName || offlineStudyData?.deckName || 'デッキ'
  const resolvedSettings = deckSettings || offlineStudyData?.deckSettings

  if (!cards || !userId) {
    return <StudyLoadingSkeleton />
  }

  // 練習中はその練習カードを使い、通常時はライブクエリのカードを使う。
  const inPractice = practiceCards !== null
  const sessionCards = practiceCards ?? cards

  return (
    <div className="py-0">
      {!isOnline && <OfflineBadge />}
      <StudySession
        key={`session-${practiceRound}`}
        deckId={deckId || undefined}
        priorityCardId={inPractice ? undefined : priorityCardId || undefined}
        deckName={resolvedDeckName}
        initialCards={sessionCards}
        userId={userId}
        deckSettings={resolvedSettings}
        practiceMode={inPractice}
        onRequestPractice={handleRequestPractice}
        practiceLoading={practiceLoading}
        practiceUnavailable={practiceUnavailable}
      />
    </div>
  )
}

function OfflineBadge() {
  return (
    <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-hard-bg rounded-2xl text-sm font-bold text-hard">
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
          <div className="h-4 w-24 bg-gray-200 rounded-full animate-pulse" />
          <div className="h-4 w-16 bg-gray-200 rounded-full animate-pulse" />
        </div>
        <div className="h-2 bg-gray-200 rounded-full" />
      </div>
      <div className="w-full max-w-2xl mx-auto">
        <div className="bg-white rounded-card shadow-card border border-gray-200 min-h-[300px] flex flex-col">
          <div className="flex-1 p-8 flex flex-col items-center justify-center gap-4">
            <div className="h-6 w-48 bg-gray-200 rounded-xl animate-pulse" />
            <div className="h-4 w-32 bg-gray-100 rounded-xl animate-pulse" />
          </div>
        </div>
        <div className="mt-6 flex justify-center">
          <div className="h-12 w-48 bg-gray-200 rounded-2xl animate-pulse" />
        </div>
      </div>
    </div>
  )
}
