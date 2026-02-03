'use client'

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts'
import type { DailyReviewData } from '@/types/database'

interface DailyReviewChartProps {
  data: DailyReviewData[]
}

export function DailyReviewChart({ data }: DailyReviewChartProps) {
  // Format date for display (MM/DD)
  const formattedData = data.map(d => ({
    ...d,
    displayDate: formatDate(d.date),
  }))

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-sm font-medium text-gray-700 mb-4">日別復習数</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={formattedData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            <XAxis
              dataKey="displayDate"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: '#e5e7eb' }}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload || payload.length === 0) return null
                const correct = payload.find(p => p.dataKey === 'correct')?.value || 0
                const incorrect = payload.find(p => p.dataKey === 'incorrect')?.value || 0
                return (
                  <div className="bg-white shadow-lg rounded-lg border border-gray-200 p-3">
                    <p className="text-sm font-medium text-gray-900 mb-1">{label}</p>
                    <p className="text-xs text-green-600">正解: {correct}</p>
                    <p className="text-xs text-red-500">不正解: {incorrect}</p>
                  </div>
                )
              }}
            />
            <Legend
              formatter={(value) => (value === 'correct' ? '正解' : '不正解')}
              wrapperStyle={{ fontSize: '12px' }}
            />
            <Bar dataKey="correct" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} name="correct" />
            <Bar dataKey="incorrect" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} name="incorrect" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return `${date.getMonth() + 1}/${date.getDate()}`
}
