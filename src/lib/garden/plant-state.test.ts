import { describe, it, expect } from 'vitest'
import {
  derivePlantState,
  summarizeGarden,
  GROWTH_THRESHOLDS,
  CARE_THRESHOLDS,
  type PlantCardInput,
} from './plant-state'

const NOW = new Date('2026-06-15T12:00:00Z')

/** NOW から days 日後の Date */
function daysFromNow(days: number): Date {
  return new Date(NOW.getTime() + days * 86_400_000)
}

/** テスト用に card_states を組み立てる（既定は健やかな成株） */
function card(overrides: Partial<PlantCardInput> = {}): PlantCardInput {
  return {
    state: 'review',
    stability: 30,
    interval: 30,
    due: daysFromNow(1), // まだ期限前
    lapses: 0,
    ...overrides,
  }
}

describe('derivePlantState — 成長段階', () => {
  it('未学習（null）は種・健やか', () => {
    const p = derivePlantState(null, NOW)
    expect(p.growth).toBe('seed')
    expect(p.care).toBe('healthy')
    expect(p.needsWater).toBe(false)
    expect(p.isDead).toBe(false)
  })

  it("state='new' は種", () => {
    const p = derivePlantState(card({ state: 'new', stability: null, interval: 0 }), NOW)
    expect(p.growth).toBe('seed')
  })

  it('learning で stability が小さいと芽', () => {
    const p = derivePlantState(card({ state: 'learning', stability: 0.5, interval: 0 }), NOW)
    expect(p.growth).toBe('sprout')
  })

  it('stability < 21 は苗', () => {
    expect(derivePlantState(card({ stability: 10, interval: 10 }), NOW).growth).toBe('seedling')
  })

  it('21 <= stability < 60 は成株', () => {
    expect(derivePlantState(card({ stability: 30 }), NOW).growth).toBe('mature')
  })

  it('stability >= 60 は開花・結実', () => {
    expect(derivePlantState(card({ stability: 80, interval: 80 }), NOW).growth).toBe('blooming')
  })

  it('成長段階の境界値', () => {
    // sprout/seedling 境界 = 2
    expect(derivePlantState(card({ state: 'learning', stability: GROWTH_THRESHOLDS.sprout - 0.01, interval: 0 }), NOW).growth).toBe('sprout')
    expect(derivePlantState(card({ stability: GROWTH_THRESHOLDS.sprout, interval: 2 }), NOW).growth).toBe('seedling')
    // seedling/mature 境界 = 21
    expect(derivePlantState(card({ stability: GROWTH_THRESHOLDS.seedling - 0.01 }), NOW).growth).toBe('seedling')
    expect(derivePlantState(card({ stability: GROWTH_THRESHOLDS.seedling }), NOW).growth).toBe('mature')
    // mature/blooming 境界 = 60
    expect(derivePlantState(card({ stability: GROWTH_THRESHOLDS.mature - 0.01 }), NOW).growth).toBe('mature')
    expect(derivePlantState(card({ stability: GROWTH_THRESHOLDS.mature }), NOW).growth).toBe('blooming')
  })

  it('SM-2 カード（stability=null）は interval を成長軸に使う', () => {
    const p = derivePlantState(card({ stability: null, interval: 45 }), NOW)
    expect(p.growth).toBe('mature')
    expect(p.effectiveStability).toBe(45)
  })
})

describe('derivePlantState — 世話状態（枯れ）', () => {
  it('期限前は健やか・水やり不要', () => {
    const p = derivePlantState(card({ due: daysFromNow(3) }), NOW)
    expect(p.care).toBe('healthy')
    expect(p.needsWater).toBe(false)
    expect(p.overdueDays).toBe(0)
  })

  it('わずかに超過は乾き気味（要水やり）', () => {
    // interval 30, 超過 3日 → ratio 0.1
    const p = derivePlantState(card({ interval: 30, due: daysFromNow(-3) }), NOW)
    expect(p.care).toBe('thirsty')
    expect(p.needsWater).toBe(true)
    expect(p.overdueDays).toBeCloseTo(3, 5)
  })

  it('interval の 0.5〜1.5倍 超過はしおれ', () => {
    // interval 10, 超過 8日 → ratio 0.8
    const p = derivePlantState(card({ interval: 10, due: daysFromNow(-8) }), NOW)
    expect(p.care).toBe('wilting')
  })

  it('interval の 1.5〜4倍 超過は枯れかけ', () => {
    // interval 10, 超過 20日 → ratio 2.0
    const p = derivePlantState(card({ interval: 10, due: daysFromNow(-20) }), NOW)
    expect(p.care).toBe('dryingOut')
  })

  it('interval の 4倍以上 超過は枯れ（死）', () => {
    // interval 10, 超過 50日 → ratio 5.0
    const p = derivePlantState(card({ interval: 10, due: daysFromNow(-50) }), NOW)
    expect(p.care).toBe('withered')
    expect(p.isDead).toBe(true)
    expect(p.needsWater).toBe(true)
  })

  it('世話状態の境界値（ratio）', () => {
    const interval = 10
    // thirsty/wilting 境界 = 0.5 → 超過 5日
    expect(derivePlantState(card({ interval, due: daysFromNow(-(CARE_THRESHOLDS.thirsty * interval) + 0.001) }), NOW).care).toBe('thirsty')
    expect(derivePlantState(card({ interval, due: daysFromNow(-(CARE_THRESHOLDS.thirsty * interval)) }), NOW).care).toBe('wilting')
    // dryingOut/withered 境界 = 4 → 超過 40日
    expect(derivePlantState(card({ interval, due: daysFromNow(-(CARE_THRESHOLDS.dryingOut * interval)) }), NOW).care).toBe('withered')
  })

  it('interval=0 でもゼロ除算しない（denom=1）', () => {
    // 超過2日 / max(1,0)=1 → ratio 2.0 → 枯れかけ
    const p = derivePlantState(card({ state: 'learning', stability: 0.5, interval: 0, due: daysFromNow(-2) }), NOW)
    expect(p.care).toBe('dryingOut')
  })

  it('struggled は lapses>0 で true', () => {
    expect(derivePlantState(card({ lapses: 2 }), NOW).struggled).toBe(true)
    expect(derivePlantState(card({ lapses: 0 }), NOW).struggled).toBe(false)
  })
})

describe('summarizeGarden', () => {
  it('庭全体を集計する', () => {
    const cards: (PlantCardInput | null)[] = [
      null, // 種
      card({ state: 'new', stability: null, interval: 0 }), // 種
      card({ state: 'learning', stability: 1, interval: 0 }), // 芽
      card({ stability: 10, interval: 10 }), // 苗
      card({ stability: 30 }), // 成株（健やか）
      card({ stability: 80, interval: 80 }), // 開花
      card({ interval: 10, due: daysFromNow(-5) }), // しおれ（要水やり）
      card({ interval: 10, due: daysFromNow(-50) }), // 枯れ（要水やり・死）
    ]
    const s = summarizeGarden(cards, NOW)
    expect(s.total).toBe(8)
    expect(s.byStage.seed).toBe(2)
    expect(s.byStage.sprout).toBe(1)
    expect(s.byStage.seedling).toBe(1)
    // 成株: stability30 + しおれ(既定stability30) + 枯れ(既定stability30) = 3
    expect(s.byStage.mature).toBe(3)
    expect(s.byStage.blooming).toBe(1)
    expect(s.needWater).toBe(2)
    expect(s.dead).toBe(1)
  })
})
