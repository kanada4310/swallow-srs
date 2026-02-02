import { describe, it, expect } from 'vitest'
import {
  parseCSV,
  detectDelimiter,
  validateMapping,
} from './parser'

describe('CSV Parser', () => {
  describe('parseCSV', () => {
    it('should parse simple CSV with headers', () => {
      const csv = 'Front,Back\napple,りんご\nbanana,バナナ'
      const result = parseCSV(csv)

      expect(result.headers).toEqual(['Front', 'Back'])
      expect(result.rows).toHaveLength(2)
      expect(result.rows[0]).toEqual(['apple', 'りんご'])
      expect(result.rows[1]).toEqual(['banana', 'バナナ'])
      expect(result.errors).toHaveLength(0)
    })

    it('should handle quoted fields', () => {
      const csv = 'Front,Back\n"hello, world","こんにちは、世界"'
      const result = parseCSV(csv)

      expect(result.rows[0]).toEqual(['hello, world', 'こんにちは、世界'])
    })

    it('should handle escaped quotes', () => {
      const csv = 'Front,Back\n"She said ""Hello""","彼女は「こんにちは」と言った"'
      const result = parseCSV(csv)

      expect(result.rows[0]).toEqual(['She said "Hello"', '彼女は「こんにちは」と言った'])
    })

    it('should handle multiline in quoted fields', () => {
      const csv = 'Front,Back\n"line1\nline2","行1\n行2"'
      const result = parseCSV(csv)

      expect(result.rows[0]).toEqual(['line1\nline2', '行1\n行2'])
    })

    it('should handle Windows line endings', () => {
      const csv = 'Front,Back\r\napple,りんご\r\nbanana,バナナ'
      const result = parseCSV(csv)

      expect(result.headers).toEqual(['Front', 'Back'])
      expect(result.rows).toHaveLength(2)
    })

    it('should handle Mac line endings', () => {
      const csv = 'Front,Back\rapple,りんご\rbanana,バナナ'
      const result = parseCSV(csv)

      expect(result.headers).toEqual(['Front', 'Back'])
      expect(result.rows).toHaveLength(2)
    })

    it('should skip empty rows', () => {
      const csv = 'Front,Back\napple,りんご\n\nbanana,バナナ\n'
      const result = parseCSV(csv)

      expect(result.rows).toHaveLength(2)
    })

    it('should report column count mismatch', () => {
      const csv = 'Front,Back\napple\nbanana,バナナ,extra'
      const result = parseCSV(csv)

      expect(result.errors).toHaveLength(2)
      expect(result.errors[0].row).toBe(2)
      expect(result.errors[1].row).toBe(3)
    })

    it('should pad short rows', () => {
      const csv = 'Front,Back\napple'
      const result = parseCSV(csv)

      expect(result.rows[0]).toEqual(['apple', ''])
    })

    it('should truncate long rows', () => {
      const csv = 'Front,Back\napple,りんご,extra'
      const result = parseCSV(csv)

      expect(result.rows[0]).toEqual(['apple', 'りんご'])
    })

    it('should respect maxRows limit', () => {
      const csv = 'Front,Back\na,1\nb,2\nc,3\nd,4\ne,5'
      const result = parseCSV(csv, { maxRows: 3 })

      expect(result.rows).toHaveLength(3)
      expect(result.errors.some(e => e.message.includes('最大行数'))).toBe(true)
    })

    it('should handle tab delimiter', () => {
      const csv = 'Front\tBack\napple\tりんご'
      const result = parseCSV(csv, { delimiter: '\t' })

      expect(result.headers).toEqual(['Front', 'Back'])
      expect(result.rows[0]).toEqual(['apple', 'りんご'])
    })

    it('should handle empty file', () => {
      const result = parseCSV('')

      expect(result.headers).toEqual([])
      expect(result.rows).toEqual([])
      expect(result.errors).toHaveLength(1)
    })

    it('should generate column names when hasHeader is false', () => {
      const csv = 'apple,りんご'
      const result = parseCSV(csv, { hasHeader: false })

      expect(result.headers).toEqual(['Column 1', 'Column 2'])
      expect(result.rows).toHaveLength(1)
      expect(result.rows[0]).toEqual(['apple', 'りんご'])
    })

    it('should handle Cloze format', () => {
      const csv = 'Text,Extra\n"The {{c1::capital}} of Japan is {{c2::Tokyo}}.","geography"'
      const result = parseCSV(csv)

      expect(result.rows[0][0]).toBe('The {{c1::capital}} of Japan is {{c2::Tokyo}}.')
      expect(result.rows[0][1]).toBe('geography')
    })
  })

  describe('detectDelimiter', () => {
    it('should detect comma', () => {
      expect(detectDelimiter('a,b,c')).toBe(',')
    })

    it('should detect tab', () => {
      expect(detectDelimiter('a\tb\tc')).toBe('\t')
    })

    it('should detect semicolon', () => {
      expect(detectDelimiter('a;b;c')).toBe(';')
    })

    it('should detect pipe', () => {
      expect(detectDelimiter('a|b|c')).toBe('|')
    })

    it('should prefer most common delimiter', () => {
      expect(detectDelimiter('a,b,c;d')).toBe(',')
    })

    it('should default to comma when no delimiter found', () => {
      expect(detectDelimiter('abc')).toBe(',')
    })
  })

  describe('validateMapping', () => {
    it('should validate correct mapping', () => {
      const result = validateMapping(
        ['英語', '日本語'],
        { '英語': 'Front', '日本語': 'Back' },
        ['Front']
      )

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
      expect(result.mappings).toHaveLength(2)
    })

    it('should require all required fields', () => {
      const result = validateMapping(
        ['英語', '日本語'],
        { '日本語': 'Back' },
        ['Front']
      )

      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('Front'))).toBe(true)
    })

    it('should detect missing CSV columns', () => {
      const result = validateMapping(
        ['英語'],
        { '英語': 'Front', 'missing': 'Back' },
        ['Front']
      )

      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('missing'))).toBe(true)
    })

    it('should detect duplicate field mappings', () => {
      const result = validateMapping(
        ['col1', 'col2'],
        { 'col1': 'Front', 'col2': 'Front' },
        ['Front']
      )

      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('複数の列'))).toBe(true)
    })

    it('should ignore empty mappings', () => {
      const result = validateMapping(
        ['col1', 'col2'],
        { 'col1': 'Front', 'col2': '' },
        ['Front']
      )

      expect(result.valid).toBe(true)
      expect(result.mappings).toHaveLength(1)
    })
  })
})
