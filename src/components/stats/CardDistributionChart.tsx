'use client'

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  Tooltip,
} from 'recharts'
import type { CardDistribution } from '@/types/database'

interface CardDistributionChartProps {
  data: CardDistribution
}

const COLORS = {
  new: '#3b82f6',      // blue
  learning: '#f59e0b', // amber
  review: '#22c55e',   // green
  relearning: '#ef4444', // red
}

const LABELS = {
  new: '新規',
  learning: '学習中',
  review: '復習',
  relearning: '再学習',
}

export function CardDistributionChart({ data }: CardDistributionChartProps) {
  const chartData = [
    { name: 'new', value: data.new, label: LABELS.new },
    { name: 'learning', value: data.learning, label: LABELS.learning },
    { name: 'review', value: data.review, label: LABELS.review },
    { name: 'relearning', value: data.relearning, label: LABELS.relearning },
  ].filter(d => d.value > 0)

  const total = data.new + data.learning + data.review + data.relearning

  if (total === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-4">カード状態分布</h3>
        <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
          データがありません
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-sm font-medium text-gray-700 mb-4">カード状態分布</h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={40}
              outerRadius={70}
              paddingAngle={2}
              dataKey="value"
              nameKey="label"
            >
              {chartData.map((entry) => (
                <Cell
                  key={entry.name}
                  fill={COLORS[entry.name as keyof typeof COLORS]}
                />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null
                const item = payload[0]
                const percent = ((item.value as number) / total * 100).toFixed(1)
                return (
                  <div className="bg-white shadow-lg rounded-lg border border-gray-200 p-2">
                    <p className="text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-gray-600">{item.value}枚 ({percent}%)</p>
                  </div>
                )
              }}
            />
            <Legend
              formatter={(value) => <span className="text-xs">{value}</span>}
              layout="horizontal"
              verticalAlign="bottom"
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="text-center text-sm text-gray-500 mt-2">
        合計 {total.toLocaleString()}枚
      </div>
    </div>
  )
}
