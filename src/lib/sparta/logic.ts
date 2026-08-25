/**
 * スパルタプログラム管理 — 進捗導出の純ロジック。
 *
 * 期間を定めた暗記の取り組み（達成報酬つき）の達成状況を、
 * 既存の学習データ（card_states 由来の定着度・review_logs の学習日時）だけから導出する。
 * 学習エンジン（card_states / review_logs）には一切書き込まない純表示層
 * （単語帳の定着度ビュー・庭の plant-state と同じ思想）。
 *
 * 「習得」の判定は既存の定着度（wordbook/mastery）の区分をそのまま使う:
 *   - stable（定着中）以上 = 実効安定度 7日以上 … 既定
 *   - mastered（定着済み） = 実効安定度 21日以上 … 厳しめの選択肢
 *
 * 日付の区切りは SRS 規則の午前4時。サーバー（UTC）でも日本の生徒の
 * 体感とずれないよう、日本時間（+9時間）で日付キーを計算する。
 */

import {
  deriveMastery,
  MASTERY_ORDER,
  type MasteryCardInput,
  type MasteryLevel,
} from '@/lib/wordbook/mastery'

/** 習得と数える定着度の基準（既存の定着度区分に対応） */
export type SpartaGoalMastery = 'stable' | 'mastered'

export const GOAL_MASTERY_LABEL: Record<SpartaGoalMastery, string> = {
  stable: '定着中以上（7日以上覚えている）',
  mastered: '定着済み（21日以上覚えている）',
}

/** プログラムの状態（DB の status とは別に、期間から導出する表示状態） */
export type SpartaPhase = 'upcoming' | 'active' | 'ended' | 'canceled'

export const SPARTA_PHASE_LABEL: Record<SpartaPhase, string> = {
  upcoming: '開始前',
  active: '実施中',
  ended: '終了',
  canceled: '中止',
}

const JST_OFFSET_MS = 9 * 3_600_000
const DAY_MS = 86_400_000

/**
 * 日本時間・午前4時区切りの学習日キー（YYYY-MM-DD）。
 * サーバーが UTC でも生徒の体感（日本の朝4時で日付が変わる）と一致させる。
 */
export function spartaDayKey(date: Date, resetHour = 4): string {
  const shifted = new Date(date.getTime() + JST_OFFSET_MS - resetHour * 3_600_000)
  return shifted.toISOString().slice(0, 10)
}

/** 開始日（YYYY-MM-DD）の学習日の開始時刻（日本時間 4:00） */
export function periodStart(startDate: string, resetHour = 4): Date {
  return new Date(`${startDate}T0${resetHour}:00:00+09:00`)
}

/** 終了日（YYYY-MM-DD）を含む期間の終端（翌日の日本時間 4:00・排他的） */
export function periodEndExclusive(endDate: string, resetHour = 4): Date {
  return new Date(new Date(`${endDate}T0${resetHour}:00:00+09:00`).getTime() + DAY_MS)
}

/** 日付キー（YYYY-MM-DD）同士の差（日数）。a - b */
function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY_MS)
}

/** 日付キーに日数を足す */
function addDays(key: string, days: number): string {
  return new Date(Date.parse(`${key}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

export interface SpartaProgramInput {
  /** 開始日 YYYY-MM-DD（この日を含む） */
  startDate: string
  /** 終了日 YYYY-MM-DD（この日を含む） */
  endDate: string
  /** 目標カード数。null = 対象デッキの全カード習得が目標 */
  targetCardCount: number | null
  /** 習得と数える定着度の基準 */
  goalMastery: SpartaGoalMastery
  /** 登録時点で既に習得済みだったカード数（進捗の起点） */
  baselineAchievedCount: number
  /** DB 上の状態（中止かどうか） */
  status: 'active' | 'canceled'
}

/** 1日ぶんの実施記録 */
export interface SpartaDay {
  /** 学習日キー YYYY-MM-DD（日本時間・4時区切り） */
  key: string
  /** その日の復習回数 */
  count: number
}

export interface SpartaProgress {
  /** 期間から導出した表示状態 */
  phase: SpartaPhase
  /** 対象デッキの総カード数 */
  totalCards: number
  /** 現時点で習得済み（基準以上）のカード数 */
  achievedNow: number
  /** 登録時点の習得済み数（起点） */
  baseline: number
  /** 期間の成果 = achievedNow - baseline（下限0） */
  achievedInPeriod: number
  /** 目標数（targetCardCount、無ければ 全カード - baseline） */
  targetCount: number
  /** 進捗率 0-100（目標0のときは100） */
  progressPct: number
  /** 定着度の内訳（習得度サマリー用） */
  masteryBreakdown: Record<MasteryLevel, number>
  /** 期間の全日数 */
  daysTotal: number
  /** 経過日数（今日を含む。開始前は0、終了後は daysTotal） */
  daysElapsed: number
  /** 残り日数（今日を含む。終了後は0） */
  daysRemaining: number
  /** 期間内に学習した日数 */
  daysStudied: number
  /** 今日（の学習日）に実施済みか */
  studiedToday: boolean
  /** 期間内の連続実施日数（今日から遡る。今日未実施なら昨日から数える） */
  currentStreak: number
  /** 期間内の日ごとの実施状況（開始日→終了日 or 今日まで） */
  days: SpartaDay[]
}

/**
 * カード群の定着度と期間内の学習日時からプログラムの進捗を導出する。
 *
 * @param program プログラムの定義
 * @param cardStates 対象デッキ全カードの学習状態（未学習カードは null を入れる）
 * @param reviewDates 期間内・対象デッキの復習日時（review_logs.reviewed_at）
 * @param now 現在時刻
 */
export function deriveSpartaProgress(
  program: SpartaProgramInput,
  cardStates: Array<MasteryCardInput | null>,
  reviewDates: Date[],
  now: Date = new Date()
): SpartaProgress {
  const startKey = program.startDate
  const endKey = program.endDate
  const todayKey = spartaDayKey(now)

  // 表示状態
  let phase: SpartaPhase
  if (program.status === 'canceled') phase = 'canceled'
  else if (todayKey < startKey) phase = 'upcoming'
  else if (todayKey > endKey) phase = 'ended'
  else phase = 'active'

  // 定着度の内訳と習得数
  const masteryBreakdown: Record<MasteryLevel, number> = {
    new: 0,
    weak: 0,
    learning: 0,
    stable: 0,
    mastered: 0,
  }
  let achievedNow = 0
  const goalOrder = MASTERY_ORDER[program.goalMastery]
  for (const cs of cardStates) {
    const level = deriveMastery(cs)
    masteryBreakdown[level] += 1
    if (MASTERY_ORDER[level] >= goalOrder) achievedNow += 1
  }

  const totalCards = cardStates.length
  const baseline = Math.max(0, program.baselineAchievedCount)
  const achievedInPeriod = Math.max(0, achievedNow - baseline)
  const targetCount =
    program.targetCardCount != null
      ? program.targetCardCount
      : Math.max(0, totalCards - baseline)
  const progressPct =
    targetCount <= 0
      ? 100
      : Math.min(100, Math.round((achievedInPeriod / targetCount) * 100))

  // 日数
  const daysTotal = Math.max(0, dayDiff(endKey, startKey) + 1)
  const daysElapsed =
    todayKey < startKey
      ? 0
      : Math.min(daysTotal, dayDiff(todayKey, startKey) + 1)
  const daysRemaining = Math.max(0, daysTotal - daysElapsed)

  // 日ごとの実施状況（期間内のみ）
  const countByDay = new Map<string, number>()
  for (const d of reviewDates) {
    const k = spartaDayKey(d)
    if (k < startKey || k > endKey) continue
    countByDay.set(k, (countByDay.get(k) ?? 0) + 1)
  }

  const lastKey = todayKey < endKey ? todayKey : endKey
  const days: SpartaDay[] = []
  if (todayKey >= startKey) {
    for (let k = startKey; k <= lastKey; k = addDays(k, 1)) {
      days.push({ key: k, count: countByDay.get(k) ?? 0 })
    }
  }

  const daysStudied = days.filter(d => d.count > 0).length
  const studiedToday = (countByDay.get(todayKey) ?? 0) > 0

  // 期間内の連続実施（今日から遡る。今日未実施ならその日が終わるまで切らさない）
  let currentStreak = 0
  if (days.length > 0) {
    let cursor = lastKey
    if ((countByDay.get(cursor) ?? 0) === 0) cursor = addDays(cursor, -1)
    while (cursor >= startKey && (countByDay.get(cursor) ?? 0) > 0) {
      currentStreak += 1
      cursor = addDays(cursor, -1)
    }
  }

  return {
    phase,
    totalCards,
    achievedNow,
    baseline,
    achievedInPeriod,
    targetCount,
    progressPct,
    masteryBreakdown,
    daysTotal,
    daysElapsed,
    daysRemaining,
    daysStudied,
    studiedToday,
    currentStreak,
    days,
  }
}

/**
 * 登録時の「開始時点ですでに習得済みの数」を数える（baseline の計算）。
 * deriveSpartaProgress と同じ判定を使う。
 */
export function countAchieved(
  cardStates: Array<MasteryCardInput | null>,
  goalMastery: SpartaGoalMastery
): number {
  const goalOrder = MASTERY_ORDER[goalMastery]
  let n = 0
  for (const cs of cardStates) {
    if (MASTERY_ORDER[deriveMastery(cs)] >= goalOrder) n += 1
  }
  return n
}

/** 入力検査: 登録・編集フォームの値（API とフォームで共用） */
export function validateSpartaInput(input: {
  deckIds?: unknown
  startDate?: unknown
  endDate?: unknown
  targetCardCount?: unknown
  goalMastery?: unknown
}): string | null {
  const { deckIds, startDate, endDate, targetCardCount, goalMastery } = input
  if (!Array.isArray(deckIds) || deckIds.length === 0 || deckIds.some(d => typeof d !== 'string')) {
    return '対象デッキを1つ以上選んでください'
  }
  const dateRe = /^\d{4}-\d{2}-\d{2}$/
  if (typeof startDate !== 'string' || !dateRe.test(startDate)) {
    return '開始日が正しくありません'
  }
  if (typeof endDate !== 'string' || !dateRe.test(endDate)) {
    return '終了日が正しくありません'
  }
  if (endDate < startDate) {
    return '終了日は開始日以降にしてください'
  }
  if (targetCardCount != null) {
    if (
      typeof targetCardCount !== 'number' ||
      !Number.isInteger(targetCardCount) ||
      targetCardCount < 1 ||
      targetCardCount > 100000
    ) {
      return '目標カード数は1以上の整数にしてください'
    }
  }
  if (goalMastery !== 'stable' && goalMastery !== 'mastered') {
    return '習得の基準が正しくありません'
  }
  return null
}
