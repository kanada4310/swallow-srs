/**
 * ペン入力モード中の指の扱い（finger-guard）のテスト。
 *
 * 2026-08-26 の使いやすさ改修の合格条件3つに対応する:
 * ① 手のひらを載せたまま書ける（ペンの接近・接触中の指は止める）
 * ② ペンを離した後、描画エリア外を指で普通にスクロールできる（窓が明けたら通す）
 * ③ 線を描いている最中に画面が動かない（freezeScreenDuringStroke 側。
 *    usePenScreenGuard.test.tsx で検証）
 */

import { describe, expect, it } from 'vitest'
import {
  createFingerGuardState,
  decideTouch,
  decideTouchEvent,
  PEN_RELEASE_MS,
  releaseTouch,
  trackPen,
} from './finger-guard'

const touch = (id: number, x = 300, y = 600, touchType?: string) => ({
  identifier: id,
  clientX: x,
  clientY: y,
  touchType,
})

describe('finger-guard 合格条件①: 手のひらを載せたまま書ける', () => {
  it('ペンが接触中に始まった指は止める', () => {
    const s = createFingerGuardState()
    trackPen(s, 'down', 100, 200, 1000)
    expect(decideTouch(s, touch(1), 1050)).toEqual({ allow: false, reason: 'pen-writing' })
  })

  it('ペンのホバー中（接触前）に載せた手のひらも止める', () => {
    const s = createFingerGuardState()
    trackPen(s, 'move', 100, 200, 1000) // 接触前のホバー
    expect(decideTouch(s, touch(1), 1100)).toEqual({ allow: false, reason: 'pen-recent' })
  })

  it('画と画の間（ペンを離した直後）に載せ直した手のひらも止める（境界＝窓ちょうどまで）', () => {
    const s = createFingerGuardState()
    trackPen(s, 'down', 100, 200, 1000)
    trackPen(s, 'up', 100, 200, 1200)
    expect(decideTouch(s, touch(1), 1200 + PEN_RELEASE_MS)).toEqual({
      allow: false,
      reason: 'pen-recent',
    })
  })

  it('止めた手のひらは、窓が明けても離れるまで止め続ける（途中からスクロールに化けない）', () => {
    const s = createFingerGuardState()
    trackPen(s, 'down', 100, 200, 1000)
    expect(decideTouch(s, touch(1), 1050).allow).toBe(false)
    trackPen(s, 'up', 100, 200, 1100)
    expect(decideTouch(s, touch(1), 1100 + PEN_RELEASE_MS + 500)).toEqual({
      allow: false,
      reason: 'blocked-continued',
    })
  })
})

describe('finger-guard 合格条件②: ペンを離した後は指でスクロールできる', () => {
  it('ペンを離して窓が明けてから始まった指は通す', () => {
    const s = createFingerGuardState()
    trackPen(s, 'down', 100, 200, 1000)
    trackPen(s, 'up', 100, 200, 1200)
    expect(decideTouch(s, touch(2), 1200 + PEN_RELEASE_MS + 1)).toEqual({
      allow: true,
      reason: 'finger-free',
    })
  })

  it('ペンをまだ一度も見ていなければ指は普通に通す（指だけの生徒に影響しない）', () => {
    const s = createFingerGuardState()
    expect(decideTouch(s, touch(1), 1000)).toEqual({ allow: true, reason: 'finger-free' })
  })

  it('止めた接触が離れた後の新しい接触は改めて判定する', () => {
    const s = createFingerGuardState()
    trackPen(s, 'down', 100, 200, 1000)
    expect(decideTouch(s, touch(1), 1050).allow).toBe(false)
    trackPen(s, 'up', 100, 200, 1100)
    releaseTouch(s, 1)
    expect(decideTouch(s, touch(1), 1100 + PEN_RELEASE_MS + 1)).toEqual({
      allow: true,
      reason: 'finger-free',
    })
  })
})

describe('finger-guard ペン由来の互換タッチは常に通す（8/26 修正の維持）', () => {
  it('touchType=stylus は通す（iPad 系）', () => {
    const s = createFingerGuardState()
    trackPen(s, 'down', 100, 200, 1000)
    expect(decideTouch(s, touch(1, 100, 200, 'stylus'), 1010)).toEqual({
      allow: true,
      reason: 'stylus-type',
    })
  })

  it('直近のペン接触と時間・位置が近いタッチは、ペン接触中でも通す', () => {
    const s = createFingerGuardState()
    trackPen(s, 'down', 100, 200, 1000)
    expect(decideTouch(s, touch(1, 102, 198), 1010)).toEqual({ allow: true, reason: 'pen-nearby' })
  })
})

describe('finger-guard decideTouchEvent（イベント単位の畳み込み）', () => {
  it('ペン由来の接触が1つでもあれば通す（止めるとペンのタップが死ぬ）', () => {
    const s = createFingerGuardState()
    trackPen(s, 'down', 100, 200, 1000)
    const d = decideTouchEvent(s, [touch(1, 400, 700), touch(2, 100, 200, 'stylus')], 1010)
    expect(d.allow).toBe(true)
  })

  it('ペン由来が無く止める判定があれば止める', () => {
    const s = createFingerGuardState()
    trackPen(s, 'down', 100, 200, 1000)
    expect(decideTouchEvent(s, [touch(1, 400, 700)], 1010)).toEqual({
      allow: false,
      reason: 'pen-writing',
    })
  })

  it('接触が空なら通す（安全側＝何も止めない）', () => {
    const s = createFingerGuardState()
    expect(decideTouchEvent(s, [], 1000).allow).toBe(true)
  })
})
