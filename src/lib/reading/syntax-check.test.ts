import { describe, expect, it } from 'vitest'
import { checkContradictions } from './syntax-check'
import { emptyAnswer, gradeSyntax, modelAnswer, SYNTAX_PROBLEMS, type SyntaxAnswer } from './syntax'

function answerFor(tokens: string[], patch: Partial<SyntaxAnswer>): SyntaxAnswer {
  return {
    pos: tokens.map(() => null),
    role: tokens.map(() => null),
    spans: [],
    ...patch,
  }
}

describe('checkContradictions（矛盾検査）', () => {
  const tokens = ['The', 'boy', 'on', 'the', 'stage', 'is', 'John', '.']

  it('正しい分析（模範解答）には矛盾を出さない', () => {
    for (const problem of SYNTAX_PROBLEMS) {
      const findings = checkContradictions(problem.tokens, modelAnswer(problem))
      expect(findings.filter((f) => f.severity === 'error')).toEqual([])
    }
  })

  it('何も書いていなければ何も出さない', () => {
    expect(checkContradictions(tokens, emptyAnswer(SYNTAX_PROBLEMS[0]))).toEqual([])
  })

  it('カッコの外に S が2つあると検出する（ルール4）', () => {
    const a = answerFor(tokens, {})
    a.role[1] = 'S'
    a.role[6] = 'S'
    a.role[5] = 'V'
    const findings = checkContradictions(tokens, a)
    expect(findings.some((f) => f.code === 'dup-s')).toBe(true)
  })

  it('S の2つ目がまとまりの中なら数えない', () => {
    const a = answerFor(tokens, { spans: [{ from: 4, to: 6, type: 'n' }] })
    a.role[1] = 'S'
    a.role[6] = 'S'
    a.role[5] = 'V'
    const findings = checkContradictions(tokens, a)
    expect(findings.some((f) => f.code === 'dup-s')).toBe(false)
  })

  it('間に接続詞があれば S の並列として許す（ルール29・30）', () => {
    const t = ['John', 'and', 'Bob', 'went', '.']
    const a = answerFor(t, {})
    a.role[0] = 'S'
    a.role[2] = 'S'
    a.role[3] = 'V'
    a.pos[1] = '接続詞'
    expect(checkContradictions(t, a).some((f) => f.code === 'dup-s')).toBe(false)
  })

  it('副詞に S・C の働きを書くと検出する（ルール6）', () => {
    const a = answerFor(tokens, {})
    a.pos[6] = '副詞'
    a.role[6] = 'C'
    const findings = checkContradictions(tokens, a)
    expect(findings.some((f) => f.code === 'adverb-role')).toBe(true)
  })

  it('前置詞を V にすると検出する（ルール1）', () => {
    const a = answerFor(tokens, {})
    a.pos[2] = '前置詞'
    a.role[2] = 'V'
    expect(checkContradictions(tokens, a).some((f) => f.code === 'v-role-pos')).toBe(true)
  })

  it('前O の前に前置詞が無いと検出する（ルール13）', () => {
    const a = answerFor(tokens, {})
    a.role[1] = '前O'
    expect(checkContradictions(tokens, a).some((f) => f.code === 'po-without-p')).toBe(true)
  })

  it('前置詞に目的語（前O）が書かれていないと注意を出す（ルール13）', () => {
    const a = answerFor(tokens, {})
    a.pos[2] = '前置詞'
    a.role[5] = 'V'
    const findings = checkContradictions(tokens, a)
    expect(findings.some((f) => f.code === 'p-without-po' && f.severity === 'warn')).toBe(true)
  })

  it('〈 〉の直前が名詞でないと検出する（ルール9）', () => {
    const a = answerFor(tokens, { spans: [{ from: 6, to: 6, type: 'adjm' }] })
    a.pos[5] = '動詞'
    expect(checkContradictions(tokens, a).some((f) => f.code === 'angle-no-noun')).toBe(true)
  })

  it('〈 〉が文頭にあると検出する', () => {
    const a = answerFor(tokens, { spans: [{ from: 0, to: 2, type: 'adjm' }] })
    expect(checkContradictions(tokens, a).some((f) => f.code === 'angle-no-noun')).toBe(true)
  })

  it('[ ] に役割が書かれていないと注意を出す', () => {
    const a = answerFor(tokens, { spans: [{ from: 2, to: 4, type: 'n' }] })
    a.role[5] = 'V'
    expect(checkContradictions(tokens, a).some((f) => f.code === 'square-no-role')).toBe(true)
  })

  it('書き込みがあるのに V が無いと注意を出す（ルール1）', () => {
    const a = answerFor(tokens, {})
    a.role[1] = 'S'
    expect(checkContradictions(tokens, a).some((f) => f.code === 'no-v')).toBe(true)
  })

  it('品詞が英字略記（ad・p など）で書かれていても同じ検査が働く', () => {
    const a = answerFor(tokens, {})
    a.pos[6] = 'ad' // 副詞
    a.role[6] = 'C'
    expect(checkContradictions(tokens, a).some((f) => f.code === 'adverb-role')).toBe(true)

    const b = answerFor(tokens, {})
    b.pos[2] = 'p' // 前置詞
    b.role[2] = 'V'
    expect(checkContradictions(tokens, b).some((f) => f.code === 'v-role-pos')).toBe(true)

    const c = answerFor(tokens, {})
    c.pos[2] = 'p'
    c.role[3] = '前O'
    c.role[5] = 'V'
    expect(checkContradictions(tokens, c).some((f) => f.code === 'po-without-p')).toBe(false)
  })

  it('英字 v は動詞・分詞を区別しないので V の働きと矛盾にしない', () => {
    const a = answerFor(tokens, {})
    a.pos[5] = 'v'
    a.role[5] = 'V'
    expect(checkContradictions(tokens, a).some((f) => f.code === 'v-role-pos')).toBe(false)
  })

  it('採点（gradeSyntax）と独立に動く', () => {
    const problem = SYNTAX_PROBLEMS[0]
    const a = modelAnswer(problem)
    const grade = gradeSyntax(problem, a)
    expect(grade.percent).toBe(100)
    expect(checkContradictions(problem.tokens, a).filter((f) => f.severity === 'error')).toEqual([])
  })
})
