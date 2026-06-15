'use client'

import { useStreak } from '@/lib/stats/useStreak'
import type { HeatLevel } from '@/lib/stats/streak'

const LEVEL_CLASS: Record<HeatLevel, string> = {
  0: 'bg-gray-100',
  1: 'bg-emerald-200',
  2: 'bg-emerald-300',
  3: 'bg-emerald-500',
  4: 'bg-emerald-700',
}

const WEEKDAY = ['日', '月', '火', '水', '木', '金', '土']

/**
 * 学習ストリーク＆ヒートマップ（Phase 10.5）。
 * reviewLogs から導出（Dexie・オフライン可）。/stats に表示。
 */
export function StreakHeatmap({
  userId,
  weeks = 12,
}: {
  userId: string | null | undefined
  weeks?: number
}) {
  const { current, longest, heatmap, empty, loading } = useStreak(userId, weeks)

  if (loading) {
    return <div className="h-32 bg-gray-100 rounded-lg animate-pulse" />
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-end justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl" aria-hidden>🔥</span>
          <span className="text-3xl font-bold text-gray-900 tabular-nums">{current}</span>
          <span className="text-sm text-gray-500">日連続</span>
        </div>
        <div className="text-sm text-gray-500">
          最長 <span className="font-semibold text-gray-700 tabular-nums">{longest}</span> 日
        </div>
      </div>

      {empty ? (
        <p className="text-sm text-gray-500 py-4 text-center">
          学習を始めると、ここに記録がたまっていきます。
        </p>
      ) : (
        <div className="flex gap-2">
          {/* 曜日ラベル（日・水・土だけ） */}
          <div className="flex flex-col justify-between py-0.5 text-[10px] text-gray-400 leading-none">
            {WEEKDAY.map((w, i) => (
              <span key={w} className="h-3 flex items-center">
                {i % 3 === 0 ? w : ' '}
              </span>
            ))}
          </div>

          {/* 週（列）× 7日（行） */}
          <div className="flex gap-1 overflow-x-auto pb-1">
            {heatmap.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-1">
                {week.map((cell) => (
                  <div
                    key={cell.key}
                    className={`w-3 h-3 rounded-sm ${cell.future ? 'bg-transparent' : LEVEL_CLASS[cell.level]}`}
                    title={cell.future ? '' : `${cell.key}：${cell.count}回`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {!empty && (
        <div className="flex items-center justify-end gap-1 mt-3 text-[10px] text-gray-400">
          <span>少</span>
          {([0, 1, 2, 3, 4] as HeatLevel[]).map((l) => (
            <span key={l} className={`w-3 h-3 rounded-sm ${LEVEL_CLASS[l]}`} />
          ))}
          <span>多</span>
        </div>
      )}
    </div>
  )
}
