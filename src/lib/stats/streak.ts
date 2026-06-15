/**
 * 学習ストリーク＆ヒートマップ（Phase 10.5）— review_logs から導出する純ロジック。
 *
 * 1日の区切りは SRS 規則どおり午前4時（`getStudyDayStart`）。
 * 既存データ（reviewLogs）だけで成立する。オフライン可（Dexie から日付配列を渡す）。
 */

import { getStudyDayStart } from '@/lib/srs/scheduler'

export type HeatLevel = 0 | 1 | 2 | 3 | 4

export interface HeatmapCell {
  /** 学習日キー（YYYY-MM-DD、4時区切り） */
  key: string
  /** 学習日の開始（4:00） */
  date: Date
  /** その日の復習回数 */
  count: number
  /** 濃さ（0=なし 〜 4=多い） */
  level: HeatLevel
  /** 今日より未来の placeholder か（カレンダー整列用） */
  future: boolean
}

const MS_PER_DAY = 86_400_000

/** 学習日キー（4時区切り）。`YYYY-MM-DD` */
export function studyDayKey(date: Date, resetHour = 4): string {
  const s = getStudyDayStart(date, resetHour)
  const y = s.getFullYear()
  const m = String(s.getMonth() + 1).padStart(2, '0')
  const d = String(s.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 復習回数から濃さを決める */
export function levelFor(count: number): HeatLevel {
  if (count <= 0) return 0
  if (count < 10) return 1
  if (count < 30) return 2
  if (count < 60) return 3
  return 4
}

/** 学習日ごとの復習回数を集計（key → count） */
export function countByStudyDay(reviewDates: Date[], resetHour = 4): Map<string, number> {
  const m = new Map<string, number>()
  for (const d of reviewDates) {
    const k = studyDayKey(d, resetHour)
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return m
}

/**
 * 連続学習日数（current）と最長連続（longest）を求める。
 * 当日まだ未学習でもストリークは切らさない（前日から継続中とみなす）。
 */
export function computeStreak(
  reviewDates: Date[],
  now: Date = new Date(),
  resetHour = 4
): { current: number; longest: number } {
  const counts = countByStudyDay(reviewDates, resetHour)

  // longest: ソート済みの学習日キーを走査し、連続（1日差）を数える
  const keys = Array.from(counts.keys()).sort()
  let longest = 0
  let run = 0
  let prev: Date | null = null
  for (const k of keys) {
    const cur = new Date(`${k}T00:00:00`)
    if (prev && Math.round((cur.getTime() - prev.getTime()) / MS_PER_DAY) === 1) {
      run += 1
    } else {
      run = 1
    }
    if (run > longest) longest = run
    prev = cur
  }

  // current: 今日（4時区切り）から遡って連続を数える。
  // 今日が未学習なら昨日から数える（その日が終わるまでストリークを切らない）。
  let current = 0
  const cursor = getStudyDayStart(now, resetHour)
  if (!counts.has(studyDayKey(cursor, resetHour))) {
    cursor.setDate(cursor.getDate() - 1)
  }
  while (counts.has(studyDayKey(cursor, resetHour))) {
    current += 1
    cursor.setDate(cursor.getDate() - 1)
  }

  return { current, longest }
}

/**
 * ヒートマップ用のセルを「週（列）× 7日（行・日〜土）」で返す。
 * 直近 `weeks` 週ぶんを、週の境界（日曜始まり）に整列して生成する。
 */
export function buildHeatmap(
  reviewDates: Date[],
  weeks = 12,
  now: Date = new Date(),
  resetHour = 4
): HeatmapCell[][] {
  const counts = countByStudyDay(reviewDates, resetHour)
  const today = getStudyDayStart(now, resetHour)

  // 今週の土曜まで進めて末尾に整列（日=0 .. 土=6）
  const lastDay = new Date(today)
  lastDay.setDate(lastDay.getDate() + (6 - lastDay.getDay()))

  const totalDays = weeks * 7
  const firstDay = new Date(lastDay)
  firstDay.setDate(firstDay.getDate() - (totalDays - 1))

  const weekGrid: HeatmapCell[][] = []
  const cursor = new Date(firstDay)
  for (let w = 0; w < weeks; w++) {
    const week: HeatmapCell[] = []
    for (let d = 0; d < 7; d++) {
      const key = studyDayKey(cursor, resetHour)
      const count = counts.get(key) ?? 0
      week.push({
        key,
        date: new Date(cursor),
        count,
        level: levelFor(count),
        future: cursor.getTime() > today.getTime(),
      })
      cursor.setDate(cursor.getDate() + 1)
    }
    weekGrid.push(week)
  }
  return weekGrid
}
