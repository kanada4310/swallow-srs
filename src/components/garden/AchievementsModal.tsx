'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { getAchievementInput } from '@/lib/garden/garden-data'
import { evaluateAchievements, countEarned } from '@/lib/garden/achievements'

/**
 * アチーブメントバッジ一覧（Phase 10.5）。既存データから導出（Dexie・オフライン可）。
 * 達成済みは色付き、未達成はグレー＋進捗。`/garden` の「実績」から開く。
 */
export function AchievementsModal({
  userId,
  onClose,
}: {
  userId: string | null | undefined
  onClose: () => void
}) {
  const input = useLiveQuery(
    async () => (userId ? await getAchievementInput(userId) : null),
    [userId]
  )

  const achievements = input ? evaluateAchievements(input) : []
  const { earned, total } = input
    ? countEarned(achievements)
    : { earned: 0, total: 0 }

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">
            <span className="mr-1.5" aria-hidden>🏅</span>実績
            {input && <span className="ml-2 text-sm font-normal text-gray-500">{earned}/{total}</span>}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm" aria-label="閉じる">
            ✕
          </button>
        </div>

        {!input ? (
          <div className="px-5 py-10 text-center text-sm text-gray-500">読み込み中…</div>
        ) : (
          <ul className="overflow-y-auto px-4 py-3 space-y-2">
            {achievements.map((a) => {
              const pct = Math.round((a.value / a.target) * 100)
              return (
                <li
                  key={a.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border ${
                    a.earned ? 'border-amber-200 bg-amber-50' : 'border-gray-100 bg-gray-50'
                  }`}
                >
                  <span className={`text-2xl ${a.earned ? '' : 'grayscale opacity-40'}`} aria-hidden>
                    {a.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className={`font-medium ${a.earned ? 'text-amber-900' : 'text-gray-700'}`}>
                      {a.name}
                      {a.earned && <span className="ml-1.5 text-xs text-amber-600">達成</span>}
                    </div>
                    <div className="text-xs text-gray-500">{a.description}</div>
                    {!a.earned && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-400" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[10px] text-gray-400 tabular-nums">
                          {a.value}/{a.target}
                        </span>
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
