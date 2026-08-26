/**
 * 画面ガード（usePenScreenGuard）と描画中の画面固定（freezeScreenDuringStroke）の
 * DOMレベルのテスト。2026-08-26 使いやすさ改修の合格条件②③をイベントの実配線で確かめる。
 *
 * jsdom には PointerEvent / TouchEvent のコンストラクタが無いため、
 * 素の Event に必要なプロパティを載せて代用する（ガードは型でなく値しか見ない）。
 */

import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { freezeScreenDuringStroke, usePenScreenGuard, type PenGuardEvent } from './usePenScreenGuard'
import { PEN_RELEASE_MS } from '@/lib/pen-syntax/finger-guard'

function fire(type: string, props: Record<string, unknown>, t: number): Event {
  const ev = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(ev, props)
  Object.defineProperty(ev, 'timeStamp', { value: t })
  document.dispatchEvent(ev)
  return ev
}

const pen = (x: number, y: number) => ({ pointerType: 'pen', clientX: x, clientY: y })
const fingers = (id: number, x: number, y: number) => ({
  changedTouches: [{ identifier: id, clientX: x, clientY: y }],
})

describe('usePenScreenGuard（時間窓方式の実配線）', () => {
  it('ペン接触中の指は止め、離して窓が明けた後の指は通す（合格条件①②）', () => {
    const events: PenGuardEvent[] = []
    renderHook(() => usePenScreenGuard(true, (e) => events.push(e)))

    fire('pointerdown', pen(100, 200), 1000)
    // 書いている最中に手のひらが画面下部へ → 止まる
    const palm = fire('touchstart', fingers(1, 300, 600), 1050)
    expect(palm.defaultPrevented).toBe(true)

    fire('pointerup', pen(100, 200), 1100)
    // 離した直後はまだ止める（画と画の間の手のひら）
    const early = fire('touchstart', fingers(2, 300, 600), 1100 + PEN_RELEASE_MS - 100)
    expect(early.defaultPrevented).toBe(true)

    // 窓が明けたら通す＝描画エリア外の指スクロールが効く
    const late = fire('touchstart', fingers(3, 300, 600), 1100 + PEN_RELEASE_MS + 1)
    expect(late.defaultPrevented).toBe(false)

    expect(events.map((e) => e.action)).toEqual(['blocked', 'blocked', 'allowed'])
    expect(events[0].reason).toBe('pen-writing')
    expect(events[1].reason).toBe('pen-recent')
    expect(events[2].reason).toBe('finger-free')
  })

  it('ペンを一度も見ていなければ指を止めない（指だけの生徒に影響しない）', () => {
    renderHook(() => usePenScreenGuard(true))
    const ev = fire('touchstart', fingers(1, 300, 600), 1000)
    expect(ev.defaultPrevented).toBe(false)
  })

  it('無効（active=false）のときは何もしない', () => {
    renderHook(() => usePenScreenGuard(false))
    fire('pointerdown', pen(100, 200), 1000)
    const ev = fire('touchstart', fingers(1, 300, 600), 1050)
    expect(ev.defaultPrevented).toBe(false)
  })
})

describe('freezeScreenDuringStroke（合格条件③: 線を描いている最中に画面が動かない）', () => {
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
