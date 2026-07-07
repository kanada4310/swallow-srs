/**
 * 単語帳（定着度ビュー）— 定着度の導出（純ロジック）
 *
 * 既存の FSRS `card_states` だけから、単語1枚の「定着度」を導出する。
 * 学習エンジンには一切触れない純コスメティック層（庭の plant-state と同じ思想）。
 *
 * レベル（弱い→強い）:
 *   未学習(new) → 苦手(weak) → 学習中(learning) → 定着中(stable) → 定着済み(mastered)
 *
 * 「苦手」は「間違えを蓄積した単語」を可視化するためのレベル。
 * relearning・learning での失敗・lapses の蓄積（まだ十分に固まっていない語）を拾う。
 */

/** 定着度レベル（弱い→強い） */
export type MasteryLevel = 'new' | 'weak' | 'learning' | 'stable' | 'mastered'

/**
 * 復習の必要度の順序（小さいほど「今 手をかけるべき」）。
 * 単語のカードが複数あるとき、この順で一番小さい（弱い）レベルを単語の定着度にする。
 * また一覧の並び順にも使う（苦手が上）。
 */
export const MASTERY_ORDER: Record<MasteryLevel, number> = {
  weak: 0,
  new: 1,
  learning: 2,
  stable: 3,
  mastered: 4,
}

/** 全レベル（表示順＝弱い→強い） */
export const MASTERY_LEVELS: MasteryLevel[] = ['new', 'weak', 'learning', 'stable', 'mastered']

export const MASTERY_LABEL: Record<MasteryLevel, string> = {
  new: '未学習',
  weak: '苦手',
  learning: '学習中',
  stable: '定着中',
  mastered: '定着済み',
}

/**
 * 定着度の実効 stability（日）しきい値。
 * learning < 7日 ≤ stable < 21日 ≤ mastered（21日 = Anki の "mature" 相当）。
 */
export const MASTERY_THRESHOLDS = {
  stable: 7,
  mastered: 21,
} as const

/** lapses がこの数以上たまっていると「苦手」寄りに扱う（十分固まっていない限り）。 */
const WEAK_LAPSES = 2

/**
 * 定着度の導出に必要な card_states の最小サブセット（構造型・テスト容易）。
 * plant-state の PlantCardInput と互換。
 */
export interface MasteryCardInput {
  /** 'new' | 'learning' | 'review' | 'relearning' */
  state: string
  /** FSRS の記憶の持続日数。SM-2 は null */
  stability: number | null
  /** 復習間隔（日）。stability が無いときのフォールバック */
  interval: number
  /** 忘却回数（間違えの蓄積） */
  lapses?: number
}

/** 実効 stability（日）。FSRS の stability、無ければ SM-2 の interval。 */
function effectiveStability(card: MasteryCardInput): number {
  if (card.stability != null && card.stability > 0) return card.stability
  return Math.max(0, card.interval ?? 0)
}

/**
 * card_states 1件（未学習は null）から定着度を導出する。
 * @param card 学習状態。未学習カードは null（=未学習）
 */
export function deriveMastery(card: MasteryCardInput | null): MasteryLevel {
  if (!card || card.state === 'new') return 'new'

  const lapses = card.lapses ?? 0
  const eff = effectiveStability(card)
  const struggled = lapses >= WEAK_LAPSES

  // 再学習中（直近で忘れた）は苦手
  if (card.state === 'relearning') return 'weak'

  // 学習中：一度でも失敗していれば苦手、それ以外は学習中
  if (card.state === 'learning') return lapses >= 1 ? 'weak' : 'learning'

  // review（復習フェーズ）：間隔で定着度を、間違えの蓄積で苦手側に補正
  if (eff >= MASTERY_THRESHOLDS.mastered) {
    // 十分固まっていれば、過去に苦しんでいても最大「定着中」まで
    return struggled ? 'stable' : 'mastered'
  }
  if (eff >= MASTERY_THRESHOLDS.stable) {
    return struggled ? 'weak' : 'stable'
  }
  // 短い間隔の復習
  return struggled ? 'weak' : 'learning'
}

/**
 * 1単語が複数カード（例: 古文モードA＋B）を持つとき、
 * 一番弱い（＝復習が必要な）レベルを単語の定着度にする。
 */
export function aggregateMastery(levels: MasteryLevel[]): MasteryLevel {
  if (levels.length === 0) return 'new'
  return levels.reduce((a, b) => (MASTERY_ORDER[b] < MASTERY_ORDER[a] ? b : a))
}

/** レベルごとの件数を集計する（フィルタチップのバッジ用）。 */
export function summarizeMastery(levels: MasteryLevel[]): Record<MasteryLevel, number> {
  const counts: Record<MasteryLevel, number> = {
    new: 0,
    weak: 0,
    learning: 0,
    stable: 0,
    mastered: 0,
  }
  for (const l of levels) counts[l] += 1
  return counts
}
