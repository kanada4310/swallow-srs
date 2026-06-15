/**
 * 記憶のいきもの育成（Phase 10.1）— 株のステータス導出（純ロジック）
 *
 * 既存の FSRS `card_states` だけから、植物（果樹・花き）の
 * 「成長段階」と「世話状態（枯れ含む）」を導出する。学習エンジンには一切触れず、
 * この上にコスメティック層（描画）を被せる。
 *
 * 仕様: docs/memory-creatures-design.md
 *  - 成長段階: 種 → 芽 → 苗 → 成株 → 開花・結実   ← `stability`（無ければ `interval`）
 *  - 世話状態: 健やか → 乾き気味 → しおれ → 枯れかけ → 枯れ  ← `due` 超過の度合い
 *  - 枯れ（死）は見た目のみ。card_states は不変。水やり（=復習）で芽吹き直し。
 */

/** 成長段階（種→芽→苗→成株→開花・結実） */
export type GrowthStage = 'seed' | 'sprout' | 'seedling' | 'mature' | 'blooming'

/** 世話状態（健やか→乾き気味→しおれ→枯れかけ→枯れ） */
export type CareState = 'healthy' | 'thirsty' | 'wilting' | 'dryingOut' | 'withered'

/**
 * 導出に必要な card_states の最小サブセット。
 * Dexie/Supabase の型に依存させず、純粋・テスト容易にするため構造型で受ける。
 */
export interface PlantCardInput {
  /** 'new' | 'learning' | 'review' | 'relearning' */
  state: string
  /** FSRS の記憶の持続日数。SM-2 カードは null */
  stability: number | null
  /** 復習間隔（日）。stability が無いときの成長軸フォールバック */
  interval: number
  /** 次回復習期限 */
  due: Date | string
  /** 忘却回数（弱り） */
  lapses?: number
  /** FSRS 難易度 1..10（育てにくさの個性。導出には任意） */
  difficulty?: number | null
}

export interface PlantState {
  growth: GrowthStage
  care: CareState
  /** care === 'withered'（枯れ＝死。ただし復習で復活可能） */
  isDead: boolean
  /** 期限を過ぎている（=今日水やりが必要） */
  needsWater: boolean
  /** 期限超過の日数（>=0、未到来は 0） */
  overdueDays: number
  /** 成長軸に使った実効 stability（日）= stability ?? interval */
  effectiveStability: number
  /** 過去に弱った（lapses > 0） */
  struggled: boolean
}

/**
 * 成長段階のしきい値（実効 stability の日数）。
 * 実データ検証後に調整する（FSRS の desired retention に依存）。
 */
export const GROWTH_THRESHOLDS = {
  /** これ未満は芽（< 2日） */
  sprout: 2,
  /** これ未満は苗（< 21日） */
  seedling: 21,
  /** これ未満は成株（< 60日）、以上は開花・結実 */
  mature: 60,
} as const

/**
 * 世話状態のしきい値（期限超過日数 ÷ 直近 interval の比）。
 * interval の何倍ほど放置されたかで、しおれ→枯れへと進める。
 */
export const CARE_THRESHOLDS = {
  /** これ未満は乾き気味（超過 < interval の 0.5倍） */
  thirsty: 0.5,
  /** これ未満はしおれ（< 1.5倍） */
  wilting: 1.5,
  /** これ未満は枯れかけ（< 4倍）、以上は枯れ */
  dryingOut: 4,
} as const

const MS_PER_DAY = 86_400_000

/** 実効 stability（日）。FSRS の stability、無ければ SM-2 の interval。 */
function effectiveStability(card: PlantCardInput): number {
  if (card.stability != null && card.stability > 0) return card.stability
  return Math.max(0, card.interval ?? 0)
}

/** 実効 stability から成長段階を決める（new は呼び出し側で種として扱う）。 */
function deriveGrowth(eff: number): GrowthStage {
  if (eff < GROWTH_THRESHOLDS.sprout) return 'sprout'
  if (eff < GROWTH_THRESHOLDS.seedling) return 'seedling'
  if (eff < GROWTH_THRESHOLDS.mature) return 'mature'
  return 'blooming'
}

/** 期限超過日数と直近 interval から世話状態を決める。 */
function deriveCare(overdueDays: number, interval: number): CareState {
  if (overdueDays <= 0) return 'healthy'
  const denom = Math.max(1, interval)
  const ratio = overdueDays / denom
  if (ratio < CARE_THRESHOLDS.thirsty) return 'thirsty'
  if (ratio < CARE_THRESHOLDS.wilting) return 'wilting'
  if (ratio < CARE_THRESHOLDS.dryingOut) return 'dryingOut'
  return 'withered'
}

/**
 * card_states 1件（未学習は null）から株の状態を導出する。
 * @param card 学習状態。未学習カードは null（=種・健やか）
 * @param now  現在時刻（テスト用に注入可）
 */
export function derivePlantState(
  card: PlantCardInput | null,
  now: Date = new Date()
): PlantState {
  // 未学習 or new = 種。まだ植わっただけで世話は不要。
  if (!card || card.state === 'new') {
    return {
      growth: 'seed',
      care: 'healthy',
      isDead: false,
      needsWater: false,
      overdueDays: 0,
      effectiveStability: 0,
      struggled: (card?.lapses ?? 0) > 0,
    }
  }

  const eff = effectiveStability(card)
  const dueMs = (card.due instanceof Date ? card.due : new Date(card.due)).getTime()
  const overdueDays = Math.max(0, (now.getTime() - dueMs) / MS_PER_DAY)
  const care = deriveCare(overdueDays, card.interval ?? 0)

  return {
    growth: deriveGrowth(eff),
    care,
    isDead: care === 'withered',
    needsWater: overdueDays > 0,
    overdueDays,
    effectiveStability: eff,
    struggled: (card.lapses ?? 0) > 0,
  }
}

export interface GardenSummary {
  /** 株の総数 */
  total: number
  /** 今日水やりが必要な株数（needsWater） */
  needWater: number
  /** 枯れている株数（isDead） */
  dead: number
  /** 成長段階ごとの株数 */
  byStage: Record<GrowthStage, number>
}

/**
 * デッキ（=庭）全体のサマリーを集計する。
 * ハビタットビューの「今日 水やりが必要 N株」等に使う。
 */
export function summarizeGarden(
  cards: (PlantCardInput | null)[],
  now: Date = new Date()
): GardenSummary {
  const byStage: Record<GrowthStage, number> = {
    seed: 0,
    sprout: 0,
    seedling: 0,
    mature: 0,
    blooming: 0,
  }
  let needWater = 0
  let dead = 0

  for (const card of cards) {
    const plant = derivePlantState(card, now)
    byStage[plant.growth] += 1
    if (plant.needsWater) needWater += 1
    if (plant.isDead) dead += 1
  }

  return { total: cards.length, needWater, dead, byStage }
}
