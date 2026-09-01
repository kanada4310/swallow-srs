/**
 * 判別率・吸着精度の機械計測（作業指示書の「二車線の計測」の自動化部分）。
 *
 * 手書きの揺れを乱数で模した線（大きさ・傾き・歪み・点のばらつきを変えたもの）を
 * 記号ごとに何十本も生成し、判別器に通して数える。乱数は種を固定してあり毎回同じ結果になる。
 *
 * ※ これは「機械生成の線」に対する実測であり、実機のペンで書いた線の実測は
 *    /reading/syntax/pen-lab ページで人の手により行う（完了報告に区別して記載）。
 */

import { describe, expect, it } from 'vitest'
import type { PenPoint, PenStroke, ShapeKind, SymbolId, TokenBox } from './types'
import { classifyShape } from './shapes'
import { classifyExceptionMark } from './recognize'
import { classifyPosLetter, classifyRoleLetter, type UserTemplateStore } from './letters'
import { POS_STROKE_SOURCES, ROLE_STROKE_SOURCES } from './templates'
import { snapCloseBracket, snapHorizontalRange, snapNearestToken, snapOpenBracket } from './snap'
import { strokesBBox } from './geometry'
// 合成ストロークの生成器は synthetic-strokes.ts に切り出した（accuracy.test.ts と共用）
import {
  arcPts,
  drawShape,
  gauss,
  jitter,
  line,
  mulberry32,
  QUIRK_KINDS,
  quirkClose,
  quirkStore,
  rand,
  type Rng,
} from './synthetic-strokes'

interface Tally {
  total: number
  top1: number
  rescued: number // 最有力では外したが候補チップ（上位3）には入っていた
  failed: number
  confusions: Map<string, number>
}

function tally(): Tally {
  return { total: 0, top1: 0, rescued: 0, failed: 0, confusions: new Map() }
}

function record(t: Tally, intended: SymbolId, result: { best: { symbol: SymbolId } | null; candidates: Array<{ symbol: SymbolId }> }) {
  t.total++
  if (result.best?.symbol === intended) {
    t.top1++
    return
  }
  if (result.candidates.some((c) => c.symbol === intended)) {
    t.rescued++
  } else {
    t.failed++
  }
  const key = `${intended}→${result.best?.symbol ?? '（なし）'}`
  t.confusions.set(key, (t.confusions.get(key) ?? 0) + 1)
}

function pct(n: number, d: number): string {
  return d === 0 ? '-' : `${((n / d) * 100).toFixed(1)}%`
}

function report(label: string, t: Tally) {
  const conf = Array.from(t.confusions.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k, v]) => `${k}×${v}`)
    .join(' / ')
  console.log(
    `[計測] ${label}: 一発判別 ${pct(t.top1, t.total)} ・候補タップで確定 ${pct(t.rescued, t.total)} ` +
      `・拾えず ${pct(t.failed, t.total)}（n=${t.total}）${conf ? ` 主な取り違え: ${conf}` : ''}`,
  )
}

const N = 40

describe('判別率の機械計測（種固定・毎回同じ結果）', () => {
  it('群A（括弧4種＋下線）: 一発判別 90% 以上・救済込み 97% 以上', () => {
    const rng = mulberry32(20260825)
    const kinds: ShapeKind[] = [
      'paren-open', 'paren-close', 'square-open', 'square-close',
      'angle-open', 'angle-close', 'brace-open', 'brace-close', 'hline',
    ]
    const t = tally()
    const perKind = new Map<string, Tally>()
    for (const kind of kinds) {
      const kt = tally()
      for (let i = 0; i < N; i++) {
        const strokes = drawShape(kind, rng)
        const r = classifyShape(strokes)
        record(t, kind, r)
        record(kt, kind, r)
      }
      perKind.set(kind, kt)
    }
    Array.from(perKind.entries()).forEach(([k, kt]) => report(`群A ${k}`, kt))
    report('群A 合計', t)
    expect(t.top1 / t.total).toBeGreaterThanOrEqual(0.9)
    expect((t.top1 + t.rescued) / t.total).toBeGreaterThanOrEqual(0.97)
  })

  it('群B（波線＋台帳外の形の検出）: 救済込み 85% 以上', () => {
    // 波線は台帳の記号（熟語の印）。○・?・ダッシュ・Ø は台帳外だが、
    // 「書かれたら正しくその形と検出して案内する」（別記号に化けない）ために測り続ける
    const rng = mulberry32(20260826)
    const kinds: ShapeKind[] = ['circle', 'wavy', 'question', 'tick', 'null-sign']
    const t = tally()
    const perKind = new Map<string, Tally>()
    for (const kind of kinds) {
      const kt = tally()
      for (let i = 0; i < N; i++) {
        const strokes = drawShape(kind, rng)
        const r = classifyShape(strokes)
        record(t, kind, r)
        record(kt, kind, r)
      }
      perKind.set(kind, kt)
    }
    Array.from(perKind.entries()).forEach(([k, kt]) => report(`群B ${k}`, kt))
    report('群B 合計', t)
    expect((t.top1 + t.rescued) / t.total).toBeGreaterThanOrEqual(0.85)
  })

  it('群C 働きの文字（S/V/O/C/P/Po/▷/＋）: 救済込み 90% 以上', () => {
    const rng = mulberry32(20260827)
    const t = tally()
    const perKind = new Map<string, Tally>()
    for (const src of ROLE_STROKE_SOURCES) {
      const kt = perKind.get(src.symbol) ?? tally()
      for (let i = 0; i < N; i++) {
        const strokes = jitter(src.strokes, rng, { size: rand(rng, 18, 30), noise: 1.2, rotDeg: 5 })
        const r = classifyRoleLetter(strokes)
        record(t, src.symbol, r)
        record(kt, src.symbol, r)
      }
      perKind.set(src.symbol, kt)
    }
    Array.from(perKind.entries()).forEach(([k, kt]) => report(`群C 働き ${k}`, kt))
    report('群C 働き 合計', t)
    expect((t.top1 + t.rescued) / t.total).toBeGreaterThanOrEqual(0.9)
  })

  it('群C 品詞の文字（英字5種 n/v/a/ad/aux）: 救済込み 80% 以上', () => {
    const rng = mulberry32(20260828)
    const t = tally()
    const perKind = new Map<string, Tally>()
    for (const src of POS_STROKE_SOURCES) {
      const kt = perKind.get(src.symbol) ?? tally()
      for (let i = 0; i < N; i++) {
        const strokes = jitter(src.strokes, rng, { size: rand(rng, 20, 32), noise: 1.2, rotDeg: 4 })
        const r = classifyPosLetter(strokes)
        record(t, src.symbol, r)
        record(kt, src.symbol, r)
      }
      perKind.set(src.symbol, kt)
    }
    Array.from(perKind.entries()).forEach(([k, kt]) => report(`群C 品詞 ${k}`, kt))
    report('群C 品詞 合計', t)
    expect((t.top1 + t.rescued) / t.total).toBeGreaterThanOrEqual(0.8)
  })
})

describe('お手本登録による閉じ括弧の判別強化（機械計測）', () => {
  it('癖のある閉じ括弧: お手本登録で一発判別が改善する（数字はコンソールに出力）', () => {
    const rng = mulberry32(20260902)
    const store = quirkStore()
    const before = tally()
    const after = tally()
    for (const kind of QUIRK_KINDS) {
      const b = tally()
      const a = tally()
      for (let i = 0; i < N; i++) {
        const strokes = quirkClose(kind, rng)
        const rb = classifyShape(strokes)
        const ra = classifyShape(strokes, store)
        record(before, kind, rb)
        record(b, kind, rb)
        record(after, kind, ra)
        record(a, kind, ra)
      }
      report(`閉じ括弧（癖あり・お手本なし）${kind}`, b)
      report(`閉じ括弧（癖あり・お手本あり）${kind}`, a)
    }
    report('閉じ括弧（癖あり・お手本なし）合計', before)
    report('閉じ括弧（癖あり・お手本あり）合計', after)
    // お手本登録で一発判別が確実に良くなり、救済込みでは 97% 以上に達すること
    expect(after.top1).toBeGreaterThan(before.top1)
    expect((after.top1 + after.rescued) / after.total).toBeGreaterThanOrEqual(0.97)
  })

  it('標準的な字の利用者がお手本を登録しても、判別は劣化しない', () => {
    // 実運用ではお手本と本番の線は同じ人の手になる。標準的な字の利用者を模す
    const enrollRng = mulberry32(20260903)
    const store: UserTemplateStore = {}
    const brackets: ShapeKind[] = [
      'paren-open', 'paren-close', 'square-open', 'square-close',
      'angle-open', 'angle-close', 'brace-open', 'brace-close',
    ]
    for (const kind of brackets) {
      store[kind] = [drawShape(kind, enrollRng), drawShape(kind, enrollRng)]
    }
    const rng = mulberry32(20260825) // 群A のベンチと同じ種・同じ線で比較する
    const t = tally()
    for (const kind of [...brackets, 'hline' as ShapeKind]) {
      for (let i = 0; i < N; i++) {
        record(t, kind, classifyShape(drawShape(kind, rng), store))
      }
    }
    report('群A（同じ書き手のお手本あり）合計', t)
    expect(t.top1 / t.total).toBeGreaterThanOrEqual(0.9)
    expect((t.top1 + t.rescued) / t.total).toBeGreaterThanOrEqual(0.97)
  })
})

/* ---------- ○で囲んだ漢字の例外マーク（台帳・確定版） ---------- */

/** 「仮」に見立てた粗い字画（$P 照合は点群の形しか見ないため、骨格が再現できていればよい） */
function kanjiKaStrokes(): PenStroke[] {
  return [
    line([18, 22], [10, 48]),
    line([14, 32], [14, 88]),
    line([42, 22], [34, 84]),
    line([40, 24], [86, 24]),
    line([56, 42], [44, 84]),
    line([56, 42], [84, 84]),
  ]
}

/** 「真」に見立てた粗い字画 */
function kanjiShinStrokes(): PenStroke[] {
  return [
    line([20, 14], [80, 14]),
    line([50, 6], [50, 30]),
    line([28, 30], [72, 30], [72, 68], [28, 68], [28, 30]),
    line([28, 44], [72, 44]),
    line([20, 82], [42, 72]),
    line([80, 82], [58, 72]),
  ]
}

describe('○で囲んだ漢字の例外マークの機械計測', () => {
  it('お手本登録があれば、円＋中の字画から正しい漢字を候補に出せる（救済込み 85% 以上）', () => {
    const rng = mulberry32(20260905)
    const sources: Array<{ symbol: string; strokes: PenStroke[] }> = [
      { symbol: '仮', strokes: kanjiKaStrokes() },
      { symbol: '真', strokes: kanjiShinStrokes() },
    ]
    // 本人のお手本（2本ずつ・種固定の揺れ）
    const store: UserTemplateStore = {}
    for (const s of sources) {
      store[s.symbol] = [
        jitter(s.strokes, rng, { size: 30, noise: 0.8, rotDeg: 3 }),
        jitter(s.strokes, rng, { size: 30, noise: 0.8, rotDeg: 3 }),
      ]
    }
    const t = tally()
    for (const s of sources) {
      for (let i = 0; i < N; i++) {
        const inner = jitter(s.strokes, rng, { size: rand(rng, 24, 34), noise: 1.0, rotDeg: 4 })
        const b = strokesBBox(inner.flat().length ? inner : [[{ x: 0, y: 0 }]])
        const r = rand(rng, 0.7, 0.9) * Math.max(b.width, b.height)
        const start = rand(rng, 0, 360)
        const circle = arcPts(b.cx, b.cy, Math.max(r, 26), start, start + rand(rng, 335, 360))
        const result = classifyExceptionMark([circle, ...inner], store)
        if (!result) {
          t.total++
          t.failed++
          continue
        }
        record(t, s.symbol as SymbolId, result)
      }
    }
    report('○囲みの漢字（お手本あり）', t)
    expect((t.top1 + t.rescued) / t.total).toBeGreaterThanOrEqual(0.85)
  })
})

describe('吸着精度の機械計測', () => {
  /** 実画面に近い寸法の単語箱（幅はまちまち・間隔12px・本文の帯 y=40〜68） */
  function makeBoxes(rng: Rng): TokenBox[] {
    const boxes: TokenBox[] = []
    let x = 16
    for (let i = 0; i < 8; i++) {
      const w = rand(rng, 34, 96)
      boxes.push({ index: i, left: x, right: x + w, top: 40, bottom: 68 })
      x += w + 12
    }
    return boxes
  }

  it('括弧の吸着（狙った単語の前/後に付くか）: 95% 以上', () => {
    const rng = mulberry32(20260829)
    let total = 0
    let ok = 0
    for (let trial = 0; trial < 200; trial++) {
      const boxes = makeBoxes(rng)
      const target = Math.floor(rand(rng, 0, boxes.length))
      const t = boxes[target]
      // 開き括弧: 単語の左端の少し左に、ばらつきをもって書く
      const x = t.left - rand(rng, 1, 5) + gauss(rng, 2.5)
      const open = [line([x + 5, 42], [x, 54], [x + 5, 66])]
      if (snapOpenBracket(open, boxes)?.index === target) ok++
      total++
      // 閉じ括弧: 右端の少し右
      const x2 = t.right + rand(rng, 1, 5) + gauss(rng, 2.5)
      const close = [line([x2 - 5, 42], [x2, 54], [x2 - 5, 66])]
      if (snapCloseBracket(close, boxes)?.index === target) ok++
      total++
    }
    console.log(`[計測] 吸着 括弧: ${pct(ok, total)}（n=${total}）`)
    expect(ok / total).toBeGreaterThanOrEqual(0.95)
  })

  it('同じすき間に重ねた閉じ括弧・狭くて食い込んだ括弧も、同じ単語に付く（2026-09-01 項目4）', () => {
    // 検討会・論点1の症状3「閉じカッコが重なると付く位置が前後する」の回帰テスト。
    // 従来の「一番近い単語の端」だと、すき間を越えて次の単語に食い込んだ線が
    // 1語ぶんずれて付くことがあった。境界を単語の中央にして解消
    const boxes = makeBoxes(mulberry32(20260916))
    const t = boxes[3]
    const next = boxes[4]
    const mkClose = (x: number) => [line([x - 5, 42], [x, 54], [x - 5, 66])]
    // 内側: すき間の左寄り / 外側: すき間を越えて次の単語の左端に少し食い込む
    const innerX = t.right + 3
    const outerX = next.left + Math.min(10, (next.right - next.left) * 0.3)
    expect(snapCloseBracket(mkClose(innerX), boxes)?.index).toBe(3)
    expect(snapCloseBracket(mkClose(outerX), boxes)?.index).toBe(3)
    // 開き括弧も同様: 前の単語の末尾に食い込んで書いても、右どなりの単語の前に付く
    const mkOpen = (x: number) => [line([x + 5, 42], [x, 54], [x + 5, 66])]
    const openX = t.right - Math.min(10, (t.right - t.left) * 0.3)
    expect(snapOpenBracket(mkOpen(openX), boxes)?.index).toBe(4)
  })

  it('下線の吸着（狙った範囲に一致するか）: 90% 以上', () => {
    const rng = mulberry32(20260830)
    let total = 0
    let ok = 0
    for (let trial = 0; trial < 200; trial++) {
      const boxes = makeBoxes(rng)
      const from = Math.floor(rand(rng, 0, 6))
      const to = Math.min(7, from + Math.floor(rand(rng, 0, 3)))
      const a = boxes[from]
      const b = boxes[to]
      // 端は単語の途中から書き始めたり少しはみ出したりする
      const x1 = a.left + rand(rng, -6, (a.right - a.left) * 0.3)
      const x2 = b.right + rand(rng, -(b.right - b.left) * 0.3, 8)
      const ul = [line([x1, 74 + gauss(rng, 2)], [x2, 74 + gauss(rng, 2)])]
      const r = snapHorizontalRange(ul, boxes)
      if (r && r.from === from && r.to === to) ok++
      total++
    }
    console.log(`[計測] 吸着 下線: ${pct(ok, total)}（n=${total}）`)
    expect(ok / total).toBeGreaterThanOrEqual(0.9)
  })

  it('文字の吸着（狙った単語のマスに入るか）: 95% 以上', () => {
    const rng = mulberry32(20260831)
    let total = 0
    let ok = 0
    for (let trial = 0; trial < 200; trial++) {
      const boxes = makeBoxes(rng)
      const target = Math.floor(rand(rng, 0, boxes.length))
      const t = boxes[target]
      const cx = (t.left + t.right) / 2 + gauss(rng, 6)
      const letter = [line([cx - 8, 80], [cx + 8, 94])]
      if (snapNearestToken(letter, boxes)?.index === target) ok++
      total++
    }
    console.log(`[計測] 吸着 文字: ${pct(ok, total)}（n=${total}）`)
    expect(ok / total).toBeGreaterThanOrEqual(0.95)
  })
})
