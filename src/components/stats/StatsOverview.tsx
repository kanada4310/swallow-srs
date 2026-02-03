'use client'

interface StatsOverviewProps {
  streak: number
  totalReviews: number
  overallAccuracy: number
  reviewsToday: number
}

export function StatsOverview({
  streak,
  totalReviews,
  overallAccuracy,
  reviewsToday,
}: StatsOverviewProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <StatCard
        label="連続学習"
        value={streak}
        unit="日"
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
          </svg>
        }
        color="orange"
      />
      <StatCard
        label="今日の復習"
        value={reviewsToday}
        unit="枚"
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
        color="blue"
      />
      <StatCard
        label="総復習数"
        value={totalReviews}
        unit="枚"
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        }
        color="green"
      />
      <StatCard
        label="正答率"
        value={overallAccuracy}
        unit="%"
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
        color="purple"
      />
    </div>
  )
}

interface StatCardProps {
  label: string
  value: number
  unit: string
  icon: React.ReactNode
  color: 'orange' | 'blue' | 'green' | 'purple'
}

function StatCard({ label, value, unit, icon, color }: StatCardProps) {
  const colorClasses = {
    orange: 'bg-orange-50 text-orange-600 border-orange-200',
    blue: 'bg-blue-50 text-blue-600 border-blue-200',
    green: 'bg-green-50 text-green-600 border-green-200',
    purple: 'bg-purple-50 text-purple-600 border-purple-200',
  }

  const iconBgClasses = {
    orange: 'bg-orange-100',
    blue: 'bg-blue-100',
    green: 'bg-green-100',
    purple: 'bg-purple-100',
  }

  return (
    <div className={`rounded-lg border p-3 ${colorClasses[color]}`}>
      <div className="flex items-center gap-2 mb-1">
        <div className={`p-1.5 rounded-md ${iconBgClasses[color]}`}>
          {icon}
        </div>
        <span className="text-xs font-medium opacity-80">{label}</span>
      </div>
      <div className="text-2xl font-bold">
        {value.toLocaleString()}
        <span className="text-sm font-normal ml-1">{unit}</span>
      </div>
    </div>
  )
}
