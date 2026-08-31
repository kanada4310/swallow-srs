/**
 * ペン入力部品の重ね描き（下線・カッコ）の回帰テスト。
 *
 * 不具合①（2026-08-26 本番で発見）: 単語の箱の採寸（measure）が
 * 「文が変わったとき」「枠の大きさが変わったとき」にしか走らず、
 * 表示が変わって単語が右へ押されても測り直していなかったため下線がずれた。
 * 不具合②（2026-08-27 塾長の実機）: カッコを文の流れに差し込んでいたため、
 * カッコを書いた瞬間に後ろの単語が右へ押され、書き込もうとしていた場所が動いた。
 *
 * jsdom は実レイアウトを持たないため、getBoundingClientRect を
 * 「文書順で前にあるテキスト1文字=10px」の模擬レイアウトに差し替えて、
 * 「前に文字が増えると右へ押される」状況を再現する。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render } from '@testing-library/react'
import { PenSyntaxAnnotator } from './PenSyntaxAnnotator'
import { createPenInputLog } from '@/lib/pen-syntax/input-log'
import { GROUP_WAIT_MS } from './useStrokeGrouping'
import { ROLE_ROW_H } from '@/lib/pen-syntax/snap'
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

describe('PenSyntaxAnnotator 重ね描き（下線・カッコ）', () => {
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

  it('採点マークが出て単語が右へ押されても、下線は押された後の位置に描かれる（採寸のやり直し）', () => {
    const { container, rerender } = render(
      <PenSyntaxAnnotator tokens={TOKENS} answer={emptyAnswer(TOKENS.length)} onChange={() => {}} />,
    )

    // 正解表示に相当: 〈standing by the door〉の下線と、単語の下に出る採点の注記を
    // 同時に差し込む（注記のぶんだけ後ろの単語が右へ押される）
    const model: SyntaxAnswer = {
      ...emptyAnswer(TOKENS.length),
      spans: [{ from: 2, to: 5, type: 'ul' }],
    }
    rerender(
      <PenSyntaxAnnotator
        tokens={TOKENS}
        answer={model}
        onChange={() => {}}
        posMarks={{ 2: { mark: 'bad', correct: '分詞' } }}
      />,
    )

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

    // 修正前は初回採寸の古い箱から線を引くため、押された幅ぶん左にずれていた
    const left = parseFloat(underlines[0].style.left)
    const width = parseFloat(underlines[0].style.width)
    expect(left).toBeCloseTo(expectedLeft, 5)
    expect(left + width).toBeCloseTo(expectedRight, 5)
  })

  it('カッコを足しても単語の位置は動かない（文の流れから外して重ね描きする）', () => {
    const { container, rerender } = render(
      <PenSyntaxAnnotator tokens={TOKENS} answer={emptyAnswer(TOKENS.length)} onChange={() => {}} />,
    )
    const wordLefts = () => {
      const c = container.querySelector('div.relative') as HTMLElement
      const cLeft = c.getBoundingClientRect().left
      return Array.from(c.querySelectorAll('span.font-serif')).map(
        (el) => el.getBoundingClientRect().left - cLeft,
      )
    }
    const before = wordLefts()
    expect(before).toHaveLength(TOKENS.length)

    // 入れ子のカッコ（[ ]の中に〈 〉）＋閉じ待ちの書きかけを一度に差し込む
    const withBrackets: SyntaxAnswer = {
      ...emptyAnswer(TOKENS.length),
      spans: [
        { from: 0, to: 5, type: 'n', role: 'S' },
        { from: 2, to: 5, type: 'adjm' },
      ],
    }
    rerender(
      <PenSyntaxAnnotator tokens={TOKENS} answer={withBrackets} onChange={() => {}} />,
    )

    // 修正前はカッコが単語の直前・直後に差し込まれ、後ろの単語が右へ押されていた
    expect(wordLefts()).toEqual(before)

    // カッコは絶対配置の重ね描きとして出ている（開き2つ・閉じ2つ＋まとまりの働き）
    const overlay = Array.from(
      container.querySelectorAll('div.relative > span > span.absolute'),
    ).map((el) => el.textContent)
    expect(overlay).toContain('[')
    expect(overlay).toContain(']')
    // 山括弧は半角の ⟨ ⟩（U+27E8 / U+27E9・2026-08-28 に幅をそろえた）
    expect(overlay).toContain('⟨')
    expect(overlay).toContain('⟩')
    expect(overlay).toContain('S')
  })

  it('採点しても単語の位置は1画素も動かない（指摘を文の流れから外して重ね描きする）', () => {
    // 塾長の実機の指摘（2026-08-27）: 採点の指摘が単語の下に流し込まれ、
    // 指摘の幅ぶん後ろの単語が右へ押されて並びがガタついていた
    const { container, rerender } = render(
      <PenSyntaxAnnotator tokens={TOKENS} answer={emptyAnswer(TOKENS.length)} onChange={() => {}} />,
    )
    const wordGeom = () => {
      const c = container.querySelector('div.relative') as HTMLElement
      const cRect = c.getBoundingClientRect()
      return Array.from(c.querySelectorAll('span.font-serif')).map((el) => {
        const r = el.getBoundingClientRect()
        return { left: r.left - cRect.left, top: r.top - cRect.top }
      })
    }
    const before = wordGeom()

    // 採点: 複数の単語で品詞・働きの両方が誤りだった状態
    rerender(
      <PenSyntaxAnnotator
        tokens={TOKENS}
        answer={emptyAnswer(TOKENS.length)}
        onChange={() => {}}
        posMarks={{
          0: { mark: 'bad', correct: 'a' },
          2: { mark: 'bad', correct: 'v' },
          6: { mark: 'bad', correct: 'v' },
        }}
        roleMarks={{
          1: { mark: 'bad', correct: 'S' },
          6: { mark: 'bad', correct: 'V' },
          8: { mark: 'bad', correct: 'C' },
        }}
      />,
    )

    // 修正前は指摘が文の流れの中にあり、後ろの単語が右へ押されていた
    expect(wordGeom()).toEqual(before)

    // 指摘は重ね描き（絶対配置）として、正しい品詞・働きを短く出す
    const notes = Array.from(container.querySelectorAll('span.text-again.absolute')).map(
      (el) => el.textContent,
    )
    expect(notes).toContain('品詞 a')
    expect(notes).toContain('働き S')
    expect(notes).toContain('品詞 v働き V')
  })

  it('カッコの真下の働きは、単語の下の働きの欄と同じ高さの帯に置く', () => {
    // 塾長の実機の指摘（2026-08-27）: カッコに書いた働きだけ高さがズレていた
    const { container } = render(
      <PenSyntaxAnnotator
        tokens={TOKENS}
        onChange={() => {}}
        answer={{
          ...emptyAnswer(TOKENS.length),
          role: emptyAnswer(TOKENS.length).role.map((_, i) => (i === 1 ? 'S' : null)),
          spans: [{ from: 0, to: 5, type: 'n', role: 'C' }],
        }}
      />,
    )
    const c = container.querySelector('div.relative') as HTMLElement
    // 単語の下の働きのマス（Cell）は単語の外枠の下端から高さ ROLE_ROW_H（min-h-6）
    // 深さの印（自動ダッシュ）が付くので前方一致で探す
    const cell = Array.from(c.querySelectorAll('button')).find((el) =>
      el.textContent?.startsWith('S'),
    )
    expect(cell?.className).toContain('min-h-6')
    expect(cell?.className).toContain('text-xs')
    // カッコの真下の働きも同じ上端・同じ高さ・同じ文字の大きさ（中央そろえ）
    const bracketRole = Array.from(c.querySelectorAll('span.absolute')).find(
      (el) => el.textContent === 'C',
    ) as HTMLElement
    const word = c.querySelector('span.font-serif') as HTMLElement
    const cRect = c.getBoundingClientRect()
    expect(bracketRole.style.top).toBe(`${word.getBoundingClientRect().bottom - cRect.top}px`)
    expect(bracketRole.style.height).toBe(`${ROLE_ROW_H}px`)
    expect(bracketRole.className).toContain('text-xs')
    expect(bracketRole.className).toContain('items-center')
  })
})

describe('PenSyntaxAnnotator 例外の印のタッチ選択（2026-08-31 ○囲みの手書き認識の廃止）', () => {
  function answerWithRole(i: number, role: string): SyntaxAnswer {
    const a = emptyAnswer(TOKENS.length)
    a.role[i] = role
    return a
  }

  /** 働きのマス（Cell）を探してタップし、一覧（picker）を開く */
  function openRolePicker(container: HTMLElement, text: string) {
    const cell = Array.from(container.querySelectorAll('button')).find(
      (el) => el.className.includes('min-h-6') && (el.textContent ?? '').startsWith(text),
    ) as HTMLButtonElement
    expect(cell).toBeTruthy()
    fireEvent.click(cell)
  }

  it('S のマスをタッチすると「○仮」を付けられ、働きの欄に「仮S」と出る（採点データは不変）', () => {
    const changes: SyntaxAnswer[] = []
    const { container } = render(
      <PenSyntaxAnnotator
        tokens={TOKENS}
        answer={answerWithRole(1, 'S')}
        onChange={(next) => changes.push(next)}
      />,
    )
    openRolePicker(container, 'S')
    const kari = Array.from(container.querySelectorAll('button')).find(
      (el) => el.textContent === '○仮',
    ) as HTMLButtonElement
    expect(kari).toBeTruthy()
    expect(kari.disabled).toBe(false)
    act(() => {
      fireEvent.click(kari)
    })
    // 印は extras（採点対象外）に入り、answer.role は 'S' のまま＝採点は変わらない
    expect(changes[changes.length - 1].role[1]).toBe('S')
    const cell = Array.from(container.querySelectorAll('button')).find((el) =>
      (el.textContent ?? '').startsWith('仮S'),
    )
    expect(cell).toBeTruthy()
  })

  it('働きが S / O でない単語では仮・真は押せない（強は押せる）', () => {
    const { container } = render(
      <PenSyntaxAnnotator
        tokens={TOKENS}
        answer={answerWithRole(6, 'V')}
        onChange={() => {}}
      />,
    )
    openRolePicker(container, 'V')
    const btn = (label: string) =>
      Array.from(container.querySelectorAll('button')).find(
        (el) => el.textContent === label,
      ) as HTMLButtonElement
    expect(btn('○仮').disabled).toBe(true)
    expect(btn('○真').disabled).toBe(true)
    expect(btn('○強').disabled).toBe(false)
  })

  it('働きを S から V に変えると、付けてあった仮の印も一緒に外れる', () => {
    const { container } = render(
      <PenSyntaxAnnotator
        tokens={TOKENS}
        answer={answerWithRole(1, 'S')}
        onChange={() => {}}
      />,
    )
    openRolePicker(container, 'S')
    act(() => {
      fireEvent.click(
        Array.from(container.querySelectorAll('button')).find(
          (el) => el.textContent === '○仮',
        ) as HTMLButtonElement,
      )
    })
    expect(
      Array.from(container.querySelectorAll('button')).some((el) =>
        (el.textContent ?? '').startsWith('仮S'),
      ),
    ).toBe(true)
    // もう一度マスを開き、働きを V に変える
    openRolePicker(container, '仮S')
    act(() => {
      const options = Array.from(container.querySelectorAll('button')).filter(
        (el) => el.textContent === 'V',
      )
      fireEvent.click(options[options.length - 1])
    })
    expect(
      Array.from(container.querySelectorAll('button')).some((el) =>
        (el.textContent ?? '').includes('仮'),
      ),
    ).toBe(false)
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


/**
 * 続けて書いた記号が1つにまとめられてしまう不具合（2026-08-27 塾長の実機フィードバック）の
 * 配線テスト。ペンが触れた瞬間に、前の記号が確定していることを確かめる。
 * jsdom は実レイアウトを持たないので、単語の箱を固定の座標に差し替える。
 */
describe('PenSyntaxAnnotator 続けて書いたときの確定（2026-08-27）', () => {
  const WORDS = ['aa', 'bb', 'cc', 'dd']
  // 単語の箱: 幅40・間隔20・本文の帯 y=40〜68。品詞の段はその上
  const boxOf = (i: number) => ({ left: 16 + i * 60, right: 56 + i * 60, top: 40, bottom: 68 })

  beforeEach(() => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      const text = this.textContent ?? ''
      const i = WORDS.indexOf(text)
      const isWord = i >= 0 && (this as HTMLElement).className?.includes('font-serif')
      const r = isWord ? boxOf(i) : { left: 0, right: 400, top: 0, bottom: 140 }
      return {
        ...r,
        width: r.right - r.left,
        height: r.bottom - r.top,
        x: r.left,
        y: r.top,
        toJSON: () => ({}),
      } as DOMRect
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  /** 品詞の段（単語の上）に1画書く */
  function writeLetterAbove(canvas: Element, i: number) {
    const cx = (boxOf(i).left + boxOf(i).right) / 2
    fireEvent.pointerDown(canvas, { pointerId: 1, pointerType: 'pen', clientX: cx - 5, clientY: 20 })
    fireEvent.pointerMove(canvas, { pointerId: 1, pointerType: 'pen', clientX: cx + 5, clientY: 30 })
    fireEvent.pointerUp(canvas, { pointerId: 1, pointerType: 'pen', clientX: cx + 4, clientY: 36 })
  }

  it('隣の単語に書き始めた瞬間、前の記号が確定する（0.75秒待たない）', () => {
    const log = createPenInputLog()
    const { container } = render(
      <PenSyntaxAnnotator
        tokens={WORDS}
        answer={emptyAnswer(WORDS.length)}
        onChange={() => {}}
        inputLog={log}
      />,
    )
    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    expect(canvas).toBeTruthy()

    writeLetterAbove(canvas, 0)
    // まだ確定していない（同じ記号の続きを待っている）
    expect(log.entries().filter((e) => e.kind === 'commit')).toHaveLength(0)

    // 隣の単語の上に書き始める → その瞬間に前の記号が確定する
    const cx = (boxOf(1).left + boxOf(1).right) / 2
    fireEvent.pointerDown(canvas, { pointerId: 2, pointerType: 'pen', clientX: cx - 5, clientY: 20 })
    const commits = log.entries().filter((e) => e.kind === 'commit')
    expect(commits).toHaveLength(1)
    expect(commits[0]).toMatchObject({ trigger: 'boundary-start', strokes: 1 })
  })
})

/**
 * 候補が出ている最中に書き始めても線を失わないこと（2026-08-27）。
 *
 * 直前の改修で「隣に書き始めた瞬間に確定する」ようになった副作用として、
 * 判別に迷ったときの候補が**書いている最中に**出るようになった。候補が出ている間
 * 書き込みを止めていると、テンポよく書いたときに次の記号の1画目が黙って消え、
 * 「ペンが反応しない」のと同じ体験になる。この経路にはテストが無かった。
 */
describe('PenSyntaxAnnotator 候補が出ている最中の書き始め（2026-08-27）', () => {
  const WORDS2 = ['aa', 'bb', 'cc', 'dd']
  const boxOf2 = (i: number) => ({ left: 16 + i * 60, right: 56 + i * 60, top: 40, bottom: 68 })

  beforeEach(() => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      const text = this.textContent ?? ''
      const i = WORDS2.indexOf(text)
      const isWord = i >= 0 && (this as HTMLElement).className?.includes('font-serif')
      const r = isWord ? boxOf2(i) : { left: 0, right: 400, top: 0, bottom: 140 }
      return {
        ...r,
        width: r.right - r.left,
        height: r.bottom - r.top,
        x: r.left,
        y: r.top,
        toJSON: () => ({}),
      } as DOMRect
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  /** 判別に迷う（候補チップが出る）ぐらい崩れた線を、単語 i の上の段に書く */
  function scribbleAbove(canvas: Element, i: number, pointerId: number) {
    const cx = (boxOf2(i).left + boxOf2(i).right) / 2
    const pts = [
      [cx - 8, 14],
      [cx + 6, 26],
      [cx - 7, 22],
      [cx + 8, 12],
      [cx - 3, 30],
      [cx + 2, 16],
    ]
    fireEvent.pointerDown(canvas, {
      pointerId,
      pointerType: 'pen',
      clientX: pts[0][0],
      clientY: pts[0][1],
    })
    for (const [x, y] of pts.slice(1)) {
      fireEvent.pointerMove(canvas, { pointerId, pointerType: 'pen', clientX: x, clientY: y })
    }
    const last = pts[pts.length - 1]
    fireEvent.pointerUp(canvas, {
      pointerId,
      pointerType: 'pen',
      clientX: last[0],
      clientY: last[1],
    })
  }

  const chipsShown = (container: HTMLElement) =>
    (container.textContent ?? '').includes('どの記号ですか？')

  it('候補が出ている最中に書き始めても、その線は受け付けられ候補は引っ込む', () => {
    vi.useFakeTimers()
    const log = createPenInputLog()
    const { container } = render(
      <PenSyntaxAnnotator
        tokens={WORDS2}
        answer={emptyAnswer(WORDS2.length)}
        onChange={() => {}}
        inputLog={log}
      />,
    )
    const canvas = container.querySelector('canvas') as HTMLCanvasElement

    // 迷う線を1つ書き、待ち時間切れで確定させる → 候補チップが出る
    scribbleAbove(canvas, 0, 1)
    act(() => {
      vi.advanceTimersByTime(GROUP_WAIT_MS + 50)
    })
    expect(chipsShown(container)).toBe(true)

    // 候補が出たまま、次の記号を書き始める
    const before = log.entries().filter((e) => e.kind === 'commit').length
    scribbleAbove(canvas, 2, 2)

    // 1画目から受け付けられている（接触が受理され、線が確定まで進む）
    const downs = log
      .entries()
      .filter((e) => e.kind === 'pointer' && e.phase === 'down' && e.pointerId === 2)
    expect(downs).toHaveLength(1)
    expect(downs[0]).toMatchObject({ accepted: true })
    // 候補は引っ込んでいる
    expect(chipsShown(container)).toBe(false)

    act(() => {
      vi.advanceTimersByTime(GROUP_WAIT_MS + 50)
    })
    const commits = log.entries().filter((e) => e.kind === 'commit')
    expect(commits.length).toBe(before + 1)
    expect(commits[commits.length - 1]).toMatchObject({ strokes: 1 })
  })

  it('候補が未確定のまま次の字を書き始めたら、前の字は最有力候補で自動確定する（2026-08-31）', () => {
    // 従来は破棄され、書いた判定が黙って失われた（確定仕様3）
    vi.useFakeTimers()
    const log = createPenInputLog()
    const changes: SyntaxAnswer[] = []
    const { container } = render(
      <PenSyntaxAnnotator
        tokens={WORDS2}
        answer={emptyAnswer(WORDS2.length)}
        onChange={(next) => changes.push(next)}
        inputLog={log}
      />,
    )
    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    scribbleAbove(canvas, 0, 1)
    act(() => {
      vi.advanceTimersByTime(GROUP_WAIT_MS + 50)
    })
    expect(chipsShown(container)).toBe(true)
    // 候補の枠には最有力候補のボタンが出ている（＝候補が1つ以上ある）
    const panel = container.querySelector('div.z-20') as HTMLElement
    expect(panel.querySelectorAll('button').length).toBeGreaterThan(1)

    // 候補が出たまま、別の単語に次の字を書き始める
    scribbleAbove(canvas, 2, 2)
    expect(chipsShown(container)).toBe(false)
    // 前の字が最有力候補で確定し、解答（1語目の品詞）に入っている
    expect(changes.length).toBeGreaterThan(0)
    expect(changes[changes.length - 1].pos[0]).not.toBeNull()
    // 自動確定した事実は入力の記録に残る
    expect(
      log.entries().some((e) => e.kind === 'note' && e.text.includes('自動確定')),
    ).toBe(true)
  })

  it('候補を押す操作は従来どおり効く（押した接触はキャンバスに届かない）', () => {
    vi.useFakeTimers()
    const changes: SyntaxAnswer[] = []
    const { container } = render(
      <PenSyntaxAnnotator
        tokens={WORDS2}
        answer={emptyAnswer(WORDS2.length)}
        onChange={(next) => changes.push(next)}
      />,
    )
    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    scribbleAbove(canvas, 0, 1)
    act(() => {
      vi.advanceTimersByTime(GROUP_WAIT_MS + 50)
    })
    const panel = container.querySelector('div.z-20') as HTMLElement
    expect(panel).toBeTruthy()
    // 候補の枠はキャンバス（z-10）より上（z-20）にあり、押した接触はキャンバスに届かない
    expect(canvas.className).toContain('z-10')
    const first = panel.querySelector('button') as HTMLButtonElement
    act(() => {
      fireEvent.click(first)
    })
    // 候補は閉じ、選んだ記号が解答に入っている
    expect(chipsShown(container)).toBe(false)
    expect(changes.length).toBeGreaterThan(0)
    expect(changes[changes.length - 1].pos.some((v) => v != null)).toBe(true)
  })

  it('候補の枠の外を軽くタップしたら、候補が閉じるだけ（一覧は開かない）', () => {
    vi.useFakeTimers()
    const { container } = render(
      <PenSyntaxAnnotator tokens={WORDS2} answer={emptyAnswer(WORDS2.length)} onChange={() => {}} />,
    )
    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    scribbleAbove(canvas, 0, 1)
    act(() => {
      vi.advanceTimersByTime(GROUP_WAIT_MS + 50)
    })
    expect(chipsShown(container)).toBe(true)

    // 単語の上の段を軽くタップ（ふだんは品詞の一覧が開く場所）
    const cx = (boxOf2(2).left + boxOf2(2).right) / 2
    act(() => {
      fireEvent.pointerDown(canvas, { pointerId: 9, pointerType: 'pen', clientX: cx, clientY: 20 })
      fireEvent.pointerUp(canvas, { pointerId: 9, pointerType: 'pen', clientX: cx, clientY: 20 })
    })
    expect(chipsShown(container)).toBe(false)
    const pickerOpen = Array.from(container.querySelectorAll('div')).some((d) =>
      d.className.includes('z-[60]'),
    )
    expect(pickerOpen).toBe(false)
  })
})
