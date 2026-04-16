'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { AppLayout } from '@/components/layout/AppLayout'
import {
  StatsOverview,
  DailyReviewChart,
  CardDistributionChart,
  AccuracyTrendChart,
  DeckProgressList,
  StatsSkeleton,
} from '@/components/stats'
import Link from 'next/link'
import type { DetailedStats } from '@/types/database'

interface StudentInfo {
  id: string
  name: string
  email: string
}

type StatsData = {
  streak: number
  reviewsToday: number
  dueCards: number
  newCards: number
  learningCards: number
} & Partial<DetailedStats>

interface NoteProgress {
  noteId: string
  displayText: string
  tags: string[]
  status: string
  interval: number
  lastReview: string | null
  totalReviews: number
  accuracy: number | null
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  new: { label: '新規', color: 'bg-blue-100 text-blue-700' },
  learning: { label: '学習中', color: 'bg-amber-100 text-amber-700' },
  relearning: { label: '再学習', color: 'bg-orange-100 text-orange-700' },
  review: { label: '復習', color: 'bg-emerald-100 text-emerald-700' },
  mastered: { label: '習得', color: 'bg-green-100 text-green-700' },
  suspended: { label: '停止', color: 'bg-gray-100 text-gray-500' },
}

function formatRelativeDate(dateStr: string | null): string {
  if (!dateStr) return '--'
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffDays === 0) return '今日'
  if (diffDays === 1) return '昨日'
  if (diffDays < 7) return `${diffDays}日前`
  return date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })
}

export default function StudentProgressDetailPage({ params }: { params: { userId: string } }) {
  const { profile, isLoading: authLoading } = useAuth()
  const [student, setStudent] = useState<StudentInfo | null>(null)
  const [stats, setStats] = useState<StatsData | null>(null)
  const [period, setPeriod] = useState(7)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Note progress drill-down
  const [selectedDeck, setSelectedDeck] = useState<{ id: string; name: string } | null>(null)
  const [noteProgress, setNoteProgress] = useState<NoteProgress[] | null>(null)
  const [noteLoading, setNoteLoading] = useState(false)

  // Handle dynamic route params - fallback to window.location
  const userId = params?.userId || (typeof window !== 'undefined' ? window.location.pathname.split('/').pop() : '') || ''

  const fetchData = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/teacher/student-progress?userId=${userId}&period=${period}`)
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to fetch')
      }
      const data = await res.json()
      setStudent(data.student)
      setStats(data.stats)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [userId, period])

  useEffect(() => {
    if (!profile || profile.role === 'student') return
    fetchData()
  }, [profile, fetchData])

  const handleDeckClick = useCallback(async (deckId: string, deckName: string) => {
    if (selectedDeck?.id === deckId) {
      setSelectedDeck(null)
      setNoteProgress(null)
      return
    }
    setSelectedDeck({ id: deckId, name: deckName })
    setNoteLoading(true)
    try {
      const res = await fetch(`/api/teacher/student-progress?userId=${userId}&deckId=${deckId}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setNoteProgress(data.notes)
    } catch {
      setNoteProgress([])
    } finally {
      setNoteLoading(false)
    }
  }, [userId, selectedDeck])

  if (authLoading || (loading && !stats)) {
    return (
      <AppLayout>
        <div className="max-w-4xl mx-auto px-4 py-6">
          <StatsSkeleton />
        </div>
      </AppLayout>
    )
  }

  if (!profile || profile.role === 'student') return null

  if (error) {
    return (
      <AppLayout>
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="bg-red-50 text-red-700 p-4 rounded-lg">{error}</div>
          <Link href="/students/progress" className="text-blue-600 hover:text-blue-800 mt-4 inline-block">
            &larr; 一覧に戻る
          </Link>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <Link
            href="/students/progress"
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{student?.name}</h1>
            <p className="text-sm text-gray-500">{student?.email}</p>
          </div>
        </div>

        {/* Period selector */}
        <div className="flex gap-2 mb-6">
          {[7, 14, 30].map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                period === p
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {p}日
            </button>
          ))}
        </div>

        {stats && (
          <div className="space-y-6">
            <StatsOverview
              streak={stats.streak}
              totalReviews={stats.totalReviews || 0}
              overallAccuracy={stats.overallAccuracy || 0}
              reviewsToday={stats.reviewsToday}
            />

            {stats.dailyReviews && (
              <DailyReviewChart data={stats.dailyReviews} />
            )}

            {stats.cardDistribution && (
              <CardDistributionChart data={stats.cardDistribution} />
            )}

            {stats.accuracyTrend && (
              <AccuracyTrendChart data={stats.accuracyTrend} />
            )}

            {stats.deckProgress && stats.deckProgress.length > 0 && (
              <>
                <DeckProgressList data={stats.deckProgress} onDeckClick={handleDeckClick} />

                {/* Note-level progress panel */}
                {selectedDeck && (
                  <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-medium text-gray-700">
                        {selectedDeck.name} のノート進捗
                      </h3>
                      <button
                        onClick={() => { setSelectedDeck(null); setNoteProgress(null) }}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>

                    {noteLoading ? (
                      <div className="space-y-2">
                        {[...Array(5)].map((_, i) => (
                          <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
                        ))}
                      </div>
                    ) : noteProgress && noteProgress.length === 0 ? (
                      <div className="text-center text-gray-400 text-sm py-6">ノートがありません</div>
                    ) : noteProgress && (
                      <div className="overflow-x-auto -mx-4 px-4">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                              <th className="pb-2 pr-2 font-medium">ノート</th>
                              <th className="pb-2 px-2 font-medium w-16 text-center">状態</th>
                              <th className="pb-2 px-2 font-medium w-16 text-center">正答率</th>
                              <th className="pb-2 pl-2 font-medium w-16 text-center">最終</th>
                            </tr>
                          </thead>
                          <tbody>
                            {noteProgress.map(note => {
                              const statusInfo = STATUS_LABELS[note.status] || STATUS_LABELS.new
                              return (
                                <tr key={note.noteId} className="border-b border-gray-50 last:border-0">
                                  <td className="py-2 pr-2">
                                    <div className="text-gray-800 truncate max-w-[200px] sm:max-w-[300px]">
                                      {note.displayText || '(空)'}
                                    </div>
                                  </td>
                                  <td className="py-2 px-2 text-center">
                                    <span className={`inline-block text-xs px-1.5 py-0.5 rounded-full ${statusInfo.color}`}>
                                      {statusInfo.label}
                                    </span>
                                  </td>
                                  <td className="py-2 px-2 text-center">
                                    {note.accuracy !== null ? (
                                      <span className={`text-xs font-medium ${note.accuracy >= 80 ? 'text-green-600' : note.accuracy >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>
                                        {note.accuracy}%
                                      </span>
                                    ) : (
                                      <span className="text-xs text-gray-300">--</span>
                                    )}
                                  </td>
                                  <td className="py-2 pl-2 text-center">
                                    <span className="text-xs text-gray-500">
                                      {formatRelativeDate(note.lastReview)}
                                    </span>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
