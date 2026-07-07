import { describe, it, expect } from 'vitest'
import {
  parseKobunQuestion,
  isKobunTangoNote,
  buildOptionsA,
  buildOptionsB,
  grade,
  computeKobunScore,
  deriveKobunEase,
  pickN,
  UNKNOWN_ANSWER,
  type KobunQuestionA,
  type KobunQuestionB,
} from './index'

const qA: KobunQuestionA = {
  mode: 'A',
  correct: ['見る・会う', '思う・分かる'],
  distractors: ['歩き回る', '病気になる', '怠ける', '渡る', '呼び続ける'],
}

const qB: KobunQuestionB = {
  mode: 'B',
  correct: '思う・分かる',
  distractors: ['見る・会う', '結婚する', '面倒を見る', '歩き回る'],
}

// 決定的なシード付き rng（テスト用）
function seeded(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

describe('parseKobunQuestion', () => {
  it('モードA をパースする', () => {
    const q = parseKobunQuestion(JSON.stringify(qA))
    expect(q?.mode).toBe('A')
    expect((q as KobunQuestionA).correct).toEqual(qA.correct)
  })

  it('モードB をパースする（正解・ダミーのみ）', () => {
    const q = parseKobunQuestion(JSON.stringify(qB))
    expect(q?.mode).toBe('B')
    expect((q as KobunQuestionB).correct).toBe('思う・分かる')
    expect((q as KobunQuestionB).distractors).toHaveLength(4)
  })

  it('correct 不在や不正 JSON は null', () => {
    expect(parseKobunQuestion('{}')).toBeNull()
    expect(parseKobunQuestion('not json')).toBeNull()
    expect(parseKobunQuestion(JSON.stringify({ mode: 'A', correct: [] }))).toBeNull()
    expect(parseKobunQuestion(null)).toBeNull()
  })

  it('isKobunTangoNote は問題フィールドの有無で判定', () => {
    expect(isKobunTangoNote({ 問題: JSON.stringify(qA) })).toBe(true)
    expect(isKobunTangoNote({ Front: 'x' })).toBe(false)
  })
})

describe('buildOptions', () => {
  it('モードA は正解を全て含み、ダミー数 = max(正解数,4-正解数,2)', () => {
    const opts = buildOptionsA(qA, seeded(1))
    // 正解2件 → dn = max(2,2,2) = 2 → 合計4
    expect(opts).toHaveLength(4)
    for (const c of qA.correct) expect(opts).toContain(c)
  })

  it('モードA 正解1件なら dn=3 で合計4', () => {
    const q: KobunQuestionA = { mode: 'A', correct: ['のぞき見る'], distractors: ['a', 'b', 'c', 'd'] }
    expect(buildOptionsA(q, seeded(2))).toHaveLength(4)
  })

  it('モードB は正解1＋ダミー3の四択', () => {
    const opts = buildOptionsB(qB, seeded(3))
    expect(opts).toHaveLength(4)
    expect(opts).toContain(qB.correct)
  })

  it('pickN はプール超過でも全件まで', () => {
    expect(pickN(['a', 'b'], 5, seeded(4))).toHaveLength(2)
    expect(pickN(['a', 'b', 'c'], 2, seeded(4))).toHaveLength(2)
  })
})

describe('grade モードA（複数選択）', () => {
  it('集合一致で完全正解・fraction 1', () => {
    const r = grade(qA, ['見る・会う', '思う・分かる'])
    expect(r.overallCorrect).toBe(true)
    expect(r.fraction).toBe(1)
  })

  it('一部選択（取りこぼし）は部分点', () => {
    const r = grade(qA, ['見る・会う'])
    expect(r.overallCorrect).toBe(false)
    expect(r.fraction).toBeCloseTo(0.5)
  })

  it('誤答を含むと減点（tp - fp）', () => {
    const r = grade(qA, ['見る・会う', '歩き回る'])
    // tp=1, fp=1 → (1-1)/2 = 0
    expect(r.fraction).toBe(0)
    expect(r.overallCorrect).toBe(false)
  })

  it('わからない は fraction 0', () => {
    const r = grade(qA, [UNKNOWN_ANSWER])
    expect(r.dontKnow).toBe(true)
    expect(r.fraction).toBe(0)
  })
})

describe('grade モードB（四択）', () => {
  it('正解で fraction 1', () => {
    expect(grade(qB, ['思う・分かる']).overallCorrect).toBe(true)
  })
  it('誤答で fraction 0', () => {
    const r = grade(qB, ['結婚する'])
    expect(r.overallCorrect).toBe(false)
    expect(r.fraction).toBe(0)
  })
})

describe('computeKobunScore / deriveKobunEase', () => {
  it('完全正解＆速い → 簡単(4)', () => {
    const r = grade(qB, ['思う・分かる'])
    const ease = deriveKobunEase(computeKobunScore(r, 5_000))
    expect(ease).toBe(4)
  })

  it('完全正解＆遅い → 正解(3)', () => {
    const r = grade(qB, ['思う・分かる'])
    const ease = deriveKobunEase(computeKobunScore(r, 60_000))
    expect(ease).toBe(3)
  })

  it('部分正解(0.5) → 難しい(2)', () => {
    const r = grade(qA, ['見る・会う'])
    expect(deriveKobunEase(computeKobunScore(r, 10_000))).toBe(2)
  })

  it('不正解 → もう一度(1)', () => {
    const r = grade(qB, ['結婚する'])
    expect(deriveKobunEase(computeKobunScore(r, 10_000))).toBe(1)
  })
})
