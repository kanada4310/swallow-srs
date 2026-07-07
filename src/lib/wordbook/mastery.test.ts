import { describe, it, expect } from 'vitest'
import {
  deriveMastery,
  aggregateMastery,
  summarizeMastery,
  MASTERY_ORDER,
  type MasteryCardInput,
} from './mastery'

const card = (o: Partial<MasteryCardInput>): MasteryCardInput => ({
  state: 'review',
  stability: null,
  interval: 0,
  lapses: 0,
  ...o,
})

describe('deriveMastery', () => {
  it('未学習: null や state=new は new', () => {
    expect(deriveMastery(null)).toBe('new')
    expect(deriveMastery(card({ state: 'new' }))).toBe('new')
  })

  it('relearning は苦手', () => {
    expect(deriveMastery(card({ state: 'relearning', interval: 100 }))).toBe('weak')
  })

  it('learning: 失敗なしは学習中、失敗ありは苦手', () => {
    expect(deriveMastery(card({ state: 'learning', lapses: 0 }))).toBe('learning')
    expect(deriveMastery(card({ state: 'learning', lapses: 1 }))).toBe('weak')
  })

  it('review 短い間隔は学習中', () => {
    expect(deriveMastery(card({ state: 'review', interval: 3 }))).toBe('learning')
  })

  it('review 7〜21日は定着中', () => {
    expect(deriveMastery(card({ state: 'review', interval: 10 }))).toBe('stable')
  })

  it('review 21日以上は定着済み', () => {
    expect(deriveMastery(card({ state: 'review', interval: 30 }))).toBe('mastered')
    expect(deriveMastery(card({ state: 'review', stability: 45, interval: 1 }))).toBe('mastered')
  })

  it('stability を interval より優先する', () => {
    // interval は短いが stability が長い → 定着済み
    expect(deriveMastery(card({ state: 'review', stability: 40, interval: 2 }))).toBe('mastered')
  })

  it('lapses が蓄積した未固定の語は苦手に補正', () => {
    // 間隔は定着中レンジだが lapses>=2 → 苦手
    expect(deriveMastery(card({ state: 'review', interval: 10, lapses: 2 }))).toBe('weak')
    // 短い間隔＋lapses → 苦手
    expect(deriveMastery(card({ state: 'review', interval: 3, lapses: 3 }))).toBe('weak')
  })

  it('十分固まっていれば過去に苦しんでも最大で定着中どまり', () => {
    expect(deriveMastery(card({ state: 'review', interval: 60, lapses: 5 }))).toBe('stable')
  })
})

describe('aggregateMastery', () => {
  it('空は new', () => {
    expect(aggregateMastery([])).toBe('new')
  })
  it('一番弱いレベルを採用する', () => {
    expect(aggregateMastery(['mastered', 'weak'])).toBe('weak')
    expect(aggregateMastery(['stable', 'mastered'])).toBe('stable')
    expect(aggregateMastery(['mastered', 'mastered'])).toBe('mastered')
    expect(aggregateMastery(['new', 'learning'])).toBe('new')
  })
})

describe('summarizeMastery', () => {
  it('レベルごとに件数を数える', () => {
    const counts = summarizeMastery(['weak', 'weak', 'new', 'mastered'])
    expect(counts.weak).toBe(2)
    expect(counts.new).toBe(1)
    expect(counts.mastered).toBe(1)
    expect(counts.learning).toBe(0)
    expect(counts.stable).toBe(0)
  })
})

describe('MASTERY_ORDER', () => {
  it('苦手が最も手をかけるべき（最小）', () => {
    expect(MASTERY_ORDER.weak).toBeLessThan(MASTERY_ORDER.new)
    expect(MASTERY_ORDER.new).toBeLessThan(MASTERY_ORDER.learning)
    expect(MASTERY_ORDER.learning).toBeLessThan(MASTERY_ORDER.stable)
    expect(MASTERY_ORDER.stable).toBeLessThan(MASTERY_ORDER.mastered)
  })
})
