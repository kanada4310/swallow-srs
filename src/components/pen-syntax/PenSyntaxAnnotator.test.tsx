/**
 * ペン入力部品の下線オーバーレイの回帰テスト。
 *
 * 不具合（2026-08-26 本番で発見）: 同じ行の左側にカッコがあると、右側の単語の
 * 下線がカッコの幅ぶん左にずれる。原因は、単語の箱の採寸（measure）が
 * 「文が変わったとき」「枠の大きさが変わったとき」にしか走らず、
 * カッコ記号の挿入（正解表示・書き込み）で単語が右へ押されても
 * 測り直していなかったこと。
 *
 * jsdom は実レイアウトを持たないため、getBoundingClientRect を
 * 「文書順で前にあるテキスト1文字=10px」の模擬レイアウトに差し替えて、
 * カッコ挿入で単語が右へ押される状況を再現する。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { PenSyntaxAnnotator } from './PenSyntaxAnnotator'
import type { SyntaxAnswer } from '@/lib/reading/syntax'

const CHAR_W = 10

/** 文書順で el より前にあるテキスト量と、el 自身のテキスト量を数える */
function textLengths(el: Element): { before: number; own: number } {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  let before = 0
  let own = 0
  let node: Node | null
  while ((node = walker.nextNode())) {
    const len = (node.textContent ?? '').length
    if (el.contains(node)) own += len
    else if (el.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_PRECEDING) before += len
  }
  return { before, own }
}

function emptyAnswer(n: number): SyntaxAnswer {
  return { pos: Array(n).fill(null), role: Array(n).fill(null), spans: [] }
}

// 例文②「The girl standing by the door is my sister.」
const TOKENS = ['The', 'girl', 'standing', 'by', 'the', 'door', 'is', 'my', 'sister', '.']

describe('PenSyntaxAnnotator 下線オーバーレイ', () => {
  beforeEach(() => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      const { before, own } = textLengths(this)
      const left = before * CHAR_W
      const right = left + own * CHAR_W
      return {
        left,
        right,
        top: 0,
        bottom: 24,
        width: right - left,
        height: 24,
        x: left,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('カッコ挿入で単語が右へ押されたら、下線も押された後の位置に描かれる（採寸のやり直し）', () => {
    const { container, rerender } = render(
      <PenSyntaxAnnotator tokens={TOKENS} answer={emptyAnswer(TOKENS.length)} onChange={() => {}} />,
    )

    // 正解表示に相当: 〈standing by the door〉のカッコと、その範囲の下線を同時に差し込む
    const model: SyntaxAnswer = {
      ...emptyAnswer(TOKENS.length),
      spans: [
        { from: 2, to: 5, type: 'adjm' },
        { from: 2, to: 5, type: 'ul' },
      ],
    }
    rerender(<PenSyntaxAnnotator tokens={TOKENS} answer={model} onChange={() => {}} />)

    // 下線の連結線分（bg-ink の絶対配置 div）が描かれている
    const underlines = Array.from(container.querySelectorAll('div.bg-ink')) as HTMLDivElement[]
    expect(underlines.length).toBeGreaterThan(0)

    // 期待値: いま現在（カッコ挿入後）の「standing」の箱の左端（コンテナ相対）
    const containerDiv = container.querySelector('div.relative') as HTMLElement
    const wordSpans = Array.from(containerDiv.querySelectorAll('span.font-serif'))
    const standing = wordSpans.find((el) => el.textContent === 'standing') as HTMLElement
    const door = wordSpans.find((el) => el.textContent === 'door') as HTMLElement
    expect(standing).toBeTruthy()
    expect(door).toBeTruthy()
    const cLeft = containerDiv.getBoundingClientRect().left
    const expectedLeft = standing.getBoundingClientRect().left - cLeft
    const expectedRight = door.getBoundingClientRect().right - cLeft

    // 修正前は初回採寸（カッコ無し）の古い箱から線を引くため、カッコの幅ぶん左にずれていた
    const left = parseFloat(underlines[0].style.left)
    const width = parseFloat(underlines[0].style.width)
    expect(left).toBeCloseTo(expectedLeft, 5)
    expect(left + width).toBeCloseTo(expectedRight, 5)
  })
})

describe('PenSyntaxAnnotator バッジのレイアウト（2026-08-26 実機不具合の再発防止）', () => {
  it('「手のひらOK」バッジはペン接触前から場所を確保している（初回接触の瞬間に画面が動かない）', () => {
    // 不具合: ペンの初回接触でバッジが出現し、書いている最中に画面レイアウトが
    // 下へずれて線の狙いが狂った。場所を常に確保し表示だけ切り替える。
    const { container } = render(
      <PenSyntaxAnnotator tokens={TOKENS} answer={emptyAnswer(TOKENS.length)} onChange={() => {}} />,
    )
    const badge = Array.from(container.querySelectorAll('span')).find((el) =>
      (el.textContent ?? '').includes('手のひらを載せてもOK'),
    )
    expect(badge).toBeTruthy()
    expect(badge!.className).toContain('invisible')
  })
})
