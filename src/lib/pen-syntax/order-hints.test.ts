/**
 * 検討順ヒント「迷ったらまずこれ」（order-hints.ts）のテスト。
 * 確定済みの記号から「まだの最初の項目」を1つだけ返すこと・答えを言わないことを確認する。
 */

import { describe, expect, it } from 'vitest'
import { emptyAnswer, SYNTAX_PROBLEMS, type SyntaxAnswer } from '@/lib/reading/syntax'
import { nextOrderHint, ORDER_HINT_RULES } from './order-hints'

// ② The girl standing by the door is my sister.
const problem = SYNTAX_PROBLEMS[1]
const tokens = problem.tokens

function answerWith(patch: Partial<SyntaxAnswer>): SyntaxAnswer {
  return { ...emptyAnswer(problem), ...patch }
}

describe('nextOrderHint（検討順ヒント）', () => {
  it('何も書いていないときは「まず文の動詞」', () => {
    expect(nextOrderHint(tokens, emptyAnswer(problem))?.id).toBe('verb')
  })

  it('動詞（V か 品詞v）が付いたら次は「Sの特定」', () => {
    const roles = emptyAnswer(problem).role
    roles[6] = 'V'
    expect(nextOrderHint(tokens, answerWith({ role: roles }))?.id).toBe('subject')

    const pos = emptyAnswer(problem).pos
    pos[6] = 'v'
    expect(nextOrderHint(tokens, answerWith({ pos }))?.id).toBe('subject')
  })

  it('V と S が付いたら次は「名詞の4役」', () => {
    const roles = emptyAnswer(problem).role
    roles[6] = 'V'
    roles[1] = 'S'
    expect(nextOrderHint(tokens, answerWith({ role: roles }))?.id).toBe('noun-roles')
  })

  it('n を付けた名詞に働きが揃うまでは「名詞の4役」のまま', () => {
    const a = emptyAnswer(problem)
    a.role[6] = 'V'
    a.role[1] = 'S'
    a.pos[1] = 'n'
    a.pos[5] = 'n' // door に n を付けたが働き未記入
    expect(nextOrderHint(tokens, a)?.id).toBe('noun-roles')
    a.role[5] = 'Po'
    expect(nextOrderHint(tokens, a)?.id).toBe('brackets')
  })

  it('品詞が漢字名（タップ方式の旧データ）でも英字と同値で判定する', () => {
    const a = emptyAnswer(problem)
    a.pos[6] = '動詞'
    expect(nextOrderHint(tokens, a)?.id).toBe('subject')
  })

  it('最後の項目はカッコの検討順（チェックリストとして常に案内できる）', () => {
    const a = emptyAnswer(problem)
    a.role[6] = 'V'
    a.role[1] = 'S'
    a.pos[1] = 'n'
    a.role[1] = 'S'
    const hint = nextOrderHint(tokens, answerWith({ role: a.role, pos: a.pos }))
    // n=girl に S が付いているので4役は済み → カッコ
    expect(hint?.id).toBe('brackets')
    expect(hint?.guide).toContain('［名詞］')
  })

  it('ヒントの文面はこの文の正解（plays・standing など具体語）を含まない', () => {
    for (const r of ORDER_HINT_RULES) {
      for (const p of SYNTAX_PROBLEMS) {
        for (const tok of p.tokens) {
          if (tok.length <= 2) continue
          expect(r.guide).not.toContain(tok)
          expect(r.title).not.toContain(tok)
        }
      }
    }
  })

  it('検討順リストは指示書の初期値の並び（動詞→S→名詞の4役→カッコ）', () => {
    expect(ORDER_HINT_RULES.map((r) => r.id)).toEqual(['verb', 'subject', 'noun-roles', 'brackets'])
  })
})
