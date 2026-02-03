'use client'

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts'
import type { AccuracyData } from '@/types/database'

interface AccuracyTrendChartProps {
  data: AccuracyData[]
}

export function AccuracyTrendChart({ data }: AccuracyTrendChartProps) {
  // Filter out days with no reviews (accuracy 0)
  const dataWithReviews = data.filter(d => d.accuracy > 0)

  // Format date for display
  const formattedData = data.map(d => ({
    ...d,
    displayDate: formatDate(d.date),
    // Show null for days without reviews to create gaps in the line
    displayAccuracy: d.accuracy > 0 ? d.accuracy : null,
  }))

  // Calculate average accuracy
  const avgAccuracy = dataWithReviews.length > 0
    ? Math.round(dataWithReviews.reduce((sum, d) => sum + d.accuracy, 0) / dataWithReviews.length)
    : 0

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-700">正答率推移</h3>
        <span className="text-xs text-gray-500">平均: {avgAccuracy}%</span>
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={formattedData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            <XAxis
              dataKey="displayDate"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: '#e5e7eb' }}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `${value}%`}
            />
            <ReferenceLine
              y={avgAccuracy}
              stroke="#9ca3af"
              strokeDasharray="3 3"
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload || payload.length === 0) return null
                const accuracy = payload[0].value
                if (accuracy === null) return null
                return (
                  <div className="bg-white shadow-lg rounded-lg border border-gray-200 p-2">
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-purple-600">正答率: {accuracy}%</p>
                  </div>
                )
              }}
            />
            <Line
              type="monotone"
              dataKey="displayAccuracy"
              stroke="#8b5cf6"
              strokeWidth={2}
              dot={{ fill: '#8b5cf6', strokeWidth: 0, r: 3 }}
              activeDot={{ r: 5, fill: '#8b5cf6' }}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return `${date.getMonth() + 1}/${date.getDate()}`
}
