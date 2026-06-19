'use client'

import { useIdentificationScores } from '@/lib/stats/useIdentificationScores'

interface IdentificationScoreCardProps {
  userId: string | null | undefined
}

function scoreColor(score: number): string {
  if (score >= 80) return '#22c55e'
  if (score >= 60) return '#a67c3f'
  return '#ef4444'
}

/**
 * 識別演習（多段階設問）のスコア表示（Dexie 駆動・オフライン可）。
 * スコア付きレビューが無い場合は何も表示しない（通常の単語学習だけのユーザーには出ない）。
 */
export function IdentificationScoreCard({ userId }: IdentificationScoreCardProps) {
  const { count, avgScore, avgTimeMs, recent, loading } = useIdentificationScores(userId)

  if (loading || count === 0) return null

  const avgSeconds = avgTimeMs !== null ? (avgTimeMs / 1000).toFixed(1) : null
  const maxScore = 100

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
        <span>📜</span>識別演習スコア（正誤＋解答時間）
      </h3>
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div>
          <p className="text-xs text-gray-500">平均スコア</p>
          <p className="text-2xl font-bold" style={{ color: scoreColor(avgScore) }}>
            {avgScore}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">回答した例文</p>
          <p className="text-2xl font-bold text-gray-900">{count}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">平均解答時間</p>
          <p className="text-2xl font-bold text-gray-900">
            {avgSeconds !== null ? `${avgSeconds}秒` : '—'}
          </p>
        </div>
      </div>

      {/* 直近のスコア推移（軽量バー） */}
      <p className="text-xs text-gray-500 mb-1">直近のスコア</p>
      <div className="flex items-end gap-1 h-20">
        {recent.map((p, i) => (
          <div
            key={i}
            className="flex-1 rounded-t transition-all"
            style={{
              height: `${Math.max(4, (p.score / maxScore) * 100)}%`,
              backgroundColor: scoreColor(p.score),
            }}
            title={`${p.score}点 / ${p.reviewedAt.toLocaleDateString('ja-JP')}`}
          />
        ))}
      </div>
    </div>
  )
}
