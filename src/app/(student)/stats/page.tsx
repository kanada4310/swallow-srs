'use client'

import { useAuth } from '@/contexts/AuthContext'
import { AppLayout } from '@/components/layout/AppLayout'
import { StreakHeatmap, IdentificationScoreCard } from '@/components/stats'
import { StatsContent } from './StatsContent'

export default function StatsPage() {
  const { isLoading, userId } = useAuth()

  if (isLoading) {
    return (
      <AppLayout>
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="h-8 bg-gray-200 rounded-xl w-32 mb-6 animate-pulse" />
          <div className="space-y-4">
            <div className="h-40 bg-gray-200 rounded-card animate-pulse" />
            <div className="h-40 bg-gray-200 rounded-card animate-pulse" />
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-extrabold text-ai mb-6">学習統計</h1>
        <div className="mb-6">
          <StreakHeatmap userId={userId} />
        </div>
        <div className="mb-6">
          <IdentificationScoreCard userId={userId} />
        </div>
        <StatsContent />
      </div>
    </AppLayout>
  )
}
