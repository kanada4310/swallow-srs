import { describe, it, expect } from 'vitest'
import { safeNext } from './safe-next'

describe('safeNext', () => {
  it('returns "/" for null/undefined/empty', () => {
    expect(safeNext(null)).toBe('/')
    expect(safeNext(undefined)).toBe('/')
    expect(safeNext('')).toBe('/')
  })

  it('passes through valid relative paths', () => {
    expect(safeNext('/')).toBe('/')
    expect(safeNext('/study')).toBe('/study')
    expect(safeNext('/study?deckId=abc')).toBe('/study?deckId=abc')
    expect(safeNext('/decks/xyz#section')).toBe('/decks/xyz#section')
  })

  it('rejects protocol-relative URLs (//evil.com)', () => {
    expect(safeNext('//evil.com')).toBe('/')
    expect(safeNext('//evil.com/path')).toBe('/')
  })

  it('rejects absolute URLs', () => {
    expect(safeNext('https://evil.com')).toBe('/')
    expect(safeNext('http://evil.com/path')).toBe('/')
  })

  it('rejects scheme-only or relative-without-slash inputs', () => {
    expect(safeNext('javascript:alert(1)')).toBe('/')
    expect(safeNext('study')).toBe('/')
    expect(safeNext('about:blank')).toBe('/')
  })
})
