import { describe, it, expect } from 'vitest'
import {
  bracketDepths,
  emptyAnswer,
  gradeSyntax,
  isPunct,
  modelAnswer,
  roleBase,
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

  it('働きのダッシュ（深さの印）は付けても付けなくても同じ扱いになる', () => {
    const p = byId('ex1')
    const answer = modelAnswer(p)
    answer.role[1] = 'S′' // 正解表は S。深さの印は括弧から自動判定できるので同値
    expect(gradeSyntax(p, answer).roleMark[1].mark).toBe('ok')
    answer.role[1] = 'O′'
    expect(gradeSyntax(p, answer).roleMark[1].mark).toBe('bad')
  })

  it('例外の印は1字と2字を同じ扱いにする（同 ≡ 同格）', () => {
    const p = byId('ex1')
    const answer = modelAnswer(p)
    answer.role[1] = '同格'
    // 正解表が S なので、同格 は当然ちがう。表記の言い換えだけを揃える働きであることを確かめる
    expect(gradeSyntax(p, answer).roleMark[1].mark).toBe('bad')
    expect(roleBase('同格')).toBe('同')
    expect(roleBase('S″')).toBe('S')
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

  it('カッコの入れ子の深さを数える（下線は数えない・同範囲は先に書いたほうが外）', () => {
    expect(
      bracketDepths([
        { from: 2, to: 5, type: 'adjm' }, // 外側
        { from: 3, to: 5, type: 'adv' }, // 1段内側
        { from: 4, to: 5, type: 'ul' }, // 下線（カッコではない）
        { from: 4, to: 4, type: 'n' }, // 2段内側
      ]),
    ).toEqual([0, 1, 0, 2])
    expect(
      bracketDepths([
        { from: 1, to: 3, type: 'n' },
        { from: 1, to: 3, type: 'adv' }, // 同じ範囲: 後から書いたほうが内側
        { from: 5, to: 6, type: 'adv' }, // 離れたカッコは深さ 0
      ]),
    ).toEqual([0, 1, 0])
  })

  describe('任意のまとまり（書いても書かなくても減点しない・2026-08-31 塾長確定）', () => {
    // ex1 の very well: 必須の（ ）に加えて、塊への前置修飾の下線が任意で登録されている
    it('ex1 に「very well」型の任意の下線が登録されている', () => {
      const p = byId('ex1')
      const opt = p.key.spans.filter((s) => s.optional)
      expect(opt).toEqual([
        expect.objectContaining({ from: 4, to: 5, ok: ['ul'], optional: true }),
      ])
    })

    it('書かなくても見落としにならない（正解表示にも含めない）', () => {
      const p = byId('ex1')
      const answer = modelAnswer(p)
      // 第一解に任意の下線は含まれない
      expect(answer.spans.filter((s) => s.from === 4)).toHaveLength(1)
      const g = gradeSyntax(p, answer)
      expect(g.percent).toBe(100)
      expect(g.feedback.filter((f) => f.tone === 'bad')).toHaveLength(0)
    })

    it('書けば受理され、得点（分母・分子）は書かないときと変わらない', () => {
      const p = byId('ex1')
      const base = gradeSyntax(p, modelAnswer(p))
      const answer = modelAnswer(p)
      answer.spans.push({ from: 4, to: 5, type: 'ul' })
      const g = gradeSyntax(p, answer)
      expect(g.percent).toBe(100)
      expect(g.total).toBe(base.total)
      expect(g.got).toBe(base.got)
      expect(g.spanMark[answer.spans.length - 1]).toBe('ok')
    })

    it('同じ範囲に必須と任意があっても、書いた順によらず正しく対応づく', () => {
      const p = byId('ex1')
      const answer = modelAnswer(p)
      // 下線→（ ）の順で書いても、（ ）が任意の下線の行に吸われて誤りにならない
      answer.spans = [
        { from: 4, to: 5, type: 'ul' },
        ...answer.spans,
      ]
      const g = gradeSyntax(p, answer)
      expect(g.percent).toBe(100)
      expect(g.feedback.filter((f) => f.tone === 'bad')).toHaveLength(0)
    })

    it('任意のまとまりでも、種類を誤って書けば従来どおり誤り', () => {
      const p = byId('ex1')
      const answer = modelAnswer(p)
      answer.spans.push({ from: 4, to: 5, type: 'n' }) // [ ] は very well に付けられない
      const g = gradeSyntax(p, answer)
      expect(g.percent).toBeLessThan(100)
      expect(g.spanMark[answer.spans.length - 1]).toBe('bad')
    })
  })

  it('まとまりの種類が違えば正解を示す', () => {
    const p = byId('ex1')
    const answer = modelAnswer(p)
    answer.spans = answer.spans.map((s) => (s.from === 4 ? { ...s, type: 'n' as const } : s))
    const g = gradeSyntax(p, answer)
    expect(g.feedback.some((f) => f.text.includes('正解は （ ）'))).toBe(true)
  })
})
