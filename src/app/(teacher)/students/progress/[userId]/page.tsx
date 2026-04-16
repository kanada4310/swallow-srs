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

export default function StudentProgressDetailPage({ params }: { params: { userId: string } }) {
  const { profile, isLoading: authLoading } = useAuth()
  const [student, setStudent] = useState<StudentInfo | null>(null)
  const [stats, setStats] = useState<StatsData | null>(null)
  const [period, setPeriod] = useState(7)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

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
              <DeckProgressList data={stats.deckProgress} />
            )}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
