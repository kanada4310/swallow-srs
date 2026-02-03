'use client'

import { useState, useEffect } from 'react'
import {
  StatsOverview,
  DailyReviewChart,
  CardDistributionChart,
  AccuracyTrendChart,
  DeckProgressList,
  StatsSkeleton,
} from '@/components/stats'
import type { DetailedStats } from '@/types/database'

interface BasicStats {
  dueCards: number
  newCards: number
  learningCards: number
  reviewsToday: number
  streak: number
}

type FullStats = BasicStats & Partial<DetailedStats>

const PERIOD_OPTIONS = [
  { value: 7, label: '7日間' },
  { value: 14, label: '14日間' },
  { value: 30, label: '30日間' },
]

export function StatsContent() {
  const [stats, setStats] = useState<FullStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState(14)

  useEffect(() => {
    async function fetchStats() {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch(`/api/student/stats?detailed=true&days=${period}`)
        if (!response.ok) {
          throw new Error('Failed to fetch stats')
        }
        const data = await response.json()
        setStats(data.stats)
      } catch (err) {
        console.error('Error fetching stats:', err)
        setError('統計データの取得に失敗しました')
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [period])

  if (loading) {
    return <StatsSkeleton />
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        {error}
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
        <div className="text-gray-400 mb-4">
          <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <h2 className="text-lg font-medium text-gray-900 mb-2">統計データがありません</h2>
        <p className="text-gray-500">
          学習を始めると、ここに統計が表示されます。
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex justify-end">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
          {PERIOD_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => setPeriod(option.value)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                period === option.value
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Overview cards */}
      <StatsOverview
        streak={stats.streak}
        totalReviews={stats.totalReviews || 0}
        overallAccuracy={stats.overallAccuracy || 0}
        reviewsToday={stats.reviewsToday}
      />

      {/* Daily review chart */}
      {stats.dailyReviews && stats.dailyReviews.length > 0 && (
        <DailyReviewChart data={stats.dailyReviews} />
      )}

      {/* Two column layout for smaller charts */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Card distribution */}
        {stats.cardDistribution && (
          <CardDistributionChart data={stats.cardDistribution} />
        )}

        {/* Accuracy trend */}
        {stats.accuracyTrend && stats.accuracyTrend.length > 0 && (
          <AccuracyTrendChart data={stats.accuracyTrend} />
        )}
      </div>

      {/* Deck progress */}
      {stats.deckProgress && stats.deckProgress.length > 0 && (
        <DeckProgressList data={stats.deckProgress} />
      )}

      {/* Time stats */}
      {stats.timeStats && stats.timeStats.totalReviewTime > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">学習時間</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500">合計学習時間</p>
              <p className="text-lg font-semibold text-gray-900">
                {formatTime(stats.timeStats.totalReviewTime)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">平均回答時間</p>
              <p className="text-lg font-semibold text-gray-900">
                {(stats.timeStats.averageTimePerCard / 1000).toFixed(1)}秒/枚
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}時間${minutes % 60}分`
  }
  if (minutes > 0) {
    return `${minutes}分${seconds % 60}秒`
  }
  return `${seconds}秒`
}
