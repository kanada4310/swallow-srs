'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useAuth } from '@/contexts/AuthContext'
import { AppLayout } from '@/components/layout/AppLayout'
import { SwallowMark } from '@/components/ui/SwallowMark'
import { StudyDeckPicker } from '@/components/home/StudyDeckPicker'
import { SpartaCard } from '@/components/home/SpartaCard'
import { useStreak } from '@/lib/stats/useStreak'
import { resolveDeckSettings } from '@/lib/srs/scheduler'
import { db } from '@/lib/db/schema'

/** 今日のミッション＝いま期限が来ている復習＋今日の新規枠（ルートデッキ毎の上限を反映） */
interface TodayMission {
  reviewDue: number
  newToday: number
  total: number
  reviewsToday: number
  /** 残数が最も多いルートデッキ（開始ボタンの遷移先） */
  primaryDeckId: string | null
  /** 今日やるカードがあるルートデッキの内訳（残数が多い順） */
  perDeck: MissionDeck[]
}

export interface MissionDeck {
  deckId: string
  deckName: string
  due: number
  newToday: number
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

async function getTodayMissionLocal(userId: string): Promise<TodayMission> {
  const now = new Date()
  const todayStart = new Date()
  todayStart.setHours(4, 0, 0, 0)
  if (now.getHours() < 4) {
    todayStart.setDate(todayStart.getDate() - 1)
  }

  const [allDecks, allCards, allCardStates, todayLogs, userSettings] = await Promise.all([
    db.decks.toArray(),
    db.cards.toArray(),
    db.cardStates.where('user_id').equals(userId).toArray(),
    db.reviewLogs
      .where('user_id')
      .equals(userId)
      .filter(log => log.reviewed_at >= todayStart)
      .toArray(),
    db.userDeckSettings.toArray().catch(() => []),
  ])

  // カード→ルートデッキの対応表
  const deckMap = new Map(allDecks.map(d => [d.id, d]))
  const rootOf = (deckId: string): string => {
    let id = deckId
    for (let depth = 0; depth < 10; depth++) {
      const d = deckMap.get(id)
      if (!d?.parent_deck_id) return id
      id = d.parent_deck_id
    }
    return id
  }
  const cardRoot = new Map<string, string>()
  for (const c of allCards) cardRoot.set(c.id, rootOf(c.deck_id))

  const stateByCard = new Map(allCardStates.map(cs => [cs.card_id, cs]))
  const userSettingByRoot = new Map(
    userSettings.filter(s => s.user_id === userId).map(s => [s.deck_id, s.settings])
  )

  // ルートデッキ毎に集計: 期限が来ている復習/学習中 ＋ 今日の新規枠
  const perRoot = new Map<string, { due: number; newAvailable: number; newIntroduced: number }>()
  const ensure = (rootId: string) => {
    let v = perRoot.get(rootId)
    if (!v) {
      v = { due: 0, newAvailable: 0, newIntroduced: 0 }
      perRoot.set(rootId, v)
    }
    return v
  }

  for (const c of allCards) {
    const rootId = cardRoot.get(c.id)!
    const cs = stateByCard.get(c.id)
    if (!cs) {
      ensure(rootId).newAvailable++
    } else if (cs.state === 'suspended') {
      continue
    } else if (cs.state === 'new') {
      ensure(rootId).newAvailable++
    } else if (cs.due <= now) {
      ensure(rootId).due++
    }
  }
  for (const log of todayLogs) {
    if (log.last_interval === 0) {
      const rootId = cardRoot.get(log.card_id)
      if (rootId) ensure(rootId).newIntroduced++
    }
  }

  let reviewDue = 0
  let newToday = 0
  const perDeck: MissionDeck[] = []
  for (const [rootId, v] of Array.from(perRoot.entries())) {
    const settings = resolveDeckSettings({
      ...(deckMap.get(rootId)?.settings || {}),
      ...(userSettingByRoot.get(rootId) || {}),
    })
    const rootNewToday = Math.min(
      Math.max(0, settings.new_cards_per_day - v.newIntroduced),
      v.newAvailable
    )
    reviewDue += v.due
    newToday += rootNewToday
    if (v.due + rootNewToday > 0) {
      perDeck.push({
        deckId: rootId,
        deckName: deckMap.get(rootId)?.name || 'デッキ',
        due: v.due,
        newToday: rootNewToday,
      })
    }
  }
  perDeck.sort((a, b) => (b.due + b.newToday) - (a.due + a.newToday))

  // 今日レビューした枚数（distinct card）
  const reviewsToday = new Set(todayLogs.map(l => l.card_id)).size

  return {
    reviewDue,
    newToday,
    total: reviewDue + newToday,
    reviewsToday,
    primaryDeckId: perDeck[0]?.deckId ?? null,
    perDeck,
  }
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
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-ai">
              こんにちは、{profile.name}さん
            </h1>
            <p className="text-gray-500 mt-1">
              {profile.role === 'teacher' ? '講師ダッシュボード' : '今日も頑張りましょう！'}
            </p>
          </div>
          {profile.role === 'student' && <StreakChip userId={profile.id} />}
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

function StreakChip({ userId }: { userId: string }) {
  const { current, loading } = useStreak(userId)
  if (loading || current === 0) return null
  return (
    <span className="flex-shrink-0 flex items-center gap-1.5 bg-nodo-soft text-[#C2410C] font-extrabold text-sm rounded-full px-3.5 py-2">
      <svg width="13" height="15" viewBox="0 0 14 16" aria-hidden>
        <path
          d="M7 0C8 3 12 5 12 9.5A5 5 0 0 1 2 9.5C2 7 3.5 5.5 4.5 4 5 6 6.5 6.5 7 8 8.5 6 7 2 7 0Z"
          fill="#FF7849"
        />
      </svg>
      {current}日連続
    </span>
  )
}

function StudentDashboard({ userId }: { userId: string }) {
  // liveQuery re-runs whenever cardStates / cards / reviewLogs / decks change in IndexedDB.
  // This is what makes the dashboard auto-refresh when the first sync after LINE login completes.
  const mission = useLiveQuery(() => getTodayMissionLocal(userId), [userId])
  const recentDecks = useLiveQuery(() => getRecentDecksLocal(userId), [userId]) ?? []
  const [showDeckPicker, setShowDeckPicker] = useState(false)

  return (
    <div className="space-y-6">
      {/* 今日のミッション */}
      <section className="relative overflow-hidden rounded-card bg-gradient-to-br from-ai to-ai-soft p-6 text-white shadow-card">
        <SwallowMark className="pointer-events-none absolute -right-2 top-3 w-32 opacity-15" fill="#fff" />
        {mission ? (
          mission.total > 0 ? (
            <>
              <div className="text-[11px] font-bold tracking-widest text-[#AEC4F5]">
                今日のミッション
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-5xl font-extrabold tabular-nums leading-none">
                  {mission.total}
                </span>
                <span className="text-sm text-[#C9D6F3]">枚 / 約{estimateMinutes(mission.total)}分</span>
              </div>
              <div className="mt-1 text-[13px] text-[#AEC4F5]">
                新規 <b className="text-white">{mission.newToday}</b> ・ 復習{' '}
                <b className="text-white">{mission.reviewDue}</b>
                {mission.reviewsToday > 0 && <>（今日すでに {mission.reviewsToday} 枚学習）</>}
              </div>
              {/* 出題元デッキの内訳（どのデッキから出るかを明示） */}
              <div className="mt-2 mb-4 space-y-0.5">
                {mission.perDeck.slice(0, 3).map((d) => (
                  <div key={d.deckId} className="flex items-baseline gap-2 text-[13px]">
                    <span className="truncate font-bold text-white">{d.deckName}</span>
                    <span className="flex-shrink-0 tabular-nums text-[#AEC4F5]">
                      {d.due + d.newToday}枚
                    </span>
                  </div>
                ))}
                {mission.perDeck.length > 3 && (
                  <div className="text-[12px] text-[#AEC4F5]">他 {mission.perDeck.length - 3} 個のデッキ</div>
                )}
              </div>
              {mission.perDeck.length > 1 ? (
                <button
                  onClick={() => setShowDeckPicker(true)}
                  className="block w-full rounded-2xl bg-nodo py-3.5 text-center text-base font-extrabold text-white shadow-[0_4px_14px_rgba(255,120,73,.35)] transition-colors hover:bg-nodo-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  学習をはじめる（デッキを選ぶ）
                </button>
              ) : (
                <Link
                  href={mission.primaryDeckId ? `/study?deck=${mission.primaryDeckId}` : '/decks'}
                  className="block w-full rounded-2xl bg-nodo py-3.5 text-center text-base font-extrabold text-white shadow-[0_4px_14px_rgba(255,120,73,.35)] transition-colors hover:bg-nodo-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  学習をはじめる
                </Link>
              )}
              {showDeckPicker && (
                <StudyDeckPicker decks={mission.perDeck} onClose={() => setShowDeckPicker(false)} />
              )}
            </>
          ) : (
            <>
              <div className="text-[11px] font-bold tracking-widest text-[#AEC4F5]">
                今日のミッション
              </div>
              <div className="mt-1 text-2xl font-extrabold">
                {mission.reviewsToday > 0 ? '今日のノルマ完了！' : '今日やるカードはありません'}
              </div>
              <p className="mt-1 text-[13px] text-[#C9D6F3]">
                {mission.reviewsToday > 0
                  ? `${mission.reviewsToday}枚やりきりました。おつかれさま。`
                  : 'デッキが配布されるとここに今日の枚数が出ます。'}
              </p>
            </>
          )
        ) : (
          <div className="h-28 animate-pulse rounded-xl bg-white/10" />
        )}
      </section>

      {/* スパルタ（登録があるときだけ表示） */}
      <SpartaCard />

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

      {/* 読解への導線 */}
      <Link
        href="/reading"
        className="flex items-center justify-between w-full p-4 bg-white border border-gray-200 text-gray-700 rounded-2xl hover:bg-gray-50 transition-colors"
      >
        <span>
          <span className="block font-bold">読解（英語長文）</span>
          <span className="block text-xs text-ink-3 mt-0.5">意味のまとまりで区切って読む練習</span>
        </span>
        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </Link>

      {/* デッキ一覧への導線 */}
      <Link
        href="/decks"
        className="flex items-center justify-between w-full p-4 bg-white border border-gray-200 text-gray-700 rounded-2xl hover:bg-gray-50 transition-colors"
      >
        <span className="font-bold">デッキ一覧を見る</span>
        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </Link>
    </div>
  )
}

/** 1枚≒25秒 として見積もり（切り上げ・最低1分） */
function estimateMinutes(cards: number): number {
  return Math.max(1, Math.ceil((cards * 25) / 60))
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
