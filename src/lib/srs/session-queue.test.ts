import { describe, it, expect } from 'vitest'
import { pickFromQueues, LEARN_AHEAD_LIMIT_MINUTES } from './session-queue'

// テスト用の最小カード型
type Card = { id: string }
const c = (id: string): Card => ({ id })

const NOW = 1_000_000_000_000
const MIN = 60_000

describe('pickFromQueues (learn-ahead)', () => {
  it('期限到来済みの学習カードが最優先で出る', () => {
    const res = pickFromQueues<Card>({
      mainQueue: [c('m1')],
      mainIndex: 0,
      learningQueue: [{ card: c('L1'), dueAt: NOW - 1 }],
      now: NOW,
    })
    expect(res).toEqual({ card: c('L1'), fromLearning: true, waiting: false })
  })

  it('学習カードが未来なら main キューを出す', () => {
    const res = pickFromQueues<Card>({
      mainQueue: [c('m1'), c('m2')],
      mainIndex: 1,
      learningQueue: [{ card: c('L1'), dueAt: NOW + 5 * MIN }],
      now: NOW,
    })
    expect(res).toEqual({ card: c('m2'), fromLearning: false, waiting: false })
  })

  it('main 空＋学習カードがしきい値以内 → 前倒しで出す（learn-ahead）', () => {
    const res = pickFromQueues<Card>({
      mainQueue: [c('m1')],
      mainIndex: 1, // main 消化済み
      learningQueue: [{ card: c('L1'), dueAt: NOW + 1 * MIN }],
      now: NOW,
    })
    expect(res).toEqual({ card: c('L1'), fromLearning: true, waiting: false })
  })

  it('main 空＋学習カードがしきい値超 → 待機する', () => {
    const res = pickFromQueues<Card>({
      mainQueue: [c('m1')],
      mainIndex: 1,
      learningQueue: [{ card: c('L1'), dueAt: NOW + (LEARN_AHEAD_LIMIT_MINUTES + 1) * MIN }],
      now: NOW,
    })
    expect(res).toEqual({ card: null, fromLearning: false, waiting: true })
  })

  it('しきい値ちょうど（20分後）は「以内」として前倒しで出す（境界値）', () => {
    const res = pickFromQueues<Card>({
      mainQueue: [],
      mainIndex: 0,
      learningQueue: [{ card: c('L1'), dueAt: NOW + LEARN_AHEAD_LIMIT_MINUTES * MIN }],
      now: NOW,
    })
    expect(res).toEqual({ card: c('L1'), fromLearning: true, waiting: false })
  })

  it('複数の学習カードは最短 due のものを前倒しで出す', () => {
    const res = pickFromQueues<Card>({
      mainQueue: [],
      mainIndex: 0,
      learningQueue: [
        { card: c('L-late'), dueAt: NOW + 10 * MIN },
        { card: c('L-soon'), dueAt: NOW + 2 * MIN },
      ],
      now: NOW,
    })
    expect(res.card).toEqual(c('L-soon'))
    expect(res.fromLearning).toBe(true)
    expect(res.waiting).toBe(false)
  })

  it('キューがすべて空ならセッション完了', () => {
    const res = pickFromQueues<Card>({
      mainQueue: [c('m1')],
      mainIndex: 1,
      learningQueue: [],
      now: NOW,
    })
    expect(res).toEqual({ card: null, fromLearning: false, waiting: false })
  })

  it('learnAheadMs=0 なら前倒しせず待機（明示的に無効化できる）', () => {
    const res = pickFromQueues<Card>({
      mainQueue: [],
      mainIndex: 0,
      learningQueue: [{ card: c('L1'), dueAt: NOW + 1 * MIN }],
      now: NOW,
      learnAheadMs: 0,
    })
    expect(res).toEqual({ card: null, fromLearning: false, waiting: true })
  })
})
