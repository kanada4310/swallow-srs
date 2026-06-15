/**
 * Tests for KaTeX math rendering (Phase 13.4).
 */

import { describe, it, expect } from 'vitest'
import { containsMath, renderMath } from './math'

describe('containsMath', () => {
  it('detects \\( \\[ and $$ delimiters', () => {
    expect(containsMath('a \\(x^2\\) b')).toBe(true)
    expect(containsMath('\\[ E = mc^2 \\]')).toBe(true)
    expect(containsMath('$$ a+b $$')).toBe(true)
  })
  it('returns false for plain text and single $', () => {
    expect(containsMath('hello world')).toBe(false)
    expect(containsMath('価格は $5 です')).toBe(false) // 単一 $ は対象外
  })
})

describe('renderMath', () => {
  it('passes through html without math unchanged', () => {
    const html = '<div>no math here</div>'
    expect(renderMath(html)).toBe(html)
  })

  it('renders inline math \\( ... \\) to KaTeX html', () => {
    const out = renderMath('質量とエネルギー \\(x^2\\) です')
    expect(out).toContain('katex')
    expect(out).not.toContain('\\(')
    // 周囲のテキストは保持
    expect(out).toContain('質量とエネルギー')
    expect(out).toContain('です')
  })

  it('renders display math \\[ ... \\] and $$ ... $$', () => {
    const a = renderMath('\\[ E = mc^2 \\]')
    expect(a).toContain('katex')
    expect(a).toContain('katex-display')
    const b = renderMath('$$ a + b $$')
    expect(b).toContain('katex')
    expect(b).toContain('katex-display')
  })

  it('renders multiple expressions in one string', () => {
    const out = renderMath('\\(a\\) と \\(b\\)')
    const count = (out.match(/class="katex"/g) || []).length
    expect(count).toBe(2)
  })

  it('does not throw on invalid TeX (throwOnError:false)', () => {
    expect(() => renderMath('\\(\\frac{\\）')).not.toThrow()
  })
})
