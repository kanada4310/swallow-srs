/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest'
import { sanitizeHtml, sanitizeCss } from './sanitizer'

describe('HTML Sanitizer', () => {
  describe('sanitizeHtml', () => {
    it('should allow safe HTML tags', () => {
      const html = '<div><p><strong>Hello</strong></p></div>'
      const result = sanitizeHtml(html)

      expect(result).toContain('<div>')
      expect(result).toContain('<p>')
      expect(result).toContain('<strong>')
    })

    it('should allow images with safe attributes', () => {
      const html = '<img src="/image.png" alt="test" width="100" height="100">'
      const result = sanitizeHtml(html)

      expect(result).toContain('<img')
      expect(result).toContain('src="/image.png"')
      expect(result).toContain('alt="test"')
    })

    it('should remove script tags', () => {
      const html = '<div>Hello</div><script>alert("xss")</script>'
      const result = sanitizeHtml(html)

      expect(result).toContain('Hello')
      expect(result).not.toContain('<script>')
      expect(result).not.toContain('alert')
    })

    it('should remove event handlers', () => {
      const html = '<div onclick="alert(\'xss\')">Click me</div>'
      const result = sanitizeHtml(html)

      expect(result).toContain('Click me')
      expect(result).not.toContain('onclick')
      expect(result).not.toContain('alert')
    })

    it('should remove onerror attribute', () => {
      const html = '<img src="x" onerror="alert(\'xss\')">'
      const result = sanitizeHtml(html)

      expect(result).not.toContain('onerror')
    })

    it('should remove iframe tags', () => {
      const html = '<iframe src="https://evil.com"></iframe>'
      const result = sanitizeHtml(html)

      expect(result).not.toContain('<iframe')
    })

    it('should remove form elements', () => {
      const html = '<form action="/steal"><input type="text"><button>Submit</button></form>'
      const result = sanitizeHtml(html)

      expect(result).not.toContain('<form')
      expect(result).not.toContain('<input')
      expect(result).not.toContain('<button')
    })

    it('should preserve class and id attributes', () => {
      const html = '<div class="card" id="main">Content</div>'
      const result = sanitizeHtml(html)

      expect(result).toContain('class="card"')
      expect(result).toContain('id="main"')
    })

    it('should allow ruby elements for furigana', () => {
      const html = '<ruby>漢字<rt>かんじ</rt></ruby>'
      const result = sanitizeHtml(html)

      expect(result).toContain('<ruby>')
      expect(result).toContain('<rt>')
      expect(result).toContain('漢字')
      expect(result).toContain('かんじ')
    })
  })

  describe('sanitizeCss', () => {
    it('should allow safe CSS properties', () => {
      const css = '.card { color: red; font-size: 16px; }'
      const result = sanitizeCss(css)

      expect(result).toBe(css)
    })

    it('should remove expression() (IE)', () => {
      const css = '.card { width: expression(alert("xss")); }'
      const result = sanitizeCss(css)

      expect(result).not.toContain('expression')
    })

    it('should remove javascript: urls', () => {
      const css = '.card { background: url(javascript:alert("xss")); }'
      const result = sanitizeCss(css)

      expect(result).not.toContain('javascript')
    })

    it('should remove behavior property (IE)', () => {
      const css = '.card { behavior: url(malicious.htc); }'
      const result = sanitizeCss(css)

      expect(result).not.toContain('behavior')
    })

    it('should remove @import', () => {
      const css = '@import url("https://evil.com/styles.css"); .card { color: red; }'
      const result = sanitizeCss(css)

      expect(result).not.toContain('@import')
      expect(result).toContain('color: red')
    })

    it('should remove -moz-binding (Firefox XBL)', () => {
      const css = '.card { -moz-binding: url("evil.xml"); }'
      const result = sanitizeCss(css)

      expect(result).not.toContain('-moz-binding')
    })
  })
})
