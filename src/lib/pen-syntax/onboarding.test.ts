import { describe, expect, it } from 'vitest'
import {
  BRACKET_SYMBOLS,
  isEnrollmentComplete,
  missingRequired,
  OPTIONAL_SYMBOLS,
  REQUIRED_SYMBOLS,
  samplesFor,
} from './onboarding'
import type { UserTemplateStore } from './letters'
import type { PenStroke } from './types'

const stroke: PenStroke = [
  { x: 0, y: 0 },
  { x: 10, y: 10 },
]

describe('初回お手本登録（義務化）', () => {
  it('必須は括弧8種＋働き7種＋波線の16種（品詞は 2026-08-31 に任意へ・M・p は含まない）', () => {
    expect(REQUIRED_SYMBOLS).toHaveLength(16)
    expect(REQUIRED_SYMBOLS.map(String)).not.toContain('M')
    expect(REQUIRED_SYMBOLS.map(String)).not.toContain('p') // 前置詞は働きの段の P
    // 品詞の英字5種は必須に含まれない（通常モードでは品詞を求めないため・確定仕様4）
    for (const pos of ['n', 'v', 'a', 'ad', 'aux'] as const) {
      expect(REQUIRED_SYMBOLS.map(String)).not.toContain(pos)
    }
    for (const b of BRACKET_SYMBOLS) expect(REQUIRED_SYMBOLS).toContain(b)
    for (const r of ['S', 'V', 'O', 'C', 'P', 'Po', '▷'] as const) {
      expect(REQUIRED_SYMBOLS).toContain(r)
    }
    // 波線は 2026-09-02 に必須へ昇格（下線との取り違えを本人の字で見分けるため）
    expect(REQUIRED_SYMBOLS).toContain('wavy')
  })

  it('P・▷ は働きの並び（括弧の後）に置かれる', () => {
    expect(REQUIRED_SYMBOLS.indexOf('P')).toBeGreaterThan(REQUIRED_SYMBOLS.indexOf('brace-close'))
    expect(REQUIRED_SYMBOLS.indexOf('▷')).toBeGreaterThan(REQUIRED_SYMBOLS.indexOf('brace-close'))
  })

  it('任意は品詞5種＋下線・＋（必須と重複しない・波線は 2026-09-02 に必須へ昇格）', () => {
    expect(OPTIONAL_SYMBOLS).toEqual(['n', 'v', 'a', 'ad', 'aux', 'hline', '＋'])
    for (const s of OPTIONAL_SYMBOLS) expect(REQUIRED_SYMBOLS).not.toContain(s)
  })

  it('括弧は2本・文字と波線は1本で必要数を満たす', () => {
    expect(samplesFor('angle-close')).toBe(2)
    expect(samplesFor('S')).toBe(1)
    expect(samplesFor('n')).toBe(1)
    expect(samplesFor('wavy')).toBe(1)
  })

  it('★登録済み（旧15種）の利用者は、足りない波線だけが追加登録の対象になる', () => {
    // 旧一覧で登録を終えた利用者の店構え（波線だけ無い）
    const store: UserTemplateStore = {
      'paren-open': [[stroke], [stroke]],
      'paren-close': [[stroke], [stroke]],
      'square-open': [[stroke], [stroke]],
      'square-close': [[stroke], [stroke]],
      'angle-open': [[stroke], [stroke]],
      'angle-close': [[stroke], [stroke]],
      'brace-open': [[stroke], [stroke]],
      'brace-close': [[stroke], [stroke]],
      S: [[stroke]],
      V: [[stroke]],
      O: [[stroke]],
      C: [[stroke]],
      P: [[stroke]],
      Po: [[stroke]],
      '▷': [[stroke]],
    }
    expect(isEnrollmentComplete(store)).toBe(false)
    expect(missingRequired(store)).toEqual(['wavy'])
  })

  it('missingRequired は足りない記号を登録の順で返す（途中でやめても続きから）', () => {
    expect(missingRequired(null)).toEqual(REQUIRED_SYMBOLS)
    const store: UserTemplateStore = {
      'paren-open': [[stroke], [stroke]], // 2本＝足りている
      'paren-close': [[stroke]], // 2本必要でまだ1本
    }
    const missing = missingRequired(store)
    expect(missing[0]).toBe('paren-close')
    expect(missing).not.toContain('paren-open')
    expect(isEnrollmentComplete(store)).toBe(false)
  })

  it('必須の全種がそろえば完了になる', () => {
    const store: UserTemplateStore = {}
    for (const s of REQUIRED_SYMBOLS) {
      store[s] = Array.from({ length: samplesFor(s) }, () => [stroke])
    }
    expect(isEnrollmentComplete(store)).toBe(true)
    expect(missingRequired(store)).toEqual([])
  })

  it('★品詞のお手本が1つも無くても、登録は「完了」になる（2026-08-31 確定仕様4）', () => {
    // 期待する一覧はあえて手書きする（REQUIRED_SYMBOLS から作ると、
    // 一覧の定数の誤りごとテストが通ってしまう。教訓 benchmark-self-reference）
    const store: UserTemplateStore = {
      'paren-open': [[stroke], [stroke]],
      'paren-close': [[stroke], [stroke]],
      'square-open': [[stroke], [stroke]],
      'square-close': [[stroke], [stroke]],
      'angle-open': [[stroke], [stroke]],
      'angle-close': [[stroke], [stroke]],
      'brace-open': [[stroke], [stroke]],
      'brace-close': [[stroke], [stroke]],
      S: [[stroke]],
      V: [[stroke]],
      O: [[stroke]],
      C: [[stroke]],
      P: [[stroke]],
      Po: [[stroke]],
      '▷': [[stroke]],
      wavy: [[stroke]],
    }
    expect(isEnrollmentComplete(store)).toBe(true)
    expect(missingRequired(store)).toEqual([])
    // 逆に、働きが1つでも欠けていれば未完了のまま
    const withoutS: UserTemplateStore = { ...store }
    delete withoutS.S
    expect(isEnrollmentComplete(withoutS)).toBe(false)
    expect(missingRequired(withoutS)).toEqual(['S'])
  })
})
