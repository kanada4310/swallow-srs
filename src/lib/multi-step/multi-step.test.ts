import { describe, it, expect } from 'vitest'
import {
  parseQuestions,
  parseHighlights,
  isMultiStepNote,
  gradeSelect,
  completeText,
  shuffle,
  computeScore,
  deriveEase,
  UNKNOWN_ANSWER,
  TARGET_MS_PER_QUESTION,
} from './index'
import type { MultiStepQuestion, StepResult } from './types'

// 元教材（index.html）の snake_case 形式そのまま
const RAW_SNAKE = JSON.stringify([
  {
    q_id: 'ga_01_q1',
    highlight_id: 'h_ga',
    question_type: '識別',
    prompt: '傍線部「が」の文法的説明として正しいものを選びなさい。',
    answer_format: 'select',
    choices: ['格助詞', '接続助詞', '副助詞', '係助詞'],
    correct_answer: '格助詞',
    explanation: '体言「犬君」に接続しているため格助詞。',
    reference_page: 80,
    follow_up: {
      prompt: '「格助詞」と判断した決め手はどれですか。',
      choices: ['直前が体言(名詞)だから', '直前が連体形だから'],
      correct_answer: '直前が体言(名詞)だから',
      explanation: '体言接続なら格助詞。',
    },
  },
  {
    q_id: 'ga_01_q5',
    highlight_id: null,
    question_type: '和訳',
    prompt: 'この文全体を現代語訳しなさい。',
    answer_format: 'text',
    correct_answer: '雀の子を犬君が逃がしてしまったの。',
    explanation: '「つる」は完了の助動詞「つ」の連体形。',
  },
])

describe('parseQuestions', () => {
  it('snake_case の元教材データをパースできる', () => {
    const qs = parseQuestions(RAW_SNAKE)
    expect(qs).toHaveLength(2)
    expect(qs[0]).toMatchObject({
      id: 'ga_01_q1',
      highlightId: 'h_ga',
      questionType: '識別',
      format: 'select',
      answer: '格助詞',
      referencePage: 80,
    })
    expect(qs[0].followUp).toMatchObject({ answer: '直前が体言(名詞)だから' })
    expect(qs[1]).toMatchObject({ format: 'text', highlightId: null, followUp: null })
  })

  it('camelCase 形式も受理する', () => {
    const raw = JSON.stringify([
      { id: 'x', prompt: 'p', format: 'select', choices: ['a', 'b'], answer: 'a' },
    ])
    expect(parseQuestions(raw)[0]).toMatchObject({ id: 'x', answer: 'a', format: 'select' })
  })

  it('記述式には follow_up を付けない', () => {
    const raw = JSON.stringify([
      { id: 'x', prompt: 'p', answer_format: 'text', correct_answer: 'ans', follow_up: { prompt: 'q', choices: ['a'], correct_answer: 'a' } },
    ])
    expect(parseQuestions(raw)[0].followUp).toBeNull()
  })

  it('不正JSON・非配列・空は空配列', () => {
    expect(parseQuestions('not json')).toEqual([])
    expect(parseQuestions('{}')).toEqual([])
    expect(parseQuestions(undefined)).toEqual([])
    expect(parseQuestions('')).toEqual([])
  })

  it('prompt 欠落の要素は除外', () => {
    const raw = JSON.stringify([{ id: 'x' }, { id: 'y', prompt: 'ok' }])
    const qs = parseQuestions(raw)
    expect(qs).toHaveLength(1)
    expect(qs[0].id).toBe('y')
  })
})

describe('parseHighlights', () => {
  it('id/start/end を持つ要素のみ取り込む', () => {
    const raw = JSON.stringify([
      { id: 'h_ga', text: 'が', start: 6, end: 7 },
      { id: 'bad' },
    ])
    const hs = parseHighlights(raw)
    expect(hs).toHaveLength(1)
    expect(hs[0]).toMatchObject({ id: 'h_ga', start: 6, end: 7, text: 'が' })
  })
})

describe('isMultiStepNote', () => {
  it('設問フィールドが有効なら true', () => {
    expect(isMultiStepNote({ 設問: RAW_SNAKE })).toBe(true)
  })
  it('設問フィールドが無い/空なら false', () => {
    expect(isMultiStepNote({ Front: 'a', Back: 'b' })).toBe(false)
    expect(isMultiStepNote({ 設問: '[]' })).toBe(false)
  })
})

const Q_SELECT: MultiStepQuestion = {
  id: 'q1', highlightId: 'h', questionType: '識別', prompt: 'p', format: 'select',
  choices: ['格助詞', '接続助詞'], answer: '格助詞', explanation: null, referencePage: null,
  followUp: { prompt: 'fp', choices: ['体言', '連体形'], answer: '体言', explanation: null },
}

describe('gradeSelect', () => {
  it('メイン＋根拠とも正解 → overallCorrect', () => {
    const r = gradeSelect(Q_SELECT, '格助詞', '体言')
    expect(r).toMatchObject({ mainCorrect: true, followCorrect: true, overallCorrect: true })
  })
  it('メイン正解・根拠誤答 → overallCorrect false', () => {
    const r = gradeSelect(Q_SELECT, '格助詞', '連体形')
    expect(r).toMatchObject({ mainCorrect: true, followCorrect: false, overallCorrect: false })
  })
  it('根拠なし設問はメインのみで判定', () => {
    const q = { ...Q_SELECT, followUp: null }
    expect(gradeSelect(q, '格助詞')).toMatchObject({ followCorrect: null, overallCorrect: true })
  })
  it('「わからない」は不正解', () => {
    const q = { ...Q_SELECT, followUp: null }
    expect(gradeSelect(q, UNKNOWN_ANSWER).overallCorrect).toBe(false)
  })
})

describe('completeText', () => {
  it('記述式は採点対象外（graded:false）で完了する', () => {
    const q = { ...Q_SELECT, format: 'text' as const, followUp: null }
    const r = completeText(q)
    expect(r).toMatchObject({ overallCorrect: true, graded: false })
  })
})

describe('shuffle', () => {
  it('元配列を変更せず同じ要素を返す', () => {
    const src = ['a', 'b', 'c', 'd']
    const out = shuffle(src, () => 0)
    expect(out).not.toBe(src)
    expect([...out].sort()).toEqual([...src].sort())
    expect(src).toEqual(['a', 'b', 'c', 'd'])
  })
})

function mkResults(pattern: boolean[]): StepResult[] {
  return pattern.map((ok, i) => ({
    id: `q${i}`, mainCorrect: ok, followCorrect: null, overallCorrect: ok, graded: true,
  }))
}

describe('computeScore', () => {
  it('全問正解・目標時間内は 100', () => {
    const r = mkResults([true, true, true])
    const s = computeScore(r, 3 * TARGET_MS_PER_QUESTION)
    expect(s.score).toBe(100)
    expect(s.accuracyPct).toBe(100)
    expect(s.correct).toBe(3)
  })
  it('全問正解でも2倍遅いと速さ成分が下がる（85+7=92前後）', () => {
    const r = mkResults([true, true])
    const s = computeScore(r, 2 * 2 * TARGET_MS_PER_QUESTION) // 2倍の時間
    expect(s.speedScore).toBeCloseTo(0.5, 5)
    expect(s.score).toBe(93) // round(100*(0.85 + 0.15*0.5)) = round(92.5) = 93
  })
  it('全問不正解は速さ満点でも最大15', () => {
    const r = mkResults([false, false])
    const s = computeScore(r, 1)
    expect(s.accuracyPct).toBe(0)
    expect(s.score).toBe(15)
  })
  it('部分正解の正答率', () => {
    const s = computeScore(mkResults([true, false, true, false]), 4 * TARGET_MS_PER_QUESTION)
    expect(s.accuracyPct).toBe(50)
  })
  it('総設問0は score 0', () => {
    expect(computeScore([], 0).score).toBe(0)
  })
  it('記述式(graded:false)は正答率に算入しない', () => {
    const results: StepResult[] = [
      { id: 'q1', mainCorrect: false, followCorrect: null, overallCorrect: false, graded: true }, // 選択・誤答
      { id: 'q2', mainCorrect: true, followCorrect: null, overallCorrect: true, graded: false }, // 記述（対象外）
    ]
    const s = computeScore(results, 2 * TARGET_MS_PER_QUESTION)
    // 採点対象は選択1問のみ＝誤答 → 0%（記述で50%に薄まらない）
    expect(s.total).toBe(1)
    expect(s.accuracyPct).toBe(0)
  })
  it('記述のみ（採点対象なし）は正答率100%扱い', () => {
    const results: StepResult[] = [
      { id: 'q1', mainCorrect: true, followCorrect: null, overallCorrect: true, graded: false },
    ]
    expect(computeScore(results, TARGET_MS_PER_QUESTION).accuracyPct).toBe(100)
  })
})

describe('deriveEase（スコアから自動判定）', () => {
  it('全問正解＋速い → 簡単(4)', () => {
    const s = computeScore(mkResults([true, true, true]), 3 * TARGET_MS_PER_QUESTION) // 目標時間内＝速い
    expect(s.speedScore).toBe(1)
    expect(deriveEase(s)).toBe(4)
  })
  it('全問正解＋遅い → 正解(3)', () => {
    const s = computeScore(mkResults([true, true]), 4 * 2 * TARGET_MS_PER_QUESTION) // 目標の4倍＝遅い
    expect(s.speedScore).toBeLessThan(0.8)
    expect(deriveEase(s)).toBe(3)
  })
  it('一部正解（正答率50%以上）→ 難しい(2)', () => {
    const s = computeScore(mkResults([true, false]), TARGET_MS_PER_QUESTION) // 50%
    expect(deriveEase(s)).toBe(2)
  })
  it('正答率50%未満 → もう一度(1)', () => {
    const s = computeScore(mkResults([true, false, false, false]), TARGET_MS_PER_QUESTION) // 25%
    expect(deriveEase(s)).toBe(1)
  })
  it('空は もう一度(1)', () => {
    expect(deriveEase(computeScore([], 0))).toBe(1)
  })
})
