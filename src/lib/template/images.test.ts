import { describe, it, expect } from 'vitest'
import { extractImageUrls, rewriteImageSrcs, hasRemoteImages } from './images'

describe('extractImageUrls', () => {
  it('returns empty for empty/no images', () => {
    expect(extractImageUrls('')).toEqual([])
    expect(extractImageUrls('<p>hello</p>')).toEqual([])
  })

  it('extracts http and https img src', () => {
    const html = '<img src="https://cdn.example.com/a.png"> <img src="http://x.com/b.jpg">'
    expect(extractImageUrls(html)).toEqual([
      'https://cdn.example.com/a.png',
      'http://x.com/b.jpg',
    ])
  })

  it('dedupes repeated URLs', () => {
    const html = '<img src="https://x.com/a.png"><img src="https://x.com/a.png">'
    expect(extractImageUrls(html)).toEqual(['https://x.com/a.png'])
  })

  it('handles single quotes and extra attributes', () => {
    const html = `<img class="card-img" alt="zu" src='https://x.com/c.webp' width="100">`
    expect(extractImageUrls(html)).toEqual(['https://x.com/c.webp'])
  })

  it('ignores data: and blob: and relative URLs', () => {
    const html =
      '<img src="data:image/png;base64,AAAA"><img src="blob:abc"><img src="/local/d.png">'
    expect(extractImageUrls(html)).toEqual([])
  })
})

describe('rewriteImageSrcs', () => {
  it('returns html unchanged when map is empty', () => {
    const html = '<img src="https://x.com/a.png">'
    expect(rewriteImageSrcs(html, new Map())).toBe(html)
  })

  it('replaces only mapped URLs', () => {
    const html = '<img src="https://x.com/a.png"><img src="https://x.com/b.png">'
    const map = new Map([['https://x.com/a.png', 'data:image/png;base64,AAAA']])
    const out = rewriteImageSrcs(html, map)
    expect(out).toContain('src="data:image/png;base64,AAAA"')
    expect(out).toContain('src="https://x.com/b.png"')
  })

  it('preserves the original quote style and other attributes', () => {
    const html = `<img class="c" src='https://x.com/a.png' alt="z">`
    const map = new Map([['https://x.com/a.png', 'data:img']])
    const out = rewriteImageSrcs(html, map)
    expect(out).toBe(`<img class="c" src='data:img' alt="z">`)
  })

  it('replaces all occurrences of the same URL', () => {
    const html = '<img src="https://x.com/a.png"><img src="https://x.com/a.png">'
    const map = new Map([['https://x.com/a.png', 'data:img']])
    const out = rewriteImageSrcs(html, map)
    expect(out).toBe('<img src="data:img"><img src="data:img">')
  })
})

describe('hasRemoteImages', () => {
  it('detects remote images', () => {
    expect(hasRemoteImages('<img src="https://x.com/a.png">')).toBe(true)
    expect(hasRemoteImages('<p>no images</p>')).toBe(false)
    expect(hasRemoteImages('<img src="data:image/png;base64,AA">')).toBe(false)
  })
})
