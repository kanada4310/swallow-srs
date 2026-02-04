import { describe, it, expect } from 'vitest'
import { escapeCSVField, generateCSV, NoteForExport } from './exporter'

describe('CSV Exporter', () => {
  describe('escapeCSVField', () => {
    it('should return empty string for empty value', () => {
      expect(escapeCSVField('')).toBe('')
    })

    it('should return plain value if no special characters', () => {
      expect(escapeCSVField('apple')).toBe('apple')
    })

    it('should wrap in quotes if contains comma', () => {
      expect(escapeCSVField('hello, world')).toBe('"hello, world"')
    })

    it('should wrap in quotes if contains newline', () => {
      expect(escapeCSVField('line1\nline2')).toBe('"line1\nline2"')
    })

    it('should wrap in quotes if contains carriage return', () => {
      expect(escapeCSVField('line1\rline2')).toBe('"line1\rline2"')
    })

    it('should escape double quotes by doubling them', () => {
      expect(escapeCSVField('say "hello"')).toBe('"say ""hello"""')
    })

    it('should handle combined special characters', () => {
      expect(escapeCSVField('a "b", c\nd')).toBe('"a ""b"", c\nd"')
    })

    it('should respect custom delimiter', () => {
      expect(escapeCSVField('a\tb', '\t')).toBe('"a\tb"')
      expect(escapeCSVField('a,b', '\t')).toBe('a,b') // comma not special for tab delimiter
    })

    it('should handle Japanese text without quoting', () => {
      expect(escapeCSVField('りんご')).toBe('りんご')
    })
  })

  describe('generateCSV', () => {
    it('should generate CSV with BOM and CRLF', () => {
      const notes: NoteForExport[] = [
        { noteTypeName: 'Basic', fieldValues: { Front: 'apple', Back: 'りんご' } },
      ]
      const csv = generateCSV(notes, ['Front', 'Back'])

      // Starts with BOM
      expect(csv.charCodeAt(0)).toBe(0xFEFF)
      // Contains CRLF
      expect(csv).toContain('\r\n')
      // Header row
      expect(csv).toContain('Front,Back')
      // Data row
      expect(csv).toContain('apple,りんご')
    })

    it('should include ノートタイプ column when multiple note types', () => {
      const notes: NoteForExport[] = [
        { noteTypeName: 'Basic', fieldValues: { Front: 'apple', Back: 'りんご' } },
        { noteTypeName: 'Cloze', fieldValues: { Text: 'test', Extra: 'info' } },
      ]
      const csv = generateCSV(notes, ['Front', 'Back', 'Text', 'Extra'])

      expect(csv).toContain('ノートタイプ,Front,Back,Text,Extra')
      expect(csv).toContain('Basic,apple,りんご,,')
      expect(csv).toContain('Cloze,,,test,info')
    })

    it('should not include ノートタイプ column when single note type', () => {
      const notes: NoteForExport[] = [
        { noteTypeName: 'Basic', fieldValues: { Front: 'apple', Back: 'りんご' } },
        { noteTypeName: 'Basic', fieldValues: { Front: 'dog', Back: '犬' } },
      ]
      const csv = generateCSV(notes, ['Front', 'Back'])

      expect(csv).not.toContain('ノートタイプ')
      expect(csv).toContain('Front,Back')
    })

    it('should handle empty notes array', () => {
      const csv = generateCSV([], ['Front', 'Back'])

      // Should still have header
      expect(csv).toContain('Front,Back')
      // BOM + header + CRLF only
      const lines = csv.replace('\uFEFF', '').trim().split('\r\n')
      expect(lines).toHaveLength(1) // header only
    })

    it('should fill missing fields with empty string', () => {
      const notes: NoteForExport[] = [
        { noteTypeName: 'Basic', fieldValues: { Front: 'apple' } },
      ]
      const csv = generateCSV(notes, ['Front', 'Back'])

      expect(csv).toContain('apple,')
    })

    it('should escape fields with special characters', () => {
      const notes: NoteForExport[] = [
        { noteTypeName: 'Basic', fieldValues: { Front: 'hello, world', Back: 'say "hi"' } },
      ]
      const csv = generateCSV(notes, ['Front', 'Back'])

      expect(csv).toContain('"hello, world"')
      expect(csv).toContain('"say ""hi"""')
    })

    it('should not include note type column when includeNoteType is false', () => {
      const notes: NoteForExport[] = [
        { noteTypeName: 'Basic', fieldValues: { Front: 'a', Back: 'b' } },
        { noteTypeName: 'Cloze', fieldValues: { Text: 'c', Extra: 'd' } },
      ]
      const csv = generateCSV(notes, ['Front', 'Back', 'Text', 'Extra'], {
        includeNoteType: false,
      })

      expect(csv).not.toContain('ノートタイプ')
    })

    it('should end with CRLF', () => {
      const notes: NoteForExport[] = [
        { noteTypeName: 'Basic', fieldValues: { Front: 'a', Back: 'b' } },
      ]
      const csv = generateCSV(notes, ['Front', 'Back'])

      expect(csv.endsWith('\r\n')).toBe(true)
    })
  })
})
