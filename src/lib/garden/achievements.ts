/**
 * アチーブメントバッジ（Phase 10.5）— 既存データから導出する実績。
 *
 * 新規データモデルは持たず、reviewLogs / card_states / userCreatureState から
 * 計算した指標（metric）をしきい値（target）と比べて達成判定する。純ロジック・テスト容易。
 */

export interface AchievementInput {
  /** 累計レビュー回数（reviewLogs 件数） */
  totalReviews: number
  /** 最長連続学習日数（ストリーク） */
  streakLongest: number
  /** 開花・結実まで育った株数 */
  bloomingCount: number
  /** 庭の株数（ノート数） */
  totalPlants: number
  /** インプリントした品種の種類数 */
  varietyCount: number
}

type Metric = keyof AchievementInput

export interface AchievementDef {
  id: string
  icon: string
  name: string
  description: string
  metric: Metric
  target: number
}

export interface Achievement extends AchievementDef {
  /** 現在値（進捗バー・表示用、target で頭打ち） */
  value: number
  earned: boolean
}

/** バッジカタログ（達成しやすい順に近い並び） */
export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'firstBloom', icon: '🌸', name: 'はじめての結実', description: '株を1つ開花・結実まで育てる', metric: 'bloomingCount', target: 1 },
  { id: 'streak3', icon: '🔥', name: '三日坊主、卒業', description: '3日連続で学習する', metric: 'streakLongest', target: 3 },
  { id: 'reviews100', icon: '📚', name: '100回レビュー', description: '累計100回レビューする', metric: 'totalReviews', target: 100 },
  { id: 'streak7', icon: '🔥', name: '一週間つづけた', description: '7日連続で学習する', metric: 'streakLongest', target: 7 },
  { id: 'variety5', icon: '🎨', name: '5品種コレクター', description: '5種類の植物をインプリントする', metric: 'varietyCount', target: 5 },
  { id: 'bloom10', icon: '🌳', name: '実りの庭', description: '10株を開花・結実まで育てる', metric: 'bloomingCount', target: 10 },
  { id: 'plants100', icon: '🌱', name: '100株の庭', description: '庭の株を100にする', metric: 'totalPlants', target: 100 },
  { id: 'streak30', icon: '🏆', name: '一ヶ月の習慣', description: '30日連続で学習する', metric: 'streakLongest', target: 30 },
  { id: 'reviews1000', icon: '📖', name: '1000回レビュー', description: '累計1000回レビューする', metric: 'totalReviews', target: 1000 },
]

/** 入力から各バッジの達成状況を計算する */
export function evaluateAchievements(input: AchievementInput): Achievement[] {
  return ACHIEVEMENTS.map((a) => {
    const raw = input[a.metric] ?? 0
    return {
      ...a,
      value: Math.min(raw, a.target),
      earned: raw >= a.target,
    }
  })
}

/** 達成数 / 総数 */
export function countEarned(achievements: Achievement[]): { earned: number; total: number } {
  return { earned: achievements.filter((a) => a.earned).length, total: achievements.length }
}
