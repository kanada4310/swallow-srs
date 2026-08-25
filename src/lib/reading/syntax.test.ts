import { describe, it, expect } from 'vitest'
import {
  emptyAnswer,
  gradeSyntax,
  isPunct,
  modelAnswer,
  SYNTAX_PROBLEMS,
  type SyntaxProblem,
} from './syntax'

const byId = (id: string): SyntaxProblem => SYNTAX_PROBLEMS.find((p) => p.id === id)!

describe('構文の練習', () => {
  it('練習問題が3問ある', () => {
    expect(SYNTAX_PROBLEMS).toHaveLength(3)
  })

  it('句読点は働きを問わない', () => {
    expect(isPunct('.')).toBe(true)
    expect(isPunct('tennis')).toBe(false)
  })

  it('正解どおりに書き込めば満点になる', () => {
    SYNTAX_PROBLEMS.forEach((p) => {
      const g = gradeSyntax(p, modelAnswer(p))
      expect(g.percent, p.id).toBe(100)
      expect(g.feedback.filter((f) => f.tone === 'bad')).toHaveLength(0)
    })
  })

  it('未記入は0点で、正解を添えて返す', () => {
    const p = byId('ex1')
    const g = gradeSyntax(p, emptyAnswer(p))
    expect(g.got).toBe(0)
    expect(g.percent).toBe(0)
    expect(g.posMark[1].correct).toBe('名詞')
    // まとまりの見落としも指摘する
    expect(g.feedback.some((f) => f.text.includes('見落とし'))).toBe(true)
  })

  it('筋の通る別解は △ として受理する', () => {
    const p = byId('ex2')
    const answer = modelAnswer(p)
    answer.pos[2] = '動詞' // 分詞を動詞と見る
    const g = gradeSyntax(p, answer)
    expect(g.posMark[2].mark).toBe('alt')
    expect(g.percent).toBe(100)
    expect(g.feedback.some((f) => f.tone === 'alt')).toBe(true)
  })

  it('曖昧文はどちらの掛かり先でも正解にする', () => {
    const p = byId('ex3')
    const asAdjective = modelAnswer(p)
    const asAdverb = {
      ...asAdjective,
      spans: asAdjective.spans.map((s) => (s.from === 4 ? { ...s, type: 'adv' as const } : s)),
    }
    expect(gradeSyntax(p, asAdjective).percent).toBe(100)
    expect(gradeSyntax(p, asAdverb).percent).toBe(100)
  })

  it('正解に無いまとまりは余分として指摘する', () => {
    const p = byId('ex1')
    const answer = modelAnswer(p)
    answer.spans.push({ from: 2, to: 3, type: 'n' })
    const g = gradeSyntax(p, answer)
    expect(g.feedback.some((f) => f.text.includes('余分なまとまり'))).toBe(true)
    expect(g.percent).toBeLessThan(100)
  })

  it('まとまりの種類が違えば正解を示す', () => {
    const p = byId('ex1')
    const answer = modelAnswer(p)
    answer.spans = answer.spans.map((s) => (s.from === 4 ? { ...s, type: 'n' as const } : s))
    const g = gradeSyntax(p, answer)
    expect(g.feedback.some((f) => f.text.includes('正解は （ ）'))).toBe(true)
  })
})
