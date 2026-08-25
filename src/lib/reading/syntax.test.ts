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
    expect(g.posMark[1].correct).toBe('n') // 正解は英字略記で示す
    // まとまりの見落としも指摘する
    expect(g.feedback.some((f) => f.text.includes('見落とし'))).toBe(true)
  })

  it('品詞は英字略記（n・v・a・ad・aux・p）で書いても正解になる', () => {
    const p = byId('ex1')
    const answer = modelAnswer(p)
    // 正解表は漢字名（代名詞・名詞・動詞・副詞…）だが、英字で答えても同値として採点する
    answer.pos = ['n', 'n', 'v', 'n', 'ad', 'ad', null]
    const g = gradeSyntax(p, answer)
    expect(g.percent).toBe(100)
  })

  it('英字は動詞と分詞を区別しない（どちらも v で正解）', () => {
    const p = byId('ex2')
    const answer = modelAnswer(p)
    answer.pos[2] = 'v' // 正解表は「分詞」（別解: 動詞）
    const g = gradeSyntax(p, answer)
    expect(g.posMark[2].mark).toBe('ok')
    expect(g.percent).toBe(100)
  })

  it('英字でも誤りは誤りとして指摘し、正解を英字で示す', () => {
    const p = byId('ex1')
    const answer = modelAnswer(p)
    answer.pos[4] = 'n' // very（副詞=ad）を n と書いた
    const g = gradeSyntax(p, answer)
    expect(g.posMark[4].mark).toBe('bad')
    expect(g.posMark[4].correct).toBe('ad')
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
