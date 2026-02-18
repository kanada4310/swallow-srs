import { describe, it, expect } from 'vitest'
import { extractFrontText } from '@/lib/push/extract-text'

describe('extractFrontText', () => {
  it('should return Front field when present', () => {
    expect(extractFrontText({ Front: 'apple', Back: 'りんご' })).toBe('apple')
  })

  it('should fall back to Text field', () => {
    expect(extractFrontText({ Text: 'The {{c1::cat}} sat on the mat', Extra: 'note' })).toBe(
      'The cat sat on the mat'
    )
  })

  it('should fall back to Expression field', () => {
    expect(extractFrontText({ Expression: 'hello', Meaning: 'こんにちは' })).toBe('hello')
  })

  it('should fall back to Word field', () => {
    expect(extractFrontText({ Word: 'run', Definition: '走る' })).toBe('run')
  })

  it('should fall back to first non-empty field', () => {
    expect(extractFrontText({ Kanji: '食べる', Reading: 'たべる' })).toBe('食べる')
  })

  it('should strip HTML tags', () => {
    expect(extractFrontText({ Front: '<b>bold</b> and <i>italic</i>' })).toBe('bold and italic')
  })

  it('should expand Cloze deletions', () => {
    expect(extractFrontText({ Front: '{{c1::answer}}' })).toBe('answer')
  })

  it('should expand Cloze with hints', () => {
    expect(extractFrontText({ Front: '{{c1::answer::hint}}' })).toBe('answer')
  })

  it('should expand multiple Cloze deletions', () => {
    expect(
      extractFrontText({ Front: 'The {{c1::cat}} sat on the {{c2::mat}}' })
    ).toBe('The cat sat on the mat')
  })

  it('should truncate long text to 100 chars', () => {
    const longText = 'a'.repeat(200)
    const result = extractFrontText({ Front: longText })
    expect(result.length).toBe(100)
    expect(result).toBe('a'.repeat(97) + '...')
  })

  it('should return fallback for null input', () => {
    expect(extractFrontText(null)).toBe('復習カードがあります')
  })

  it('should return fallback for empty object', () => {
    expect(extractFrontText({})).toBe('復習カードがあります')
  })

  it('should return fallback for all-empty fields', () => {
    expect(extractFrontText({ Front: '', Back: '' })).toBe('復習カードがあります')
  })
})
