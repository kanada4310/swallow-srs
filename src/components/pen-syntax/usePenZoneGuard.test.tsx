/**
 * ゾーン方式の画面ガード（usePenZoneGuard）と描画中の画面固定
 * （freezeScreenDuringStroke）の DOM レベルのテスト。
 * 塾長裁定（2026-08-26）の合格条件をイベントの実配線で確かめる。
 *
 * jsdom には PointerEvent / TouchEvent のコンストラクタが無いため、
 * 素の Event に必要なプロパティを載せて代用する（ガードは型でなく値しか見ない）。
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { freezeScreenDuringStroke, usePenZoneGuard, type PenGuardEvent } from './usePenZoneGuard'
import { PEN_UI_ATTR, PEN_WRITE_ZONE_ATTR } from '@/lib/pen-syntax/zone-guard'

let writeZone: HTMLDivElement
let uiZone: HTMLDivElement
let page: HTMLDivElement

beforeEach(() => {
  writeZone = document.createElement('div')
  writeZone.setAttribute(PEN_WRITE_ZONE_ATTR, '')
  uiZone = document.createElement('div')
  uiZone.setAttribute(PEN_UI_ATTR, '')
  page = document.createElement('div')
  document.body.append(writeZone, uiZone, page)
})

afterEach(() => {
  writeZone.remove()
  uiZone.remove()
  page.remove()
})

function fire(el: Element, type: string, props: Record<string, unknown>, t: number): Event {
  const ev = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(ev, props)
  Object.defineProperty(ev, 'timeStamp', { value: t })
  el.dispatchEvent(ev)
  return ev
}

const pen = (x: number, y: number) => ({ pointerType: 'pen', clientX: x, clientY: y })
const fingers = (id: number, x: number, y: number) => ({
  changedTouches: [{ identifier: id, clientX: x, clientY: y }],
})

describe('usePenZoneGuard（ゾーン方式の実配線）', () => {
  it('書き込みエリア内の指は止め、エリア外の指はペンを離した直後でも通す', () => {
    const events: PenGuardEvent[] = []
    renderHook(() => usePenZoneGuard(true, (e) => events.push(e)))

    // 書き込みエリア内の指 → 止める（ペン専用）
    const inWrite = fire(writeZone, 'touchstart', fingers(1, 100, 200), 1000)
    expect(inWrite.defaultPrevented).toBe(true)

    // ペンで書いて離した 0.1 秒後、エリア外を指でスクロール → 待ちなしで通す
    fire(writeZone, 'pointerdown', pen(100, 200), 2000)
    fire(writeZone, 'pointerup', pen(100, 200), 2100)
    const outside = fire(page, 'touchstart', fingers(2, 300, 600), 2200)
    expect(outside.defaultPrevented).toBe(false)

    expect(events.map((e) => [e.action, e.reason])).toEqual([
      ['blocked', 'in-write-zone'],
      ['allowed', 'free-finger'],
    ])
    expect(events[0].zone).toBe('write')
    expect(events[1].zone).toBe('page')
  })

  it('書いている最中に載った手のひらは、エリア外でも止める（画面が暴れない）', () => {
    renderHook(() => usePenZoneGuard(true))
    fire(writeZone, 'pointerdown', pen(100, 200), 1000)
    const palm = fire(page, 'touchstart', fingers(1, 300, 600), 1050)
    expect(palm.defaultPrevented).toBe(true)
    // ペンを離しても、載せたままの手のひらの続きは止め続ける
    fire(writeZone, 'pointerup', pen(100, 200), 1100)
    const cont = fire(page, 'touchmove', fingers(1, 300, 610), 1300)
    expect(cont.defaultPrevented).toBe(true)
  })

  it('エリア外のペンは無効（ボタンは指で押す）・操作部品の中のペンは有効', () => {
    const events: PenGuardEvent[] = []
    renderHook(() => usePenZoneGuard(true, (e) => events.push(e)))
    const outside = fire(page, 'pointerdown', pen(400, 700), 1000)
    expect(outside.defaultPrevented).toBe(true)
    expect(events[0]).toMatchObject({ event: 'pen-down', action: 'blocked', reason: 'pen-out-of-zone' })

    const onUi = fire(uiZone, 'pointerdown', pen(200, 300), 1100)
    expect(onUi.defaultPrevented).toBe(false)
    const onWrite = fire(writeZone, 'pointerdown', pen(100, 200), 1200)
    expect(onWrite.defaultPrevented).toBe(false)
  })

  it('エリア外のペン由来クリックは握りつぶす（誤タップ防止）', () => {
    renderHook(() => usePenZoneGuard(true))
    const click = fire(page, 'click', { pointerType: 'pen', clientX: 400, clientY: 700 }, 1000)
    expect(click.defaultPrevented).toBe(true)
    // 操作部品の中のクリックは通す
    const uiClick = fire(uiZone, 'click', { pointerType: 'pen', clientX: 200, clientY: 300 }, 1100)
    expect(uiClick.defaultPrevented).toBe(false)
    // 指のクリックは通す
    const fingerClick = fire(page, 'click', { clientX: 400, clientY: 700 }, 1200)
    expect(fingerClick.defaultPrevented).toBe(false)
  })

  it('ペン由来の互換タッチは通す（ペンのタップがクリックになる）', () => {
    renderHook(() => usePenZoneGuard(true))
    fire(writeZone, 'pointerdown', pen(100, 200), 1000)
    const compat = fire(writeZone, 'touchstart', fingers(9, 102, 201), 1010)
    expect(compat.defaultPrevented).toBe(false)
  })

  it('無効（active=false）のときは何もしない', () => {
    renderHook(() => usePenZoneGuard(false))
    const ev = fire(writeZone, 'touchstart', fingers(1, 100, 200), 1000)
    expect(ev.defaultPrevented).toBe(false)
    const penEv = fire(page, 'pointerdown', pen(400, 700), 1100)
    expect(penEv.defaultPrevented).toBe(false)
  })
})

describe('freezeScreenDuringStroke（線を描いている最中に画面が動かない）', () => {
  it('固定中は touchmove を止め、解除で元に戻す', () => {
    const unfreeze = freezeScreenDuringStroke()
    const during = new Event('touchmove', { bubbles: true, cancelable: true })
    document.dispatchEvent(during)
    expect(during.defaultPrevented).toBe(true)

    unfreeze()
    const after = new Event('touchmove', { bubbles: true, cancelable: true })
    document.dispatchEvent(after)
    expect(after.defaultPrevented).toBe(false)
  })
})
