/**
 * 深さの自動判定とダッシュ表記の相互変換（dash-notation.ts）のテスト。
 * 「生徒はダッシュを書かない・深さは括弧から自動判定・照合ではダッシュ表記に
 * 自動変換（採点同値）」（記号の台帳・確定版 2026-08-26）を確かめる。
 */

import { describe, expect, it } from 'vitest'
import {
  dashesForDepth,
  depthOfToken,
  parseDashedRole,
  rolesEquivalent,
  roleWithDepth,
} from './dash-notation'
import type { StudentSpan } from '@/lib/reading/syntax'

describe('depthOfToken（括弧からの深さの自動判定）', () => {
  const spans: StudentSpan[] = [
    { from: 2, to: 8, type: 'n' }, // 外側の [ ]
    { from: 4, to: 6, type: 'adv' }, // 内側の（ ）
    { from: 0, to: 1, type: 'ul' }, // 下線は深さに数えない
  ]

  it('囲んでいる括弧の数が深さになる（下線は数えない）', () => {
    expect(depthOfToken(spans, 0)).toBe(0) // 下線だけ
    expect(depthOfToken(spans, 3)).toBe(1) // [ ] の中
    expect(depthOfToken(spans, 5)).toBe(2) // [（ ）] の中
    expect(depthOfToken(spans, 9)).toBe(0)
  })
})

describe('ダッシュ表記との相互変換', () => {
  it('深さ 1・2・3 は ′ ″ ‴（模範分析集の表記）', () => {
    expect(roleWithDepth('S', 0)).toBe('S')
    expect(roleWithDepth('S', 1)).toBe('S′')
    expect(roleWithDepth('V', 2)).toBe('V″')
    expect(roleWithDepth('C', 3)).toBe('C‴')
  })

  it('parseDashedRole は表記ゆれ（ASCII の \' など）も受けて深さに戻す', () => {
    expect(parseDashedRole('S′')).toEqual({ role: 'S', depth: 1 })
    expect(parseDashedRole('V″')).toEqual({ role: 'V', depth: 2 })
    expect(parseDashedRole("O'")).toEqual({ role: 'O', depth: 1 })
    expect(parseDashedRole("C''")).toEqual({ role: 'C', depth: 2 })
    expect(parseDashedRole('Po')).toEqual({ role: 'Po', depth: 0 })
    expect(parseDashedRole('▷')).toEqual({ role: '▷', depth: 0 })
  })

  it('往復しても情報が落ちない（相互変換）', () => {
    for (const role of ['S', 'V', 'O', 'C', 'Po']) {
      for (let depth = 0; depth <= 4; depth++) {
        expect(parseDashedRole(roleWithDepth(role, depth))).toEqual({ role, depth })
      }
    }
  })

  it('採点同値: ダッシュの有無を無視して働きを比べる', () => {
    expect(rolesEquivalent('S′', 'S')).toBe(true)
    expect(rolesEquivalent('S″', 'S′')).toBe(true)
    expect(rolesEquivalent('S′', 'O')).toBe(false)
    expect(rolesEquivalent(null, null)).toBe(true)
    expect(rolesEquivalent('S', null)).toBe(false)
  })
})
