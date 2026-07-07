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
  new: { label: '新規', color: 'bg-easy-bg text-easy' },
  learning: { label: '学習中', color: 'bg-hard-bg text-hard' },
  relearning: { label: '再学習', color: 'bg-again-bg text-again' },
  review: { label: '復習', color: 'bg-good-bg text-good' },
  mastered: { label: '習得', color: 'bg-sora-soft text-sora' },
  suspended: { label: '停止', color: 'bg-gray-100 text-ink-3' },
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
          <div className="bg-again-bg text-again p-4 rounded-card">{error}</div>
          <Link href="/students/progress" className="text-sora hover:text-sora-dark font-bold mt-4 inline-block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai">
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
            className="text-ink-3 hover:text-ink-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-xl font-extrabold text-ai">{student?.name}</h1>
            <p className="text-sm text-ink-2">{student?.email}</p>
          </div>
        </div>

        {/* Period selector */}
        <div className="flex gap-2 mb-6">
          {[7, 14, 30].map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-2xl text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai ${
                period === p
                  ? 'bg-sora text-white'
                  : 'bg-gray-100 text-ink-2 hover:bg-gray-200'
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
                  <div className="bg-white rounded-card border border-gray-200 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-bold text-ai">
                        {selectedDeck.name} のノート進捗
                      </h3>
                      <button
                        onClick={() => { setSelectedDeck(null); setNoteProgress(null) }}
                        className="text-ink-3 hover:text-ink-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
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
                      <div className="text-center text-ink-3 text-sm py-6">ノートがありません</div>
                    ) : noteProgress && (
                      <div className="overflow-x-auto -mx-4 px-4">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-xs text-ink-3 border-b border-gray-100">
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
                                <tr
                                  key={note.noteId}
                                  className="border-b border-gray-50 last:border-0 cursor-pointer hover:bg-sora-soft transition-colors"
                                  onClick={() => window.location.href = `/decks/${selectedDeck.id}?note=${note.noteId}`}
                                >
                                  <td className="py-2 pr-2">
                                    <div className="text-ink truncate max-w-[200px] sm:max-w-[300px]">
                                      {note.displayText || '(空)'}
                                    </div>
                                  </td>
                                  <td className="py-2 px-2 text-center">
                                    <span className={`inline-block text-xs font-bold px-2.5 py-0.5 rounded-full ${statusInfo.color}`}>
                                      {statusInfo.label}
                                    </span>
                                  </td>
                                  <td className="py-2 px-2 text-center tabular-nums">
                                    {note.accuracy !== null ? (
                                      <span className={`text-xs font-bold ${note.accuracy >= 80 ? 'text-good' : note.accuracy >= 60 ? 'text-hard' : 'text-again'}`}>
                                        {note.accuracy}%
                                      </span>
                                    ) : (
                                      <span className="text-xs text-ink-3">--</span>
                                    )}
                                  </td>
                                  <td className="py-2 pl-2 text-center">
                                    <span className="text-xs text-ink-3">
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
