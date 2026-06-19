'use client'

import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db/schema'

export interface IdentificationScorePoint {
  /** 0-100 のスコア */
  score: number
  /** 解答時間(ms)。未記録は null */
  timeMs: number | null
  reviewedAt: Date
}

export interface IdentificationScoreData {
  /** スコア付きレビュー件数（＝識別演習の例文回答数） */
  count: number
  /** 平均スコア 0-100 */
  avgScore: number
  /** 平均解答時間(ms)。時間記録があるもののみ */
  avgTimeMs: number | null
  /** 直近のスコア（古い→新しい、最大 limit 件） */
  recent: IdentificationScorePoint[]
  loading: boolean
}

/**
 * 多段階設問（識別演習）のスコアを Dexie の reviewLogs から導出するフック。
 * score が記録されたログ（＝識別演習）のみ対象。オフライン可・同期で自動再描画。
 */
export function useIdentificationScores(
  userId: string | null | undefined,
  limit = 20
): IdentificationScoreData {
  const points = useLiveQuery(async () => {
    if (!userId) return null
    const logs = await db.reviewLogs.where('user_id').equals(userId).toArray()
    return logs
      .filter((l) => typeof l.score === 'number')
      .map((l) => ({
        score: l.score as number,
        timeMs: typeof l.time_ms === 'number' ? l.time_ms : null,
        reviewedAt: l.reviewed_at instanceof Date ? l.reviewed_at : new Date(l.reviewed_at),
      }))
      .sort((a, b) => a.reviewedAt.getTime() - b.reviewedAt.getTime())
  }, [userId])

  return useMemo(() => {
    if (points === undefined) {
      return { count: 0, avgScore: 0, avgTimeMs: null, recent: [], loading: true }
    }
    const arr = points ?? []
    const count = arr.length
    if (count === 0) {
      return { count: 0, avgScore: 0, avgTimeMs: null, recent: [], loading: false }
    }
    const avgScore = Math.round(arr.reduce((s, p) => s + p.score, 0) / count)
    const timed = arr.filter((p) => p.timeMs !== null) as Required<IdentificationScorePoint>[]
    const avgTimeMs =
      timed.length > 0 ? Math.round(timed.reduce((s, p) => s + (p.timeMs as number), 0) / timed.length) : null
    const recent = arr.slice(-limit)
    return { count, avgScore, avgTimeMs, recent, loading: false }
  }, [points, limit])
}
