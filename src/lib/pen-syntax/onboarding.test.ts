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
  it('必須は括弧8種＋品詞6種＋働き7種の21種（M は含まない）', () => {
    expect(REQUIRED_SYMBOLS).toHaveLength(21)
    expect(REQUIRED_SYMBOLS.map(String)).not.toContain('M')
    for (const b of BRACKET_SYMBOLS) expect(REQUIRED_SYMBOLS).toContain(b)
    for (const r of ['P', 'Po', '▷'] as const) expect(REQUIRED_SYMBOLS).toContain(r)
  })

  it('P・▷ は働きの並び（品詞の英字の後）に置かれる', () => {
    expect(REQUIRED_SYMBOLS.indexOf('P')).toBeGreaterThan(REQUIRED_SYMBOLS.indexOf('p'))
    expect(REQUIRED_SYMBOLS.indexOf('▷')).toBeGreaterThan(REQUIRED_SYMBOLS.indexOf('aux'))
  })

  it('任意は下線・○囲み・波線・?・ダッシュ・Ø（必須と重複しない）', () => {
    expect(OPTIONAL_SYMBOLS).toEqual(['hline', 'circle', 'wavy', 'question', 'tick', 'null-sign'])
    for (const s of OPTIONAL_SYMBOLS) expect(REQUIRED_SYMBOLS).not.toContain(s)
  })

  it('括弧は2本・文字は1本で必要数を満たす', () => {
    expect(samplesFor('angle-close')).toBe(2)
    expect(samplesFor('S')).toBe(1)
    expect(samplesFor('n')).toBe(1)
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
})
