import { describe, it, expect } from 'vitest'
import { buildSrcdoc } from './CardIframe'

describe('buildSrcdoc', () => {
  it('should produce a valid HTML document', () => {
    const result = buildSrcdoc('<p>Hello</p>', '', 'frame-1')

    expect(result).toContain('<!DOCTYPE html>')
    expect(result).toContain('<html>')
    expect(result).toContain('</html>')
    expect(result).toContain('<head>')
    expect(result).toContain('</head>')
    expect(result).toContain('<body>')
    expect(result).toContain('</body>')
  })

  it('should include the html content inside a card div', () => {
    const result = buildSrcdoc('<p>Hello</p>', '', 'frame-1')

    expect(result).toContain('<div class="card"><p>Hello</p></div>')
  })

  it('should include user CSS in the style tag', () => {
    const css = '.card { color: red; font-size: 24px; }'
    const result = buildSrcdoc('<p>Hello</p>', css, 'frame-1')

    expect(result).toContain(css)
  })

  it('should include cloze styles', () => {
    const result = buildSrcdoc('<span class="cloze-deletion">test</span>', '', 'frame-1')

    expect(result).toContain('.cloze-deletion.cloze-hidden')
    expect(result).toContain('.cloze-deletion.cloze-answer')
  })

  it('should include ResizeObserver script', () => {
    const result = buildSrcdoc('<p>Hello</p>', '', 'frame-1')

    expect(result).toContain('ResizeObserver')
    expect(result).toContain('postMessage')
    expect(result).toContain('card-iframe-resize')
  })

  it('should include the frameId in the script', () => {
    const result = buildSrcdoc('<p>Hello</p>', '', 'my-unique-id')

    expect(result).toContain('my-unique-id')
  })

  it('should handle special characters in html', () => {
    const result = buildSrcdoc('<p>日本語テスト & "quotes"</p>', '', 'frame-1')

    expect(result).toContain('日本語テスト & "quotes"')
  })
})
