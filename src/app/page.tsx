'use client'

import Link from 'next/link'
import { useLiveQuery } from 'dexie-react-hooks'
import { useAuth } from '@/contexts/AuthContext'
import { AppLayout } from '@/components/layout/AppLayout'
import { db } from '@/lib/db/schema'

interface StudentStats {
  dueCards: number
  newCards: number
  learningCards: number
  reviewsToday: number
}

interface RecentDeck {
  id: string
  name: string
  lastStudiedAt: Date
  due_count: number
  new_count: number
  learning_count: number
}

interface TeacherStats {
  deckCount: number
  cardCount: number
}

async function getStudentStatsLocal(userId: string): Promise<StudentStats> {
  const now = new Date()
  const todayStart = new Date()
  todayStart.setHours(4, 0, 0, 0)
  if (now.getHours() < 4) {
    todayStart.setDate(todayStart.getDate() - 1)
  }

  const allCardStates = await db.cardStates
    .where('user_id')
    .equals(userId)
    .toArray()

  let dueCards = 0
  let learningCards = 0
  const studiedCardIds = new Set(allCardStates.map(cs => cs.card_id))

  for (const cs of allCardStates) {
    if (cs.state === 'review' && cs.due <= now) dueCards++
    if (cs.state === 'learning' || cs.state === 'relearning') learningCards++
  }

  // Count new cards
  const allCards = await db.cards.toArray()
  const newCards = allCards.filter(c => !studiedCardIds.has(c.id)).length

  // Reviews today
  const reviewsToday = await db.reviewLogs
    .where('user_id')
    .equals(userId)
    .filter(log => log.reviewed_at >= todayStart)
    .count()

  return { dueCards, newCards, learningCards, reviewsToday }
}

async function getRecentDecksLocal(userId: string): Promise<RecentDeck[]> {
  const recentLogs = await db.reviewLogs
    .where('user_id')
    .equals(userId)
    .reverse()
    .limit(200)
    .toArray()

  recentLogs.sort((a, b) => b.reviewed_at.getTime() - a.reviewed_at.getTime())

  if (recentLogs.length === 0) return []

  const cardIds = Array.from(new Set(recentLogs.map(l => l.card_id)))
  const cards = await db.cards.where('id').anyOf(cardIds).toArray()
  const cardToDeck = new Map<string, string>()
  for (const c of cards) {
    cardToDeck.set(c.id, c.deck_id)
  }

  // Find top 5 unique decks
  const deckLastStudied = new Map<string, Date>()
  for (const log of recentLogs) {
    const deckId = cardToDeck.get(log.card_id)
    if (deckId && !deckLastStudied.has(deckId)) {
      deckLastStudied.set(deckId, log.reviewed_at)
    }
  }

  const topDeckIds = Array.from(deckLastStudied.entries())
    .sort((a, b) => b[1].getTime() - a[1].getTime())
    .slice(0, 5)
    .map(([id]) => id)

  if (topDeckIds.length === 0) return []

  const now = new Date()
  const decks = await db.decks.where('id').anyOf(topDeckIds).toArray()
  const deckNameMap = new Map(decks.map(d => [d.id, d.name]))

  const deckCards = await db.cards.where('deck_id').anyOf(topDeckIds).toArray()
  const allCardStates = await db.cardStates
    .where('user_id')
    .equals(userId)
    .toArray()
  const stateByCard = new Map(allCardStates.map(cs => [cs.card_id, cs]))

  // Aggregate per deck
  const deckStats = new Map<string, { due: number; learning: number; newCount: number }>()
  for (const id of topDeckIds) {
    deckStats.set(id, { due: 0, learning: 0, newCount: 0 })
  }

  for (const c of deckCards) {
    const stat = deckStats.get(c.deck_id)
    if (!stat) continue
    const cs = stateByCard.get(c.id)
    if (!cs) {
      stat.newCount++
    } else if (cs.state === 'review' && cs.due <= now) {
      stat.due++
    } else if (cs.state === 'learning' || cs.state === 'relearning') {
      stat.learning++
    }
  }

  return topDeckIds
    .filter(id => deckNameMap.has(id))
    .map(id => ({
      id,
      name: deckNameMap.get(id)!,
      lastStudiedAt: deckLastStudied.get(id)!,
      due_count: deckStats.get(id)?.due || 0,
      new_count: deckStats.get(id)?.newCount || 0,
      learning_count: deckStats.get(id)?.learning || 0,
    }))
}

async function getTeacherStatsLocal(userId: string): Promise<TeacherStats> {
  const decks = await db.decks.where('owner_id').equals(userId).toArray()
  const deckIds = decks.map(d => d.id)
  let cardCount = 0
  if (deckIds.length > 0) {
    cardCount = await db.cards.where('deck_id').anyOf(deckIds).count()
  }
  return { deckCount: decks.length, cardCount }
}

export default function DashboardPage() {
  const { profile, isLoading } = useAuth()

  if (isLoading) {
    return (
      <AppLayout>
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="h-8 bg-gray-200 rounded w-64 mb-2 animate-pulse" />
          <div className="h-5 bg-gray-200 rounded w-40 mb-6 animate-pulse" />
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="grid grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="p-4 bg-gray-100 rounded-lg animate-pulse h-20" />
              ))}
            </div>
          </div>
        </div>
      </AppLayout>
    )
  }

  if (!profile) return null

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            こんにちは、{profile.name}さん
          </h1>
          <p className="text-gray-600 mt-1">
            {profile.role === 'teacher' ? '講師ダッシュボード' : '今日も頑張りましょう！'}
          </p>
        </div>

        {profile.role === 'student' ? (
          <StudentDashboard userId={profile.id} />
        ) : (
          <TeacherDashboard userId={profile.id} />
        )}
      </div>
    </AppLayout>
  )
}

function StudentDashboard({ userId }: { userId: string }) {
  // liveQuery re-runs whenever cardStates / cards / reviewLogs / decks change in IndexedDB.
  // This is what makes the dashboard auto-refresh when the first sync after LINE login completes.
  const stats = useLiveQuery(() => getStudentStatsLocal(userId), [userId])
  const recentDecks = useLiveQuery(() => getRecentDecksLocal(userId), [userId]) ?? []

  return (
    <div className="space-y-6">
      {/* Today's Study Summary */}
      <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">今日の学習</h2>
        {stats ? (
          <>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="p-4 bg-blue-50 rounded-lg">
                <div className="text-3xl font-bold text-blue-600">{stats.dueCards}</div>
                <div className="text-sm text-gray-600 mt-1">復習カード</div>
              </div>
              <div className="p-4 bg-green-50 rounded-lg">
                <div className="text-3xl font-bold text-green-600">{stats.newCards}</div>
                <div className="text-sm text-gray-600 mt-1">新規カード</div>
              </div>
              <div className="p-4 bg-purple-50 rounded-lg">
                <div className="text-3xl font-bold text-purple-600">{stats.learningCards}</div>
                <div className="text-sm text-gray-600 mt-1">学習中</div>
              </div>
            </div>
            {stats.reviewsToday > 0 && (
              <p className="text-center text-sm text-gray-500 mt-4">
                今日は {stats.reviewsToday} 枚のカードを復習しました
              </p>
            )}
          </>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="p-4 bg-gray-100 rounded-lg animate-pulse h-20" />
            ))}
          </div>
        )}
      </section>

      {/* Recent Decks */}
      {recentDecks.length > 0 && (
        <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">最近のデッキ</h2>
          <div className="space-y-3">
            {recentDecks.map((deck) => {
              const hasDue = deck.due_count > 0 || deck.new_count > 0 || deck.learning_count > 0
              return (
                <div
                  key={deck.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900 truncate">{deck.name}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-gray-400">
                        {formatRelativeTime(deck.lastStudiedAt)}
                      </span>
                      <div className="flex items-center gap-2">
                        {deck.due_count > 0 && (
                          <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                            復習 {deck.due_count}
                          </span>
                        )}
                        {deck.new_count > 0 && (
                          <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded">
                            新規 {deck.new_count}
                          </span>
                        )}
                        {deck.learning_count > 0 && (
                          <span className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">
                            学習中 {deck.learning_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Link
                    href={`/study?deck=${deck.id}`}
                    className={`ml-3 flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full transition-colors ${
                      hasDue
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-gray-200 text-gray-400'
                    }`}
                    title={hasDue ? '学習開始' : '学習するカードがありません'}
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </Link>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Quick Actions */}
      <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">クイックアクション</h2>
        <div className="space-y-3">
          <Link
            href="/study"
            className="flex items-center justify-between w-full p-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <span className="font-medium">学習を始める</span>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
          <Link
            href="/decks"
            className="flex items-center justify-between w-full p-4 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <span className="font-medium">デッキ一覧を見る</span>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </section>
    </div>
  )
}

function TeacherDashboard({ userId }: { userId: string }) {
  const stats = useLiveQuery(() => getTeacherStatsLocal(userId), [userId])

  return (
    <div className="space-y-6">
      {/* Overview */}
      <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">概要</h2>
        {stats ? (
          <div className="grid grid-cols-2 gap-4 text-center">
            <div className="p-4 bg-purple-50 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">{stats.deckCount}</div>
              <div className="text-sm text-gray-600 mt-1">デッキ数</div>
            </div>
            <div className="p-4 bg-orange-50 rounded-lg">
              <div className="text-2xl font-bold text-orange-600">{stats.cardCount}</div>
              <div className="text-sm text-gray-600 mt-1">カード数</div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="p-4 bg-gray-100 rounded-lg animate-pulse h-20" />
            ))}
          </div>
        )}
      </section>

      {/* Quick Actions */}
      <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">クイックアクション</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link
            href="/decks/new"
            className="flex items-center justify-center gap-2 p-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="font-medium">新しいデッキを作成</span>
          </Link>
          <Link
            href="/students"
            className="flex items-center justify-center gap-2 p-4 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197" />
            </svg>
            <span className="font-medium">クラス・生徒管理</span>
          </Link>
        </div>
      </section>
    </div>
  )
}

function formatRelativeTime(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'たった今'
  if (diffMins < 60) return `${diffMins}分前`
  if (diffHours < 24) return `${diffHours}時間前`
  if (diffDays < 7) return `${diffDays}日前`

  return d.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })
}
