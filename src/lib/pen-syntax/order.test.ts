/**
 * 分析の順序の記録（order.ts）のテスト。
 * 並びの導出（上書き・一手戻す・削除）と、模範の順序・並びの控えの保存を確認する。
 */

import { beforeEach, describe, expect, it } from 'vitest'
import {
  appendOrderHistory,
  describeStep,
  loadModelOrders,
  loadOrderHistory,
  orderKeyFor,
  reduceOrderEvents,
  saveModelOrder,
  deleteModelOrder,
  strokeStartTime,
  type AnalysisStep,
  type OrderEvent,
} from './order'

function apply(key: string, symbol: string, from: number, to: number, at: number): OrderEvent {
  return { kind: 'apply', key, symbol, from, to, at, via: 'pen' }
}

describe('reduceOrderEvents（並びの導出）', () => {
  it('書いた順のまま並ぶ', () => {
    const steps = reduceOrderEvents([
      apply('role:2-2', 'V', 2, 2, 100),
      apply('role:1-1', 'S', 1, 1, 200),
      apply('span:ul:0-1', 'hline', 0, 1, 300),
    ])
    expect(steps.map((s) => s.symbol)).toEqual(['V', 'S', 'hline'])
  })

  it('同じマスへの上書きは前の記入を外し、最後の記入が並びの位置も引き継ぐ（書いた時点）', () => {
    const steps = reduceOrderEvents([
      apply('role:1-1', 'O', 1, 1, 100),
      apply('role:2-2', 'V', 2, 2, 200),
      apply('role:1-1', 'S', 1, 1, 300), // O を S に書き直した
    ])
    expect(steps.map((s) => s.symbol)).toEqual(['V', 'S'])
  })

  it('「一手戻す」は並びの最後の1件を外す', () => {
    const steps = reduceOrderEvents([
      apply('role:2-2', 'V', 2, 2, 100),
      apply('role:1-1', 'S', 1, 1, 200),
      { kind: 'undo', at: 250 },
    ])
    expect(steps.map((s) => s.symbol)).toEqual(['V'])
  })

  it('一覧からの削除は同じ鍵の最新の1件を外す', () => {
    const steps = reduceOrderEvents([
      apply('span:adv:4-5', 'paren-close', 4, 5, 100),
      apply('role:2-2', 'V', 2, 2, 200),
      { kind: 'remove', key: 'span:adv:4-5', at: 300 },
    ])
    expect(steps.map((s) => s.symbol)).toEqual(['V'])
  })

  it('空の時系列は空の並び', () => {
    expect(reduceOrderEvents([])).toEqual([])
  })
})

describe('orderKeyFor（照合用の鍵）', () => {
  it('品詞の英字は pos:添字', () => {
    expect(orderKeyFor('v', { from: 2, to: 2 })).toBe('pos:2')
  })
  it('働きの文字と▷は role:範囲', () => {
    expect(orderKeyFor('S', { from: 1, to: 1 })).toBe('role:1-1')
    expect(orderKeyFor('triangle', { from: 3, to: 3 })).toBe('role:3-3')
  })
  it('開き括弧は open:種類:添字・閉じ括弧はまとまりの鍵になる', () => {
    expect(orderKeyFor('paren-open', { from: 4, to: 4 })).toBe('open:adv:4')
    expect(orderKeyFor('paren-close', { from: 4, to: 6 })).toBe('span:adv:4-6')
  })
  it('下線・波線・○囲み漢字にも鍵が付く', () => {
    expect(orderKeyFor('hline', { from: 0, to: 1 })).toBe('span:ul:0-1')
    expect(orderKeyFor('wavy', { from: 2, to: 3 })).toBe('extra:wavy:2-3')
    expect(orderKeyFor('仮', { from: 5, to: 5 })).toBe('extra:仮:5-5')
  })
})

describe('describeStep / strokeStartTime', () => {
  const tokens = ['The', 'girl', 'standing', 'by', 'the', 'door', 'is', 'my', 'sister', '.']
  it('記号の表示名と単語列で1行にする', () => {
    const step: AnalysisStep = { symbol: 'S', key: 'role:1-1', from: 1, to: 1, at: 0, via: 'pen' }
    expect(describeStep(step, tokens)).toBe('S｜girl')
  })
  it('長い単語列は切り詰める', () => {
    const step: AnalysisStep = { symbol: 'angle-close', key: 'span:adjm:0-8', from: 0, to: 8, at: 0, via: 'pen' }
    expect(describeStep(step, tokens)).toContain('…')
  })
  it('筆画の開始時刻は1画目の最初の点から取る（無ければ null）', () => {
    expect(strokeStartTime([[{ x: 0, y: 0, t: 123 }]])).toBe(123)
    expect(strokeStartTime([[{ x: 0, y: 0 }]])).toBeNull()
    expect(strokeStartTime([])).toBeNull()
  })
})

describe('模範の順序・並びの控えの保存（localStorage）', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  const steps: AnalysisStep[] = [
    { symbol: 'V', key: 'role:2-2', from: 2, to: 2, at: 100, via: 'pen' },
  ]

  it('模範の順序を保存・読込・削除できる', () => {
    const after = saveModelOrder({ problemId: 'ex1', problemTitle: '①', steps, summary: ['V｜plays'] })
    expect(after).toHaveLength(1)
    expect(loadModelOrders()[0].problemId).toBe('ex1')
    const removed = deleteModelOrder(after[0].id)
    expect(removed).toHaveLength(0)
    expect(loadModelOrders()).toHaveLength(0)
  })

  it('並びの控えは上限を超えると古いものから消える', () => {
    for (let i = 0; i < 35; i++) {
      appendOrderHistory({
        problemId: `p${i}`,
        problemTitle: `t${i}`,
        steps,
        percent: 100,
        gradedAt: new Date().toISOString(),
      })
    }
    const hist = loadOrderHistory()
    expect(hist).toHaveLength(30)
    expect(hist[0].problemId).toBe('p5')
    expect(hist[29].problemId).toBe('p34')
  })

  it('壊れた保存データは空として読み込む', () => {
    window.localStorage.setItem('pen-syntax-model-orders-v1', '{broken')
    expect(loadModelOrders()).toEqual([])
  })
})
