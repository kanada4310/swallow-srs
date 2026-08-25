'use client'

import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { AppLayout } from '@/components/layout/AppLayout'
import Link from 'next/link'

interface StudentOverview {
  id: string
  name: string
  email: string
  reviewsToday: number
  totalReviews: number
  dueCards: number
  lastActivity: string | null
  overallAccuracy: number
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return '--'
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMin / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMin < 1) return 'たった今'
  if (diffMin < 60) return `${diffMin}分前`
  if (diffHours < 24) return `${diffHours}時間前`
  if (diffDays < 7) return `${diffDays}日前`
  return date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })
}

export default function StudentProgressPage() {
  const { profile, isLoading: authLoading } = useAuth()
  const [students, setStudents] = useState<StudentOverview[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    if (!profile || profile.role === 'student') return

    const fetchStudents = async () => {
      try {
        const res = await fetch('/api/teacher/student-progress')
        if (!res.ok) throw new Error('Failed to fetch')
        const data = await res.json()
        setStudents(data.students)
      } catch {
        setError('生徒データの取得に失敗しました')
        setStudents([])
      }
    }

    fetchStudents()
  }, [profile])

  const filteredStudents = useMemo(() => {
    if (!students) return null
    if (!searchQuery) return students
    const q = searchQuery.toLowerCase()
    return students.filter(s =>
      s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q)
    )
  }, [students, searchQuery])

  if (authLoading || students === null) {
    return (
      <AppLayout>
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="h-8 bg-gray-200 rounded w-48 animate-pulse mb-6" />
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-200 p-4 h-20 animate-pulse" />
            ))}
          </div>
        </div>
      </AppLayout>
    )
  }

  if (!profile || profile.role === 'student') return null

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-extrabold text-ai">生徒取組状況</h1>
          <div className="flex items-center gap-4">
            <Link
              href="/students/reading"
              className="text-sm text-sora hover:text-sora-dark font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
            >
              読解の取組状況
            </Link>
            <Link
              href="/students/sparta"
              className="text-sm text-sora hover:text-sora-dark font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
            >
              スパルタの管理
            </Link>
            <Link
              href="/students/review-pause"
              className="text-sm text-sora hover:text-sora-dark font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
            >
              復習通知の管理
            </Link>
            <Link
              href="/students/syntax-ai"
              className="text-sm text-sora hover:text-sora-dark font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
            >
              構文AIの管理
            </Link>
            <Link
              href="/students"
              className="text-sm text-sora hover:text-sora-dark font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
            >
              クラス管理
            </Link>
          </div>
        </div>

        {error && (
          <div className="bg-again-bg text-again p-3 rounded-2xl mb-4 text-sm">{error}</div>
        )}

        {/* Search */}
        <div className="relative mb-4">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="生徒名で検索..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-sora focus:ring-2 focus:ring-sora"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Summary header */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-3 text-center">
            <div className="text-2xl font-extrabold text-ai tabular-nums">{students.length}</div>
            <div className="text-xs text-ink-3">直近7日</div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-3 text-center">
            <div className="text-2xl font-extrabold text-good tabular-nums">
              {students.filter(s => s.reviewsToday > 0).length}
            </div>
            <div className="text-xs text-ink-3">今日学習済み</div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-3 text-center">
            <div className="text-2xl font-extrabold text-hard tabular-nums">
              {students.filter(s => s.dueCards > 0).length}
            </div>
            <div className="text-xs text-ink-3">未復習あり</div>
          </div>
        </div>

        {/* Student list */}
        <div className="space-y-2">
          {filteredStudents && filteredStudents.length === 0 && (
            <div className="text-center text-ink-2 py-8">
              {searchQuery ? '該当する生徒がいません' : '直近7日間に学習した生徒がいません'}
            </div>
          )}

          {filteredStudents?.map(student => (
            <Link
              key={student.id}
              href={`/students/progress/${student.id}`}
              className="block bg-white rounded-2xl border border-gray-200 p-4 hover:border-sora transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-ai truncate">{student.name}</div>
                  <div className="text-xs text-ink-3 mt-0.5">
                    最終学習: {formatRelativeTime(student.lastActivity)}
                  </div>
                </div>
                <div className="flex items-center gap-4 ml-4 text-sm tabular-nums">
                  <div className="text-center">
                    <div className={`font-bold ${student.reviewsToday > 0 ? 'text-good' : 'text-ink-3'}`}>
                      {student.reviewsToday}
                    </div>
                    <div className="text-xs text-ink-3">今日</div>
                  </div>
                  <div className="text-center">
                    <div className={`font-bold ${student.dueCards > 0 ? 'text-hard' : 'text-ink-3'}`}>
                      {student.dueCards}
                    </div>
                    <div className="text-xs text-ink-3">期限切れ</div>
                  </div>
                  <div className="text-center">
                    <div className={`font-bold ${student.overallAccuracy >= 80 ? 'text-good' : student.overallAccuracy >= 60 ? 'text-hard' : 'text-again'}`}>
                      {student.overallAccuracy}%
                    </div>
                    <div className="text-xs text-ink-3">正答率</div>
                  </div>
                  <svg className="w-4 h-4 text-ink-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </AppLayout>
  )
}
