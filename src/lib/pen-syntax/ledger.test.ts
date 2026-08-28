/**
 * 記号の台帳の見張り。
 *
 * 見るのは2つ:
 * - 括弧の見た目の幅がそろっていること（2026-08-28。丸括弧と山括弧だけ全角だった）
 * - 記号の見分けは ID で行い、見た目の字には頼っていないこと
 *   （過去に保存した模範の順序・入力の記録が読めなくならないため）
 */

import { describe, it, expect } from 'vitest'
import { SYMBOL_LABELS, symbolLabel } from './ledger'
import { orderKeyFor } from './order'

describe('記号の台帳', () => {
  it('括弧の見た目は4種とも半角で幅がそろっている', () => {
    expect(symbolLabel('paren-open')).toBe('(')
    expect(symbolLabel('paren-close')).toBe(')')
    expect(symbolLabel('square-open')).toBe('[')
    expect(symbolLabel('square-close')).toBe(']')
    expect(symbolLabel('angle-open')).toBe('⟨')
    expect(symbolLabel('angle-close')).toBe('⟩')
    expect(symbolLabel('brace-open')).toBe('{')
    expect(symbolLabel('brace-close')).toBe('}')
    ;['paren-open', 'paren-close', 'angle-open', 'angle-close'].forEach((s) => {
      // 全角の括弧が残っていないこと
      expect('（）〈〉｛｝［］').not.toContain(SYMBOL_LABELS[s])
    })
  })

  it('記号の見分けは ID で行う（見た目の字を変えても照合の鍵は変わらない）', () => {
    expect(orderKeyFor('paren-open', { from: 4, to: 4 })).toBe('open:adv:4')
    expect(orderKeyFor('angle-close', { from: 2, to: 5 })).toBe('span:adjm:2-5')
  })
})
