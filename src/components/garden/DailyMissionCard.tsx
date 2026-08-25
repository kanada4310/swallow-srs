'use client'

import Link from 'next/link'
import { useLiveQuery } from 'dexie-react-hooks'
import { getDailyMission } from '@/lib/garden/garden-data'

/**
 * デイリーミッション（Phase 10.5・軽量版）。今日の水やり進捗を /garden 上部に表示。
 * 既存データから導出（Dexie・オフライン可）。プッシュ連携は将来（Phase 12.3）。
 */
export function DailyMissionCard({ userId }: { userId: string | null | undefined }) {
  const mission = useLiveQuery(
    async () => (userId ? await getDailyMission(userId) : null),
    [userId]
  )

  if (!mission || mission.goal === 0) return null // 今日やることが無ければ出さない

  const pct = Math.round((mission.wateredToday / mission.goal) * 100)

  return (
    <div
      className={`rounded-xl border p-4 mb-4 ${
        mission.done ? 'border-green-200 bg-green-50' : 'border-sky-200 bg-sky-50'
      }`}
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <h2 className="text-sm font-bold text-gray-800">
          {mission.done ? '✅ 今日のお世話、完了！' : '🌱 今日の学習'}
        </h2>
        <span className="text-xs text-gray-500 tabular-nums">
          {mission.wateredToday}/{mission.goal}
        </span>
      </div>

      <div className="h-2 bg-white/70 rounded-full overflow-hidden mb-2">
        <div
          className={`h-full transition-all ${mission.done ? 'bg-green-500' : 'bg-sky-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {mission.done ? (
        <p className="text-xs text-green-700">今日水やりが必要な株はすべてお世話できました。また明日。</p>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-gray-600">あと {mission.dueNow} 株に水やりしよう</p>
          <Link
            href="/decks"
            className="px-3 py-1 rounded-lg bg-sky-600 text-white text-xs font-medium hover:bg-sky-700 whitespace-nowrap"
          >
            水やりする
          </Link>
        </div>
      )}
    </div>
  )
}
