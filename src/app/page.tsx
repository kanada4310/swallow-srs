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
  const stats = await getStudentStats(userId)

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
