/**
 * 採寸の一元化（useTokenBoxes）のテスト。
 *
 * 「表示が変われば採寸が自動で追随する」を、条件の列挙なしで保証していることを
 * 確かめる: レイアウトだけが変わる再描画（answer 等の props 変化を伴わない）でも
 * 箱が新しい位置に更新されること、変化が無ければ状態を更新しないこと。
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { useRef } from 'react'
import { sameBoxes, useTokenBoxes } from './useTokenBoxes'
import type { TokenBox } from '@/lib/pen-syntax/types'

let currentOffset = 0

function Harness({ tokens, onBoxes }: { tokens: string[]; onBoxes: (b: TokenBox[]) => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const wordRefs = useRef<Array<HTMLElement | null>>([])
  const boxes = useTokenBoxes(containerRef, wordRefs, tokens)
  onBoxes(boxes)
  return (
    <div ref={containerRef}>
      {tokens.map((t, i) => (
        <span
          key={i}
          ref={(el) => {
            wordRefs.current[i] = el
          }}
        >
          {t}
        </span>
      ))}
    </div>
  )
}

/** 単語 i の箱を「左端 = i*50 + currentOffset」の模擬レイアウトにする */
function mockLayout() {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.tagName === 'DIV') {
      return { left: 0, right: 500, top: 0, bottom: 100, width: 500, height: 100, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
    }
    const spans = Array.from(this.parentElement?.querySelectorAll('span') ?? [])
    const i = spans.indexOf(this as HTMLSpanElement)
    const left = i * 50 + currentOffset
    return { left, right: left + 40, top: 10, bottom: 30, width: 40, height: 20, x: left, y: 10, toJSON: () => ({}) } as DOMRect
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  currentOffset = 0
})

describe('useTokenBoxes（採寸の一元化）', () => {
  it('初回描画で単語の箱を測り、句読点は除外する', () => {
    mockLayout()
    let latest: TokenBox[] = []
    render(<Harness tokens={['My', 'brother', '.']} onBoxes={(b) => (latest = b)} />)
    expect(latest.map((b) => b.index)).toEqual([0, 1]) // 「.」は句読点なので無い
    expect(latest[0].left).toBe(0)
    expect(latest[1].left).toBe(50)
  })

  it('props が同じ再描画でも、レイアウトが変わっていれば箱が追随する', () => {
    mockLayout()
    let latest: TokenBox[] = []
    const tokens = ['My', 'brother']
    const { rerender } = render(<Harness tokens={tokens} onBoxes={(b) => (latest = b)} />)
    expect(latest[0].left).toBe(0)

    // カッコ挿入などで単語が右へ押された状況（props は同一のまま）
    currentOffset = 18
    rerender(<Harness tokens={tokens} onBoxes={(b) => (latest = b)} />)
    expect(latest[0].left).toBe(18)
    expect(latest[1].left).toBe(68)
  })

  it('レイアウトが変わっていなければ箱の参照は同じまま（無限再描画しない）', () => {
    mockLayout()
    const seen: TokenBox[][] = []
    const tokens = ['My', 'brother']
    const { rerender } = render(<Harness tokens={tokens} onBoxes={(b) => seen.push(b)} />)
    rerender(<Harness tokens={tokens} onBoxes={(b) => seen.push(b)} />)
    const last = seen[seen.length - 1]
    const prev = seen[seen.length - 2]
    expect(last).toBe(prev)
  })
})

describe('sameBoxes', () => {
  const box = (left: number): TokenBox => ({ index: 0, left, right: left + 40, top: 0, bottom: 20 })

  it('0.5px 未満の揺れは同じとみなす', () => {
    expect(sameBoxes([box(10)], [box(10.4)])).toBe(true)
    expect(sameBoxes([box(10)], [box(11)])).toBe(false)
    expect(sameBoxes([box(10)], [])).toBe(false)
  })
})
