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

  // Get class count
  const { count: classCount } = await supabase
    .from('classes')
    .select('*', { count: 'exact', head: true })
    .eq('teacher_id', teacherId)

  // Get student count (unique students in teacher's classes)
  const { data: classMembers } = await supabase
    .from('class_members')
    .select('user_id, classes!inner(teacher_id)')
    .eq('classes.teacher_id', teacherId)

  const uniqueStudentIds = new Set(classMembers?.map(m => m.user_id) || [])
  const studentCount = uniqueStudentIds.size

  // Get deck count
  const { count: deckCount } = await supabase
    .from('decks')
    .select('*', { count: 'exact', head: true })
    .eq('owner_id', teacherId)

  // Get total card count
  const { data: decks } = await supabase
    .from('decks')
    .select('id')
    .eq('owner_id', teacherId)

  const deckIds = decks?.map(d => d.id) || []

  let cardCount = 0
  if (deckIds.length > 0) {
    const { count } = await supabase
      .from('cards')
      .select('*', { count: 'exact', head: true })
      .in('deck_id', deckIds)
    cardCount = count || 0
  }

  // Get students with progress
  const studentsWithProgress: StudentProgress[] = []

  if (uniqueStudentIds.size > 0) {
    const today = new Date()
    today.setHours(4, 0, 0, 0)
    if (new Date().getHours() < 4) {
      today.setDate(today.getDate() - 1)
    }

    for (const studentId of Array.from(uniqueStudentIds)) {
      const { data: studentProfile } = await supabase
        .from('profiles')
        .select('id, name, email')
        .eq('id', studentId)
        .single()

      if (studentProfile) {
        const { count: reviewsToday } = await supabase
          .from('review_logs')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', studentId)
          .gte('reviewed_at', today.toISOString())

        const { count: totalReviews } = await supabase
          .from('review_logs')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', studentId)

        const { count: dueCards } = await supabase
          .from('card_states')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', studentId)
          .lte('due', new Date().toISOString())

        const { data: lastReview } = await supabase
          .from('review_logs')
          .select('reviewed_at')
          .eq('user_id', studentId)
          .order('reviewed_at', { ascending: false })
          .limit(1)
          .single()

        studentsWithProgress.push({
          id: studentProfile.id,
          name: studentProfile.name,
          email: studentProfile.email,
          reviewsToday: reviewsToday || 0,
          totalReviews: totalReviews || 0,
          dueCards: dueCards || 0,
          lastActivity: lastReview?.reviewed_at || null,
        })
      }
    }

    studentsWithProgress.sort((a, b) => b.reviewsToday - a.reviewsToday)
  }

  return {
    stats: {
      studentCount,
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

  // Get due cards (review state)
  const { count: dueCards } = await supabase
    .from('card_states')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', studentId)
    .eq('state', 'review')
    .lte('due', new Date().toISOString())

  // Get reviews done today
  const { count: reviewsToday } = await supabase
    .from('review_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', studentId)
    .gte('reviewed_at', today.toISOString())

  // Get learning cards
  const { count: learningCards } = await supabase
    .from('card_states')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', studentId)
    .in('state', ['learning', 'relearning'])

  // Get new cards count (cards in accessible decks without card_state)
  // For simplicity, count cards in own decks without state
  const { data: ownDecks } = await supabase
    .from('decks')
    .select('id')
    .eq('owner_id', studentId)

  const deckIds = ownDecks?.map(d => d.id) || []

  let newCards = 0
  if (deckIds.length > 0) {
    const { data: allCards } = await supabase
      .from('cards')
      .select('id')
      .in('deck_id', deckIds)

    const allCardIds = allCards?.map(c => c.id) || []

    if (allCardIds.length > 0) {
      const { data: cardStates } = await supabase
        .from('card_states')
        .select('card_id')
        .eq('user_id', studentId)
        .in('card_id', allCardIds)

      const studiedCardIds = new Set(cardStates?.map(cs => cs.card_id) || [])
      newCards = allCardIds.filter(id => !studiedCardIds.has(id)).length
    }
  }

  return {
    dueCards: dueCards || 0,
    newCards,
    learningCards: learningCards || 0,
    reviewsToday: reviewsToday || 0,
    streak: 0, // Simplified for now
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
