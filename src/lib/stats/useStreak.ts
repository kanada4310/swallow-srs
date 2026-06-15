'use client'

import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db/schema'
import { computeStreak, buildHeatmap, type HeatmapCell } from './streak'

export interface StreakData {
  current: number
  longest: number
  heatmap: HeatmapCell[][]
  /** 学習記録が1件もない（＝まだ始めていない） */
  empty: boolean
  loading: boolean
}

/**
 * 学習ストリーク＆ヒートマップ（Phase 10.5）を Dexie の reviewLogs から導出するフック。
 * バックグラウンド同期で reviewLogs が増えると自動再描画（useLiveQuery）。オフライン可。
 */
export function useStreak(
  userId: string | null | undefined,
  weeks = 12
): StreakData {
  const dates = useLiveQuery(async () => {
    if (!userId) return null
    const logs = await db.reviewLogs.where('user_id').equals(userId).toArray()
    return logs.map((l) =>
      l.reviewed_at instanceof Date ? l.reviewed_at : new Date(l.reviewed_at)
    )
  }, [userId])

  return useMemo(() => {
    if (dates === undefined) {
      return { current: 0, longest: 0, heatmap: [], empty: false, loading: true }
    }
    const arr = dates ?? []
    const now = new Date()
    const { current, longest } = computeStreak(arr, now)
    const heatmap = buildHeatmap(arr, weeks, now)
    return { current, longest, heatmap, empty: arr.length === 0, loading: false }
  }, [dates, weeks])
}
