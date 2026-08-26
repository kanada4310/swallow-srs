/**
 * ペン入力の実機不具合2件（2026-08-26）の再発防止テスト。
 *
 * 症状1「ペンが反応しなくなる」: 画面ガードがペン由来の互換タッチまで
 * 止めていた → ペン由来タッチの判定（classifyTouchContact）を検証する。
 * 症状2「線がずれる」: ピンチズーム中の座標系の食い違い → 座標変換の
 * 切り替え（resolveLocalPoint）と、画面移動の検出（describeScreenShift）を検証する。
 * あわせて診断用「入力の記録」の整形・保持を検証する。
 */

import { describe, expect, it } from 'vitest'
import {
  classifyTouchContact,
  PEN_TOUCH_MS,
  PEN_TOUCH_RADIUS,
} from './palm'
import { isViewportTransformed, resolveLocalPoint } from './local-point'
import {
  createPenInputLog,
  describeScreenShift,
  formatInputLog,
  type InputLogEntry,
  type ScreenSnapshot,
} from './input-log'

describe('classifyTouchContact（ペン由来タッチの判定）', () => {
  it('touchType が stylus ならペン由来（iPad 系）', () => {
    expect(
      classifyTouchContact({ clientX: 10, clientY: 10, touchType: 'stylus' }, null, 1000),
    ).toBe('stylus-type')
  })

  it('直近のペン接触と時間・位置が近いタッチはペン由来（互換タッチ）', () => {
    const pen = { x: 100, y: 200, t: 1000 }
    expect(classifyTouchContact({ clientX: 102, clientY: 198 }, pen, 1010)).toBe('pen-nearby')
    // 判定の境界: 半径ちょうどは許容
    expect(
      classifyTouchContact({ clientX: 100 + PEN_TOUCH_RADIUS, clientY: 200 }, pen, 1010),
    ).toBe('pen-nearby')
  })

  it('位置が遠い・時間が経ったタッチは指（手のひら）', () => {
    const pen = { x: 100, y: 200, t: 1000 }
    expect(classifyTouchContact({ clientX: 300, clientY: 500 }, pen, 1010)).toBe('finger')
    expect(
      classifyTouchContact({ clientX: 100, clientY: 200 }, pen, 1000 + PEN_TOUCH_MS + 1),
    ).toBe('finger')
  })

  it('ペンをまだ見ていなければ指扱い', () => {
    expect(classifyTouchContact({ clientX: 100, clientY: 200 }, null, 1000)).toBe('finger')
  })
})

describe('resolveLocalPoint（画面の移動・拡大に強い座標変換）', () => {
  const base = { clientX: 150, clientY: 250, rectLeft: 50, rectTop: 100 }

  it('通常時は「画面座標 − 枠の位置」で計算する', () => {
    const p = resolveLocalPoint({ ...base, offsetX: 999, offsetY: 999, vvScale: 1, vvOffsetLeft: 0, vvOffsetTop: 0 })
    expect(p).toEqual({ x: 100, y: 150, source: 'rect' })
  })

  it('表示域API が無い環境（テスト環境含む）も枠の位置から計算する', () => {
    const p = resolveLocalPoint(base)
    expect(p).toEqual({ x: 100, y: 150, source: 'rect' })
  })

  it('ピンチズーム中はブラウザ計算の要素相対座標に切り替える', () => {
    const p = resolveLocalPoint({
      ...base,
      offsetX: 80,
      offsetY: 120,
      vvScale: 2,
      vvOffsetLeft: 30,
      vvOffsetTop: 40,
    })
    expect(p).toEqual({ x: 80, y: 120, source: 'element' })
  })

  it('表示域が動いていても要素相対座標が無ければ従来計算に戻す', () => {
    const p = resolveLocalPoint({ ...base, vvScale: 2, vvOffsetLeft: 30, vvOffsetTop: 40 })
    expect(p.source).toBe('rect')
  })

  it('isViewportTransformed は倍率・移動のどちらかで真', () => {
    expect(isViewportTransformed({ vvScale: 1, vvOffsetLeft: 0, vvOffsetTop: 0 })).toBe(false)
    expect(isViewportTransformed({ vvScale: 1.5, vvOffsetLeft: 0, vvOffsetTop: 0 })).toBe(true)
    expect(isViewportTransformed({ vvScale: 1, vvOffsetLeft: 0, vvOffsetTop: 12 })).toBe(true)
    expect(isViewportTransformed({ vvScale: null })).toBe(false)
  })
})

const snap = (over: Partial<ScreenSnapshot> = {}): ScreenSnapshot => ({
  rectLeft: 40,
  rectTop: 400,
  scrollX: 0,
  scrollY: 120,
  vvOffsetLeft: 0,
  vvOffsetTop: 0,
  vvScale: 1,
  ...over,
})

describe('describeScreenShift（描画中の画面移動の検出）', () => {
  it('動いていなければ null', () => {
    expect(describeScreenShift(snap(), snap())).toBeNull()
    // 1px 以内の揺れは無視
    expect(describeScreenShift(snap(), snap({ rectTop: 400.5 }))).toBeNull()
  })

  it('枠の移動・スクロール・倍率の変化を言葉で返す', () => {
    expect(describeScreenShift(snap(), snap({ rectTop: 372 }))).toContain('枠')
    expect(describeScreenShift(snap(), snap({ scrollY: 148 }))).toContain('スクロール')
    expect(describeScreenShift(snap(), snap({ vvScale: 1.6 }))).toContain('倍率')
    expect(describeScreenShift(snap(), snap({ vvOffsetTop: 33 }))).toContain('表示域')
  })
})

describe('入力の記録（作成・整形・保持）', () => {
  const env = { userAgent: 'TestUA', devicePixelRatio: 2, visualViewportSupported: true }

  it('受理/拒否・ガード・画面移動が読める形で整形される', () => {
    const entries: InputLogEntry[] = [
      {
        kind: 'pointer',
        at: 1000,
        phase: 'down',
        pointerType: 'pen',
        pointerId: 3,
        client: { x: 120, y: 84 },
        local: { x: 80, y: 52 },
        offset: { x: 79, y: 51 },
        contact: { w: 0, h: 0 },
        accepted: true,
        reason: 'pen',
        screen: snap(),
      },
      {
        kind: 'pointer',
        at: 1200,
        phase: 'down',
        pointerType: 'touch',
        pointerId: 4,
        client: { x: 300, y: 500 },
        local: { x: 260, y: 100 },
        contact: { w: 28, h: 30 },
        accepted: false,
        reason: 'touch-rejected-policy',
      },
      { kind: 'guard', at: 1210, event: 'touchstart', action: 'blocked', reason: 'finger', x: 300, y: 500 },
      { kind: 'guard', at: 1220, event: 'touchstart', action: 'allowed', reason: 'pen-nearby', x: 120, y: 84 },
      { kind: 'shift', at: 1500, during: 'stroke', detail: 'スクロール (0,120)→(0,148)' },
    ]
    const text = formatInputLog(entries, env)
    expect(text).toContain('ペン down')
    expect(text).toContain('受理(pen)')
    expect(text).toContain('拒否(touch-rejected-policy)')
    expect(text).toContain('接触=28x30')
    expect(text).toContain('遮断(finger)')
    expect(text).toContain('通過(pen-nearby)')
    expect(text).toContain('⚠ 画面移動（線を描いている最中）')
    expect(text).toContain('端末: TestUA')
  })

  it('直近の件数だけ保持し、購読者に通知する', () => {
    const log = createPenInputLog(3)
    let notified = 0
    const off = log.subscribe(() => notified++)
    for (let i = 0; i < 5; i++) {
      log.push({ kind: 'note', at: i, text: `n${i}` })
    }
    expect(log.entries()).toHaveLength(3)
    expect(log.entries()[0]).toEqual({ kind: 'note', at: 2, text: 'n2' })
    expect(notified).toBe(5)
    log.clear()
    expect(log.entries()).toHaveLength(0)
    off()
  })
})
