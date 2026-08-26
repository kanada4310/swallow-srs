/**
 * ゾーン方式の画面ガード（zone-guard.ts）の純ロジックのテスト。
 *
 * 塾長裁定（2026-08-26）の合格条件を判定レベルで確かめる:
 * - 書き込みエリアの中: ペン専用（指・手のひらは無効）
 * - 書き込みエリアの外: ペンは無効・指は常時有効（時間窓の待ちなし）
 * - 書いている最中に載った手のひらは、区域を問わず離れるまで止める
 * - ペン由来の互換タッチは常に通す（ペンのタップがクリックになる）
 */

import { describe, expect, it } from 'vitest'
import {
  createZoneGuardState,
  decidePenPointer,
  decideTouch,
  decideTouchEvent,
  releaseTouch,
  trackPen,
} from './zone-guard'

const finger = (id: number, x = 300, y = 600) => ({ identifier: id, clientX: x, clientY: y })

describe('zone-guard（ゾーン方式の判定）', () => {
  it('書き込みエリア内の指は止める（ペン専用）', () => {
    const state = createZoneGuardState()
    const d = decideTouch(state, finger(1), 'write', 1000)
    expect(d).toEqual({ allow: false, reason: 'in-write-zone' })
  })

  it('エリア外の指は、ペンを離した直後でも待ちなしで通す', () => {
    const state = createZoneGuardState()
    trackPen(state, 'down', 100, 200, 1000)
    trackPen(state, 'up', 100, 200, 1100)
    // ペンを離した 0.1 秒後にエリア外を指で触る → 即座に通す（時間窓なし）
    const d = decideTouch(state, finger(1), 'page', 1200)
    expect(d).toEqual({ allow: true, reason: 'free-finger' })
  })

  it('ペンが接触中に始まった指＝手のひらは、区域を問わず止める', () => {
    const state = createZoneGuardState()
    trackPen(state, 'down', 100, 200, 1000)
    expect(decideTouch(state, finger(1), 'page', 1050).reason).toBe('while-writing')
    expect(decideTouch(state, finger(2, 120, 260), 'ui', 1060).reason).toBe('while-writing')
  })

  it('止めた手のひらは、ペンを離した後も接触が続く限り止め続ける', () => {
    const state = createZoneGuardState()
    trackPen(state, 'down', 100, 200, 1000)
    expect(decideTouch(state, finger(1), 'page', 1050).allow).toBe(false)
    trackPen(state, 'up', 100, 200, 1100)
    // 同じ接触（identifier=1）の続き → 止め続ける（途中からスクロールに化けない）
    expect(decideTouch(state, finger(1), 'page', 1500).reason).toBe('blocked-continued')
    // 離して新しく触り直したら普通の指として通す
    releaseTouch(state, 1)
    expect(decideTouch(state, finger(1), 'page', 2000).reason).toBe('free-finger')
  })

  it('ペン由来の互換タッチは書き込みエリア内でも通す（タップがクリックになる）', () => {
    const state = createZoneGuardState()
    trackPen(state, 'down', 100, 200, 1000)
    // iPad 系: touchType が stylus
    expect(
      decideTouch(state, { identifier: 3, clientX: 100, clientY: 200, touchType: 'stylus' }, 'write', 1005).reason,
    ).toBe('stylus-type')
    // その他: 直近のペン接触と時間・位置が近い
    expect(decideTouch(state, { identifier: 4, clientX: 102, clientY: 202 }, 'write', 1010).reason).toBe(
      'pen-nearby',
    )
  })

  it('decideTouchEvent はペン由来が1つでもあれば通し、手のひらだけなら止める', () => {
    const state = createZoneGuardState()
    trackPen(state, 'down', 100, 200, 1000)
    const mixed = decideTouchEvent(
      state,
      [finger(1, 300, 600), { identifier: 2, clientX: 101, clientY: 201 }],
      'write',
      1010,
    )
    expect(mixed.allow).toBe(true)
    expect(mixed.reason).toBe('pen-nearby')
    const palmOnly = decideTouchEvent(state, [finger(5, 320, 620)], 'page', 1020)
    expect(palmOnly.allow).toBe(false)
  })

  it('ペンはエリア外では無効・書き込みエリアと操作部品の中では有効', () => {
    expect(decidePenPointer('page')).toEqual({ allow: false, reason: 'pen-out-of-zone' })
    expect(decidePenPointer('write').allow).toBe(true)
    expect(decidePenPointer('ui').allow).toBe(true)
  })
})
