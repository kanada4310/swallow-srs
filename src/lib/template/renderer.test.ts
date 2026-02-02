import { describe, it, expect } from 'vitest'
import {
  renderTemplate,
  countClozeNumbers,
  extractFieldNames,
  type FieldValues,
} from './renderer'

describe('Template Renderer', () => {
  describe('renderTemplate - Basic fields', () => {
    it('should replace simple field placeholders', () => {
      const template = '<div>{{Front}}</div>'
      const fields: FieldValues = { Front: 'apple' }
      const result = renderTemplate(template, fields, '', { side: 'front' })

      expect(result).toContain('apple')
    })

    it('should replace multiple fields', () => {
      const template = '<div>{{Front}}</div><hr><div>{{Back}}</div>'
      const fields: FieldValues = { Front: 'apple', Back: 'りんご' }
      const result = renderTemplate(template, fields, '', { side: 'front' })

      expect(result).toContain('apple')
      expect(result).toContain('りんご')
    })

    it('should handle missing fields gracefully', () => {
      const template = '<div>{{Front}}</div><div>{{Missing}}</div>'
      const fields: FieldValues = { Front: 'apple' }
      const result = renderTemplate(template, fields, '', { side: 'front' })

      expect(result).toContain('apple')
      expect(result).not.toContain('{{Missing}}')
    })
  })

  describe('renderTemplate - Conditional sections', () => {
    it('should show content when field is not empty', () => {
      const template = '{{#Extra}}<div>{{Extra}}</div>{{/Extra}}'
      const fields: FieldValues = { Extra: 'Some extra info' }
      const result = renderTemplate(template, fields, '', { side: 'front' })

      expect(result).toContain('Some extra info')
    })

    it('should hide content when field is empty', () => {
      const template = '{{#Extra}}<div>Extra: {{Extra}}</div>{{/Extra}}'
      const fields: FieldValues = { Extra: '' }
      const result = renderTemplate(template, fields, '', { side: 'front' })

      expect(result).not.toContain('Extra:')
    })

    it('should handle inverse conditional sections', () => {
      const template = '{{^Extra}}<div>No extra info</div>{{/Extra}}'
      const fields: FieldValues = { Extra: '' }
      const result = renderTemplate(template, fields, '', { side: 'front' })

      expect(result).toContain('No extra info')
    })
  })

  describe('renderTemplate - Cloze deletions', () => {
    it('should show placeholder on front side', () => {
      const template = '{{cloze:Text}}'
      const fields: FieldValues = { Text: '{{c1::apple}} is a fruit' }
      const result = renderTemplate(template, fields, '', { side: 'front', clozeNumber: 1 })

      expect(result).toContain('[...]')
      expect(result).toContain('is a fruit')
      expect(result).not.toContain('apple')
    })

    it('should show answer on back side', () => {
      const template = '{{cloze:Text}}'
      const fields: FieldValues = { Text: '{{c1::apple}} is a fruit' }
      const result = renderTemplate(template, fields, '', { side: 'back', clozeNumber: 1 })

      expect(result).toContain('apple')
      expect(result).toContain('is a fruit')
    })

    it('should show hint when provided', () => {
      const template = '{{cloze:Text}}'
      const fields: FieldValues = { Text: '{{c1::apple::fruit}} is a fruit' }
      const result = renderTemplate(template, fields, '', { side: 'front', clozeNumber: 1 })

      expect(result).toContain('[fruit]')
      expect(result).not.toContain('apple')
    })

    it('should handle multiple cloze numbers', () => {
      const template = '{{cloze:Text}}'
      const fields: FieldValues = { Text: '{{c1::apple}} and {{c2::banana}}' }

      // Cloze 1 front
      const result1 = renderTemplate(template, fields, '', { side: 'front', clozeNumber: 1 })
      expect(result1).toContain('[...]')
      expect(result1).toContain('banana')

      // Cloze 2 front
      const result2 = renderTemplate(template, fields, '', { side: 'front', clozeNumber: 2 })
      expect(result2).toContain('apple')
      expect(result2).toContain('[...]')
    })
  })

  describe('renderTemplate - CSS handling', () => {
    it('should include CSS in style tag', () => {
      const template = '<div>{{Front}}</div>'
      const fields: FieldValues = { Front: 'apple' }
      const css = '.front { color: red; }'
      const result = renderTemplate(template, fields, css, { side: 'front' })

      expect(result).toContain('<style>')
      expect(result).toContain('color: red')
    })

    it('should wrap content in card div when CSS is provided', () => {
      const template = '<div>{{Front}}</div>'
      const fields: FieldValues = { Front: 'apple' }
      const css = '.card { padding: 10px; }'
      const result = renderTemplate(template, fields, css, { side: 'front' })

      expect(result).toContain('<div class="card">')
    })
  })

  describe('countClozeNumbers', () => {
    it('should count unique cloze numbers', () => {
      const text = '{{c1::apple}} {{c2::banana}} {{c1::cherry}}'
      const numbers = countClozeNumbers(text)

      expect(numbers).toEqual([1, 2])
    })

    it('should return empty array for text without cloze', () => {
      const text = 'Just normal text'
      const numbers = countClozeNumbers(text)

      expect(numbers).toEqual([])
    })

    it('should handle non-sequential cloze numbers', () => {
      const text = '{{c3::first}} {{c1::second}} {{c5::third}}'
      const numbers = countClozeNumbers(text)

      expect(numbers).toEqual([1, 3, 5])
    })
  })

  describe('extractFieldNames', () => {
    it('should extract simple field names', () => {
      const template = '{{Front}} {{Back}}'
      const fields = extractFieldNames(template)

      expect(fields).toContain('Front')
      expect(fields).toContain('Back')
    })

    it('should extract field names from cloze syntax', () => {
      const template = '{{cloze:Text}}'
      const fields = extractFieldNames(template)

      expect(fields).toContain('Text')
    })

    it('should not include conditional markers', () => {
      const template = '{{#Extra}}{{Extra}}{{/Extra}}'
      const fields = extractFieldNames(template)

      expect(fields).toContain('Extra')
      expect(fields).not.toContain('#Extra')
      expect(fields).not.toContain('/Extra')
    })
  })
})
