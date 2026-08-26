/**
 * 実機不具合の記録の再生テスト（2026-08-26 基盤の作り込み）。
 *
 * replays/ に収録した「入力の記録」を、いまの判定ロジックに通し直し、
 * 各不具合が再発しないこと（正しい判定になること）を確かめる。
 * 新しい実機不具合が出たら、「入力の記録」の再生用 JSON を replays/ に置き、
 * ここに期待する挙動を1件足せば再現テストになる。
 */

import { describe, expect, it } from 'vitest'
import type { InputLogDump } from './replay'
import { dumpInputLog, parseInputLogDump, replayGuard, replayLocalPoints, strokeShifts } from './replay'
import penUnresponsive from './replays/2026-08-26-pen-unresponsive.json'
import strokeDrift from './replays/2026-08-26-stroke-drift.json'
import fingerScrollBlocked from './replays/2026-08-26-finger-scroll-blocked.json'

const asDump = (x: unknown): InputLogDump => x as InputLogDump

describe('実機不具合①: ペンが反応しなくなる（ペン由来の互換タッチの遮断）', () => {
  it('ペン接触直後・同じ位置のタッチはペン由来として通す（当時は遮断されていた）', () => {
    const dump = asDump(penUnresponsive)
    const rows = replayGuard(dump.entries)
    expect(rows).toHaveLength(1)
    // 当時の実機では blocked（記録に残っている）。いまの判定では通る
    expect(rows[0].recorded).toBe('blocked')
    expect(rows[0].replayed).toBe('allowed')
    expect(rows[0].reason).toBe('pen-nearby')
  })
})

describe('実機不具合②: 線が常にずれる（ピンチズーム中の座標系の食い違い）', () => {
  it('ズーム中は要素相対座標で計算し直し、当時の誤った座標とは大きくずれる（＝修正が効いている）', () => {
    const dump = asDump(strokeDrift)
    const rows = replayLocalPoints(dump.entries)
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      // ズーム中（vvScale≠1）はブラウザ計算の要素相対座標に切り替わる
      expect(r.source).toBe('element')
      // 当時の記録の local は「画面座標−枠位置」の誤った値なので、大きな drift が出る
      expect(r.drift).toBeGreaterThan(10)
    }
  })

  it('描画中に画面が動いた記録（shift）を抽出できる', () => {
    const dump = asDump(strokeDrift)
    expect(strokeShifts(dump.entries)).toEqual(['スクロール (0,340)→(0,368)'])
  })
})

describe('実機不具合③: ペンを離した直後に指でスクロールできない', () => {
  it('ペン接触中の手のひらは止め、離した後のエリア外の指は待ちなしで通す', () => {
    const dump = asDump(fingerScrollBlocked)
    const rows = replayGuard(dump.entries)
    expect(rows).toHaveLength(2)
    // 書いている最中に載った手のひら → 止める（従来どおり守る）
    expect(rows[0].replayed).toBe('blocked')
    expect(rows[0].reason).toBe('while-writing')
    // ペンを離して 0.4 秒後のエリア外の指 → 当時は blocked、ゾーン方式では待ちなしで通る
    expect(rows[1].recorded).toBe('blocked')
    expect(rows[1].replayed).toBe('allowed')
    expect(rows[1].reason).toBe('free-finger')
  })
})

describe('再生用 JSON の書き出し・読み込み', () => {
  it('dumpInputLog → parseInputLogDump で往復できる', () => {
    const dump = asDump(fingerScrollBlocked)
    const text = dumpInputLog(dump.entries, dump.env)
    const back = parseInputLogDump(text)
    expect(back.entries).toEqual(dump.entries)
    expect(back.env).toEqual(dump.env)
  })

  it('entries の無い JSON は明確なエラーになる', () => {
    expect(() => parseInputLogDump('{"foo":1}')).toThrow('entries')
  })
})
