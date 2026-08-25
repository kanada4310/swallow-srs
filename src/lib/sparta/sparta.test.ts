import { describe, it, expect } from 'vitest'
import {
  spartaDayKey,
  periodStart,
  periodEndExclusive,
  deriveSpartaProgress,
  countAchieved,
  validateSpartaInput,
  type SpartaProgramInput,
} from './logic'
import type { MasteryCardInput } from '@/lib/wordbook/mastery'

/** review 状態・実効安定度 days 日のカード */
function reviewCard(days: number, lapses = 0): MasteryCardInput {
  return { state: 'review', stability: days, interval: days, lapses }
}

function baseProgram(overrides: Partial<SpartaProgramInput> = {}): SpartaProgramInput {
  return {
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    targetCardCount: null,
    goalMastery: 'stable',
    baselineAchievedCount: 0,
    status: 'active',
    ...overrides,
  }
}

/** 日本時間の時刻を作る */
function jst(iso: string): Date {
  return new Date(`${iso}+09:00`)
}

describe('spartaDayKey（日本時間・4時区切り）', () => {
  it('日本時間の朝4時より前は前日の学習日になる', () => {
    expect(spartaDayKey(jst('2026-08-10T03:59:00'))).toBe('2026-08-09')
    expect(spartaDayKey(jst('2026-08-10T04:00:00'))).toBe('2026-08-10')
    expect(spartaDayKey(jst('2026-08-10T23:30:00'))).toBe('2026-08-10')
  })

  it('サーバーが UTC でも日本の体感日付になる（UTC 20:00 = JST 翌5:00）', () => {
    expect(spartaDayKey(new Date('2026-08-09T20:00:00Z'))).toBe('2026-08-10')
  })
})

describe('期間の境界', () => {
  it('periodStart は開始日の日本時間4:00', () => {
    expect(periodStart('2026-08-01').toISOString()).toBe('2026-07-31T19:00:00.000Z')
  })
  it('periodEndExclusive は終了日翌日の日本時間4:00', () => {
    expect(periodEndExclusive('2026-08-31').toISOString()).toBe('2026-08-31T19:00:00.000Z')
  })
})

describe('deriveSpartaProgress: 表示状態', () => {
  const cards: Array<MasteryCardInput | null> = [null]

  it('開始前は upcoming', () => {
    const p = deriveSpartaProgress(baseProgram(), cards, [], jst('2026-07-20T12:00:00'))
    expect(p.phase).toBe('upcoming')
    expect(p.daysElapsed).toBe(0)
    expect(p.daysRemaining).toBe(31)
    expect(p.days).toHaveLength(0)
  })

  it('期間内は active', () => {
    const p = deriveSpartaProgress(baseProgram(), cards, [], jst('2026-08-10T12:00:00'))
    expect(p.phase).toBe('active')
    expect(p.daysTotal).toBe(31)
    expect(p.daysElapsed).toBe(10)
    expect(p.daysRemaining).toBe(21)
  })

  it('終了後は ended・残り0日', () => {
    const p = deriveSpartaProgress(baseProgram(), cards, [], jst('2026-09-05T12:00:00'))
    expect(p.phase).toBe('ended')
    expect(p.daysElapsed).toBe(31)
    expect(p.daysRemaining).toBe(0)
  })

  it('中止は期間に関係なく canceled', () => {
    const p = deriveSpartaProgress(
      baseProgram({ status: 'canceled' }),
      cards,
      [],
      jst('2026-08-10T12:00:00')
    )
    expect(p.phase).toBe('canceled')
  })

  it('終了日の23時はまだ active（4時区切り）', () => {
    const p = deriveSpartaProgress(baseProgram(), cards, [], jst('2026-08-31T23:00:00'))
    expect(p.phase).toBe('active')
    expect(p.daysRemaining).toBe(0)
  })
})

describe('deriveSpartaProgress: 習得数と進捗率', () => {
  const now = jst('2026-08-10T12:00:00')

  it('習得（stable 基準）は実効7日以上を数える', () => {
    const cards = [reviewCard(30), reviewCard(10), reviewCard(3), null]
    const p = deriveSpartaProgress(baseProgram(), cards, [], now)
    expect(p.totalCards).toBe(4)
    expect(p.achievedNow).toBe(2) // 30日・10日
    expect(p.masteryBreakdown.mastered).toBe(1)
    expect(p.masteryBreakdown.stable).toBe(1)
    expect(p.masteryBreakdown.learning).toBe(1)
    expect(p.masteryBreakdown.new).toBe(1)
  })

  it('mastered 基準では21日以上だけを習得と数える', () => {
    const cards = [reviewCard(30), reviewCard(10), null]
    const p = deriveSpartaProgress(baseProgram({ goalMastery: 'mastered' }), cards, [], now)
    expect(p.achievedNow).toBe(1)
  })

  it('目標未指定なら「全カード - 開始時習得」が目標', () => {
    const cards = [reviewCard(30), reviewCard(10), reviewCard(3), null]
    const p = deriveSpartaProgress(baseProgram({ baselineAchievedCount: 1 }), cards, [], now)
    expect(p.targetCount).toBe(3) // 4 - 1
    expect(p.achievedInPeriod).toBe(1) // 2 - 1
    expect(p.progressPct).toBe(33)
  })

  it('目標指定ありなら期間の成果/目標で計算', () => {
    const cards = [reviewCard(30), reviewCard(10), reviewCard(8), null]
    const p = deriveSpartaProgress(
      baseProgram({ targetCardCount: 2, baselineAchievedCount: 1 }),
      cards,
      [],
      now
    )
    expect(p.achievedInPeriod).toBe(2) // 3 - 1
    expect(p.progressPct).toBe(100)
  })

  it('進捗率は100を超えない・目標0なら100', () => {
    const cards = [reviewCard(30), reviewCard(30)]
    const over = deriveSpartaProgress(baseProgram({ targetCardCount: 1 }), cards, [], now)
    expect(over.progressPct).toBe(100)
    const zero = deriveSpartaProgress(baseProgram({ baselineAchievedCount: 2 }), cards, [], now)
    expect(zero.targetCount).toBe(0)
    expect(zero.progressPct).toBe(100)
  })

  it('現在の習得数が開始時より減っても期間の成果は0未満にならない', () => {
    const cards = [reviewCard(3), null]
    const p = deriveSpartaProgress(baseProgram({ baselineAchievedCount: 5 }), cards, [], now)
    expect(p.achievedInPeriod).toBe(0)
  })
})

describe('deriveSpartaProgress: 日々の実施と連続日数', () => {
  const now = jst('2026-08-05T12:00:00')

  it('期間内の学習日ごとの実施と学習日数を数える', () => {
    const reviews = [
      jst('2026-08-01T10:00:00'),
      jst('2026-08-01T22:00:00'),
      jst('2026-08-03T05:00:00'),
      jst('2026-07-31T12:00:00'), // 期間外（前）
    ]
    const p = deriveSpartaProgress(baseProgram(), [null], reviews, now)
    expect(p.days).toHaveLength(5) // 8/1〜8/5
    expect(p.days[0]).toEqual({ key: '2026-08-01', count: 2 })
    expect(p.days[2]).toEqual({ key: '2026-08-03', count: 1 })
    expect(p.daysStudied).toBe(2)
    expect(p.studiedToday).toBe(false)
  })

  it('深夜2時の学習は前日の実施に数える', () => {
    const reviews = [jst('2026-08-04T02:00:00')] // 学習日 8/3
    const p = deriveSpartaProgress(baseProgram(), [null], reviews, now)
    expect(p.days.find(d => d.key === '2026-08-03')?.count).toBe(1)
  })

  it('連続日数: 今日実施済みなら今日から遡る', () => {
    const reviews = [
      jst('2026-08-03T10:00:00'),
      jst('2026-08-04T10:00:00'),
      jst('2026-08-05T10:00:00'),
    ]
    const p = deriveSpartaProgress(baseProgram(), [null], reviews, now)
    expect(p.studiedToday).toBe(true)
    expect(p.currentStreak).toBe(3)
  })

  it('連続日数: 今日未実施でも昨日から継続中と数える', () => {
    const reviews = [jst('2026-08-03T10:00:00'), jst('2026-08-04T10:00:00')]
    const p = deriveSpartaProgress(baseProgram(), [null], reviews, now)
    expect(p.studiedToday).toBe(false)
    expect(p.currentStreak).toBe(2)
  })

  it('終了後は終了日までの実施だけを見る', () => {
    const reviews = [
      jst('2026-08-30T10:00:00'),
      jst('2026-08-31T10:00:00'),
      jst('2026-09-02T10:00:00'), // 期間外（後）
    ]
    const p = deriveSpartaProgress(baseProgram(), [null], reviews, jst('2026-09-10T12:00:00'))
    expect(p.days).toHaveLength(31)
    expect(p.daysStudied).toBe(2)
    expect(p.currentStreak).toBe(2) // 終了日時点の連続（8/30-8/31）をサマリーとして返す
  })
})

describe('countAchieved', () => {
  it('基準以上のカードを数える', () => {
    const cards = [reviewCard(30), reviewCard(10), reviewCard(3), null]
    expect(countAchieved(cards, 'stable')).toBe(2)
    expect(countAchieved(cards, 'mastered')).toBe(1)
  })
})

describe('validateSpartaInput', () => {
  const valid = {
    deckIds: ['d1'],
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    targetCardCount: 1000,
    goalMastery: 'stable',
  }

  it('正しい入力は null を返す', () => {
    expect(validateSpartaInput(valid)).toBeNull()
    expect(validateSpartaInput({ ...valid, targetCardCount: null })).toBeNull()
    expect(validateSpartaInput({ ...valid, goalMastery: 'mastered' })).toBeNull()
  })

  it('デッキ未選択・日付不正・期間逆転・目標不正・基準不正を弾く', () => {
    expect(validateSpartaInput({ ...valid, deckIds: [] })).toBeTruthy()
    expect(validateSpartaInput({ ...valid, startDate: '2026/08/01' })).toBeTruthy()
    expect(validateSpartaInput({ ...valid, endDate: '2026-07-31' })).toBeTruthy()
    expect(validateSpartaInput({ ...valid, targetCardCount: 0 })).toBeTruthy()
    expect(validateSpartaInput({ ...valid, targetCardCount: 1.5 })).toBeTruthy()
    expect(validateSpartaInput({ ...valid, goalMastery: 'weak' })).toBeTruthy()
  })
})
