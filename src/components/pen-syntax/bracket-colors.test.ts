/**
 * 入れ子カッコの深さ別の色が、読みやすさの条件を満たしていることの見張り。
 *
 * 色を入れ替えるときは、ここが緑のままであることを必ず確かめる。
 * 数値の出し直しは `node scripts/bracket-colors.mjs`（同じ計算を使っている）。
 */

import { describe, it, expect } from 'vitest'
import { BRACKET_COLORS } from './PenSyntaxAnnotator'
import { contrastOnWhite, lab, hue, hueDiff, minDeltaE } from '../../../scripts/bracket-colors.mjs'

describe('入れ子カッコの深さ別の色', () => {
  it('白地に対する明暗の比が4色とも 4.5:1 以上（小さな文字の推奨）', () => {
    BRACKET_COLORS.forEach((c) => {
      expect(contrastOnWhite(c), c).toBeGreaterThanOrEqual(4.5)
    })
  })

  it('隣り合う深さは補色に近い（色相の差 141〜165度）', () => {
    for (let i = 0; i < BRACKET_COLORS.length; i++) {
      const j = (i + 1) % BRACKET_COLORS.length
      const d = hueDiff(hue(BRACKET_COLORS[i]), hue(BRACKET_COLORS[j]))
      expect(d, `深さ${i}↔${j}`).toBeGreaterThanOrEqual(141)
      expect(d, `深さ${i}↔${j}`).toBeLessThanOrEqual(165)
    }
  })

  it('2つ違いの深さは明るさで分かれている（明度 L* の差 25 以上）', () => {
    ;[[0, 2], [1, 3]].forEach(([i, j]) => {
      const d = Math.abs(lab(BRACKET_COLORS[i])[0] - lab(BRACKET_COLORS[j])[0])
      expect(d, `深さ${i}↔${j}`).toBeGreaterThanOrEqual(25)
    })
  })

  it('色覚の型によらず差が残る（全6組のうちいちばん近い組の色の差が 29 以上）', () => {
    ;[null, 'protan', 'deutan', 'tritan'].forEach((type) => {
      const { min, pair } = minDeltaE(BRACKET_COLORS, type)
      expect(min, `${type ?? '一般'} ${pair}`).toBeGreaterThanOrEqual(29)
    })
  })
})
