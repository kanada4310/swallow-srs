import { createClient } from '@/lib/supabase/server'
import { AppLayout } from '@/components/layout/AppLayout'
import Link from 'next/link'

// Profile type
interface Profile {
  id: string
  name: string
  role: 'student' | 'teacher' | 'admin'
}

interface TeacherStats {
  studentCount: number
  classCount: number
  deckCount: number
  cardCount: number
}

interface StudentProgress {
  id: string
  name: string
  email: string
  reviewsToday: number
  totalReviews: number
  dueCards: number
  lastActivity: string | null
}

interface StudentStats {
  dueCards: number
  newCards: number
  learningCards: number
  reviewsToday: number
  streak: number
}

interface RecentDeck {
  id: string
  name: string
  lastStudiedAt: string
  due_count: number
  new_count: number
  learning_count: number
}

async function getTeacherStats(teacherId: string): Promise<{ stats: TeacherStats; students: StudentProgress[] }> {
  const supabase = await createClient()

  // Parallel batch 1: Get classes, class members, decks
  const [
    { count: classCount },
    { data: classMembers },
    { count: deckCount },
    { data: decks },
  ] = await Promise.all([
    supabase
      .from('classes')
      .select('*', { count: 'exact', head: true })
      .eq('teacher_id', teacherId),
    supabase
      .from('class_members')
      .select('user_id, classes!inner(teacher_id)')
      .eq('classes.teacher_id', teacherId),
    supabase
      .from('decks')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', teacherId),
    supabase
      .from('decks')
      .select('id')
      .eq('owner_id', teacherId),
  ])

  const uniqueStudentIds = Array.from(new Set(classMembers?.map(m => m.user_id) || []))
  const deckIds = decks?.map(d => d.id) || []

  // Parallel batch 2: Card count + student data (all batched)
  const today = new Date()
  today.setHours(4, 0, 0, 0)
  if (new Date().getHours() < 4) {
    today.setDate(today.getDate() - 1)
  }

  const cardCountPromise = deckIds.length > 0
    ? supabase.from('cards').select('*', { count: 'exact', head: true }).in('deck_id', deckIds)
    : Promise.resolve({ count: 0 })

  const studentProfilesPromise = uniqueStudentIds.length > 0
    ? supabase.from('profiles').select('id, name, email').in('id', uniqueStudentIds)
    : Promise.resolve({ data: [] })

  const reviewLogsTodayPromise = uniqueStudentIds.length > 0
    ? supabase
        .from('review_logs')
        .select('user_id')
        .in('user_id', uniqueStudentIds)
        .gte('reviewed_at', today.toISOString())
    : Promise.resolve({ data: [] })

  const totalReviewsPromise = uniqueStudentIds.length > 0
    ? supabase
        .from('review_logs')
        .select('user_id')
        .in('user_id', uniqueStudentIds)
    : Promise.resolve({ data: [] })

  const dueCardsPromise = uniqueStudentIds.length > 0
    ? supabase
        .from('card_states')
        .select('user_id')
        .in('user_id', uniqueStudentIds)
        .lte('due', new Date().toISOString())
    : Promise.resolve({ data: [] })

  const lastReviewsPromise = uniqueStudentIds.length > 0
    ? supabase
        .from('review_logs')
        .select('user_id, reviewed_at')
        .in('user_id', uniqueStudentIds)
        .order('reviewed_at', { ascending: false })
    : Promise.resolve({ data: [] })

  const [
    cardCountResult,
    { data: studentProfiles },
    { data: reviewLogsToday },
    { data: totalReviewLogs },
    { data: dueCardStates },
    { data: lastReviewLogs },
  ] = await Promise.all([
    cardCountPromise,
    studentProfilesPromise,
    reviewLogsTodayPromise,
    totalReviewsPromise,
    dueCardsPromise,
    lastReviewsPromise,
  ])

  const cardCount = ('count' in cardCountResult ? cardCountResult.count : 0) || 0

  // Aggregate student stats from batch results
  const reviewsTodayByUser = new Map<string, number>()
  for (const log of reviewLogsToday || []) {
    reviewsTodayByUser.set(log.user_id, (reviewsTodayByUser.get(log.user_id) || 0) + 1)
  }

  const totalReviewsByUser = new Map<string, number>()
  for (const log of totalReviewLogs || []) {
    totalReviewsByUser.set(log.user_id, (totalReviewsByUser.get(log.user_id) || 0) + 1)
  }

  const dueCardsByUser = new Map<string, number>()
  for (const cs of dueCardStates || []) {
    dueCardsByUser.set(cs.user_id, (dueCardsByUser.get(cs.user_id) || 0) + 1)
  }

  const lastActivityByUser = new Map<string, string>()
  for (const log of lastReviewLogs || []) {
    if (!lastActivityByUser.has(log.user_id)) {
      lastActivityByUser.set(log.user_id, log.reviewed_at)
    }
  }

  const studentsWithProgress: StudentProgress[] = (studentProfiles || []).map(profile => ({
    id: profile.id,
    name: profile.name,
    email: profile.email,
    reviewsToday: reviewsTodayByUser.get(profile.id) || 0,
    totalReviews: totalReviewsByUser.get(profile.id) || 0,
    dueCards: dueCardsByUser.get(profile.id) || 0,
    lastActivity: lastActivityByUser.get(profile.id) || null,
  }))

  studentsWithProgress.sort((a, b) => b.reviewsToday - a.reviewsToday)

  return {
    stats: {
      studentCount: uniqueStudentIds.length,
      classCount: classCount || 0,
      deckCount: deckCount || 0,
      cardCount,
    },
    students: studentsWithProgress.slice(0, 5),
  }
}

async function getStudentStats(studentId: string): Promise<StudentStats> {
  const supabase = await createClient()

  const today = new Date()
  today.setHours(4, 0, 0, 0)
  if (new Date().getHours() < 4) {
    today.setDate(today.getDate() - 1)
  }

  // Parallel batch: all stats queries at once
  const [
    { count: dueCards },
    { count: reviewsToday },
    { count: learningCards },
    { data: ownDecks },
    { data: allCardStates },
  ] = await Promise.all([
    supabase
      .from('card_states')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', studentId)
      .eq('state', 'review')
      .lte('due', new Date().toISOString()),
    supabase
      .from('review_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', studentId)
      .gte('reviewed_at', today.toISOString()),
    supabase
      .from('card_states')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', studentId)
      .in('state', ['learning', 'relearning']),
    supabase
      .from('decks')
      .select('id')
      .eq('owner_id', studentId),
    supabase
      .from('card_states')
      .select('card_id')
      .eq('user_id', studentId),
  ])

  const deckIds = ownDecks?.map(d => d.id) || []
  const studiedCardIds = new Set(allCardStates?.map(cs => cs.card_id) || [])

  let newCards = 0
  if (deckIds.length > 0) {
    const { data: allCards } = await supabase
      .from('cards')
      .select('id')
      .in('deck_id', deckIds)

    newCards = (allCards || []).filter(c => !studiedCardIds.has(c.id)).length
  }

  return {
    dueCards: dueCards || 0,
    newCards,
    learningCards: learningCards || 0,
    reviewsToday: reviewsToday || 0,
    streak: 0,
  }
}

async function getRecentDecks(userId: string): Promise<RecentDeck[]> {
  const supabase = await createClient()

  // Batch 1: Get recent review logs (last 200)
  const { data: recentLogs } = await supabase
    .from('review_logs')
    .select('card_id, reviewed_at')
    .eq('user_id', userId)
    .order('reviewed_at', { ascending: false })
    .limit(200)

  if (!recentLogs || recentLogs.length === 0) return []

  // Batch 2: Map card_ids to deck_ids
  const cardIds = Array.from(new Set(recentLogs.map(l => l.card_id)))
  const { data: cards } = await supabase
    .from('cards')
    .select('id, deck_id')
    .in('id', cardIds)

  if (!cards || cards.length === 0) return []

  const cardToDeck = new Map<string, string>()
  for (const c of cards) {
    cardToDeck.set(c.id, c.deck_id)
  }

  // Find top 5 unique decks by most recent review
  const deckLastStudied = new Map<string, string>()
  for (const log of recentLogs) {
    const deckId = cardToDeck.get(log.card_id)
    if (deckId && !deckLastStudied.has(deckId)) {
      deckLastStudied.set(deckId, log.reviewed_at)
    }
  }

  const topDeckIds = Array.from(deckLastStudied.entries())
    .sort((a, b) => new Date(b[1]).getTime() - new Date(a[1]).getTime())
    .slice(0, 5)
    .map(([id]) => id)

  if (topDeckIds.length === 0) return []

  const now = new Date().toISOString()

  // Batch 3 (parallel): deck names + card_states for due/learning counts + cards for new count
  const [
    { data: decks },
    { data: cardStates },
    { data: deckCards },
  ] = await Promise.all([
    supabase
      .from('decks')
      .select('id, name')
      .in('id', topDeckIds),
    supabase
      .from('card_states')
      .select('card_id, state, due')
      .eq('user_id', userId)
      .in('card_id', cards.filter(c => topDeckIds.includes(c.deck_id)).map(c => c.id)),
    supabase
      .from('cards')
      .select('id, deck_id')
      .in('deck_id', topDeckIds),
  ])

  const deckNameMap = new Map<string, string>()
  for (const d of decks || []) {
    deckNameMap.set(d.id, d.name)
  }

  // Build card_id -> deck_id for all cards in target decks
  const allCardToDeck = new Map<string, string>()
  for (const c of deckCards || []) {
    allCardToDeck.set(c.id, c.deck_id)
  }

  // Cards with card_states (studied)
  const studiedCardIds = new Set((cardStates || []).map(cs => cs.card_id))

  // Aggregate per deck
  const deckStats = new Map<string, { due: number; learning: number; newCount: number }>()
  for (const id of topDeckIds) {
    deckStats.set(id, { due: 0, learning: 0, newCount: 0 })
  }

  // Count due and learning from card_states
  for (const cs of cardStates || []) {
    const deckId = allCardToDeck.get(cs.card_id)
    if (!deckId) continue
    const stat = deckStats.get(deckId)
    if (!stat) continue
    if (cs.state === 'review' && cs.due <= now) {
      stat.due++
    } else if (cs.state === 'learning' || cs.state === 'relearning') {
      stat.learning++
    }
  }

  // Count new cards (cards without card_states)
  for (const c of deckCards || []) {
    if (!studiedCardIds.has(c.id)) {
      const stat = deckStats.get(c.deck_id)
      if (stat) stat.newCount++
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

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, name, role')
    .eq('id', user?.id)
    .single() as { data: Profile | null }

  if (!profile) {
    return null
  }

  return (
    <AppLayout userName={profile.name} userRole={profile.role}>
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Greeting */}
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

async function StudentDashboard({ userId }: { userId: string }) {
  const [stats, recentDecks] = await Promise.all([
    getStudentStats(userId),
    getRecentDecks(userId),
  ])

  return (
    <div className="space-y-6">
      {/* Today's Study Summary */}
      <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">今日の学習</h2>
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

async function TeacherDashboard({ userId }: { userId: string }) {
  const { stats, students } = await getTeacherStats(userId)

  return (
    <div className="space-y-6">
      {/* Overview */}
      <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">概要</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div className="p-4 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">{stats.studentCount}</div>
            <div className="text-sm text-gray-600 mt-1">生徒数</div>
          </div>
          <div className="p-4 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">{stats.classCount}</div>
            <div className="text-sm text-gray-600 mt-1">クラス数</div>
          </div>
          <div className="p-4 bg-purple-50 rounded-lg">
            <div className="text-2xl font-bold text-purple-600">{stats.deckCount}</div>
            <div className="text-sm text-gray-600 mt-1">デッキ数</div>
          </div>
          <div className="p-4 bg-orange-50 rounded-lg">
            <div className="text-2xl font-bold text-orange-600">{stats.cardCount}</div>
            <div className="text-sm text-gray-600 mt-1">カード数</div>
          </div>
        </div>
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

      {/* Student Activity */}
      <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">生徒の学習状況</h2>
          {students.length > 0 && (
            <Link href="/students" className="text-sm text-blue-600 hover:text-blue-700">
              すべて見る
            </Link>
          )}
        </div>

        {students.length === 0 ? (
          <div className="text-gray-500 text-center py-8">
            <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
            </svg>
            <p>まだ生徒がいません</p>
            <Link href="/students" className="text-sm text-blue-600 hover:text-blue-700 mt-1 inline-block">
              クラスを作成して生徒を追加
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {students.map((student) => (
              <div
                key={student.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div>
                  <p className="font-medium text-gray-900">{student.name}</p>
                  <p className="text-sm text-gray-500">
                    今日 {student.reviewsToday} 枚 / 累計 {student.totalReviews} 枚
                  </p>
                </div>
                <div className="text-right">
                  {student.dueCards > 0 ? (
                    <span className="text-sm text-orange-600">
                      {student.dueCards} 枚の復習待ち
                    </span>
                  ) : (
                    <span className="text-sm text-green-600">
                      完了
                    </span>
                  )}
                  {student.lastActivity && (
                    <p className="text-xs text-gray-400 mt-1">
                      最終: {formatRelativeTime(student.lastActivity)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'たった今'
  if (diffMins < 60) return `${diffMins}分前`
  if (diffHours < 24) return `${diffHours}時間前`
  if (diffDays < 7) return `${diffDays}日前`

  return date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })
}
