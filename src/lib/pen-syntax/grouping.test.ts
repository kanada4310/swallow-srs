/**
 * 画のまとめ判定と「確定までの時間」の計測（2026-08-27）。
 *
 * 塾長の実機フィードバック:「書き込んでから読み取られて描画されるまでの間、
 * すべてが1つの記号として認識されてしまう」への対処が効いていることを、
 * ①切る/切らないの判定 ②まとめの正しさ ③確定までの時間 の3つで確かめる。
 *
 * ※ ②③は「画面の寸法と書く速さを模した合成データ」に対する計算であり、
 *    実機のペンで測った値ではない。実機の実測は /reading/syntax/pen-lab の
 *    「確定までの時間（速さの計測）」で人が行う。
 */

import { describe, expect, it } from 'vitest'
import type { PenPoint, PenStroke, TokenBox } from './types'
import {
  groupBreakReason,
  isSoloRuleStroke,
  shouldGroupStrokes,
  simulateCommits,
  type CommitEvent,
} from './grouping'

/* ---------- 画面の寸法を模す ---------- */

/** 本文の帯は y=40〜68（背丈28）。品詞の段はその上、働きの段はその下 */
const BAND_TOP = 40
const BAND_BOTTOM = 68

function makeBoxes(widths: number[], gap = 12, x0 = 16, top = BAND_TOP, bottom = BAND_BOTTOM): TokenBox[] {
  const out: TokenBox[] = []
  let x = x0
  widths.forEach((w, i) => {
    out.push({ index: i, left: x, right: x + w, top, bottom })
    x += w + gap
  })
  return out
}

const BOXES = makeBoxes([40, 36, 64, 38, 44, 52, 36, 48])
/** 単語の箱の横の中心 / 縦の中心 */
const mid = (t: TokenBox) => (t.left + t.right) / 2
const vmid = (t: TokenBox) => (t.top + t.bottom) / 2

/* ---------- 記号の書き方を模す（形は問わない。位置と画の数だけ使う） ---------- */

function pts(...xs: Array<[number, number]>): PenStroke {
  return xs.map(([x, y]) => ({ x, y }))
}

/** 開き括弧: 単語の左端の少し左に、本文の高さで縦に書く */
const openBracket = (t: TokenBox): PenStroke[] => [
  pts([t.left - 2, t.top - 3], [t.left - 7, vmid(t)], [t.left - 2, t.bottom + 3]),
]
const closeBracket = (t: TokenBox): PenStroke[] => [
  pts([t.right + 2, t.top - 3], [t.right + 7, vmid(t)], [t.right + 2, t.bottom + 3]),
]

/** 下線: 単語 a〜b の下に1本 */
const underline = (a: TokenBox, b: TokenBox): PenStroke[] => [
  pts([a.left, a.bottom + 3], [b.right, b.bottom + 3]),
]

/** 品詞の段（上）に k 画の文字を書く */
function letterAbove(t: TokenBox, k = 1): PenStroke[] {
  const w = 9
  const gap = 3
  const total = k * w + (k - 1) * gap
  let x = mid(t) - total / 2
  const out: PenStroke[] = []
  for (let i = 0; i < k; i++) {
    out.push(pts([x, 20], [x + w, 36], [x + w / 2, 27]))
    x += w + gap
  }
  return out
}

/** 働きの段（下）に k 画の文字を書く */
function letterBelow(t: TokenBox, k = 1): PenStroke[] {
  const w = 9
  const gap = 3
  const total = k * w + (k - 1) * gap
  let x = mid(t) - total / 2
  const out: PenStroke[] = []
  for (let i = 0; i < k; i++) {
    out.push(pts([x, 74], [x + w, 90], [x + w / 2, 82]))
    x += w + gap
  }
  return out
}

/** ○で囲んだ漢字（円1画＋中の字画3画）を働きの段に書く */
function circledKanji(t: TokenBox): PenStroke[] {
  const cx = mid(t)
  const cy = 84
  const r = 15
  const circle: PenPoint[] = []
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2
    circle.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) })
  }
  return [
    circle,
    pts([cx - 7, cy - 6], [cx + 7, cy - 6]),
    pts([cx - 7, cy], [cx + 7, cy]),
    pts([cx - 4, cy + 6], [cx + 4, cy + 6]),
  ]
}

/* ---------- 時刻を付けて1回ぶんの書き込みにする ---------- */

interface Session {
  strokes: PenStroke[]
  /** 記号ごとの画の本数（期待するまとまり） */
  sizes: number[]
}

function buildSession(
  symbols: PenStroke[][],
  opts: { interStrokeMs?: number; interSymbolMs?: number; strokeMs?: number; t0?: number } = {},
): Session {
  const interStroke = opts.interStrokeMs ?? 120
  const interSymbol = opts.interSymbolMs ?? 250
  const strokeMs = opts.strokeMs ?? 150
  let t = opts.t0 ?? 1000
  const strokes: PenStroke[] = []
  const sizes: number[] = []
  symbols.forEach((sym, si) => {
    if (si > 0) t += interSymbol
    sym.forEach((stroke, i) => {
      if (i > 0) t += interStroke
      const n = stroke.length
      strokes.push(stroke.map((p, k) => ({ ...p, t: t + (strokeMs * k) / Math.max(1, n - 1) })))
      t += strokeMs
    })
    sizes.push(sym.length)
  })
  return { strokes, sizes }
}

const sizesOf = (commits: CommitEvent[]) => commits.map((c) => c.strokes)

/* ---------- ① 切る / 切らない の判定 ---------- */

describe('まとめ判定（切る根拠）', () => {
  const t0 = BOXES[0]
  const t1 = BOXES[1]

  it('段（品詞・本文・働き）がちがえば切る', () => {
    const above = letterAbove(t0)[0]
    const below = letterBelow(t0)[0]
    expect(groupBreakReason([above], below, BOXES)).toBe('lane')
  })

  it('隣の単語のマスに入ったら切る（旧方式はここで吸い込んでいた）', () => {
    const a = letterAbove(t0)[0]
    const b = letterAbove(t1)[0]
    expect(groupBreakReason([a], b, BOXES)).toBe('token')
  })

  it('触れた瞬間の1点でも、隣の単語だと分かれば切る（待たずに確定できる）', () => {
    const a = letterAbove(t0)[0]
    const b = letterAbove(t1)[0]
    expect(groupBreakReason([a], [b[0]], BOXES, { mode: 'start' })).toBe('token')
  })

  it('括弧の書き始めは本文の上端より上に出るが、触れた瞬間には段で切らない', () => {
    const open = openBracket(BOXES[2])[0]
    // 本文の帯にかかる線なので「品詞の段に入った」と決めつけない
    expect(groupBreakReason([open], [open[0]], BOXES, { mode: 'start' })).not.toBe('lane')
  })

  it('同じ単語をはさんだ開き括弧と閉じ括弧は別の記号として切る', () => {
    const open = openBracket(t1)[0]
    const close = closeBracket(t1)[0]
    expect(groupBreakReason([open], close, BOXES)).toBe('token')
  })

  it('下線・波線のような横長の線には、続きの画を足さない', () => {
    const ul = underline(BOXES[3], BOXES[5])[0]
    expect(isSoloRuleStroke(ul, BOXES)).toBe(true)
    const letter = letterBelow(BOXES[4])[0]
    expect(groupBreakReason([ul], letter, BOXES)).toBe('rule')
  })

  it('折り返した別の行に入ったら切る', () => {
    const wrapped = [
      { index: 0, left: 16, right: 56, top: 40, bottom: 68 },
      { index: 1, left: 16, right: 56, top: 120, bottom: 148 },
    ]
    const a = pts([20, 74], [30, 90])
    const b = pts([20, 154], [30, 170])
    expect(groupBreakReason([a], b, wrapped)).toBe('line')
  })

  it('間があいたら切る', () => {
    const a = letterAbove(t0)[0].map((p, i) => ({ ...p, t: i * 10 }))
    const b = letterAbove(t0)[0].map((p, i) => ({ ...p, t: 2000 + i * 10 }))
    expect(groupBreakReason([a], b, BOXES)).toBe('time')
  })
})

describe('まとめ判定（切らない＝1つの記号として続ける）', () => {
  it('同じマスに続けて書く2画の文字は切らない', () => {
    const [s1, s2] = letterAbove(BOXES[2], 2)
    expect(shouldGroupStrokes([s1], s2, BOXES)).toBe(true)
    expect(shouldGroupStrokes([s1], [s2[0]], BOXES, { mode: 'start' })).toBe(true)
  })

  it('3画の文字（aux など）も最後まで1つのまとまりにする', () => {
    const strokes = letterAbove(BOXES[2], 3)
    expect(shouldGroupStrokes([strokes[0]], strokes[1], BOXES)).toBe(true)
    expect(shouldGroupStrokes(strokes.slice(0, 2), strokes[2], BOXES)).toBe(true)
  })

  it('○で囲んだ漢字（画数が多い）は途中で切らない', () => {
    const strokes = circledKanji(BOXES[4])
    for (let i = 1; i < strokes.length; i++) {
      expect(shouldGroupStrokes(strokes.slice(0, i), strokes[i], BOXES)).toBe(true)
      expect(shouldGroupStrokes(strokes.slice(0, i), [strokes[i][0]], BOXES, { mode: 'start' })).toBe(
        true,
      )
    }
  })

  it('括弧を同じ場所に書き直したときは1つのまとまりにする', () => {
    const first = openBracket(BOXES[3])[0]
    const again = openBracket(BOXES[3])[0].map((p) => ({ ...p, x: p.x + 1 }))
    expect(shouldGroupStrokes([first], again, BOXES)).toBe(true)
  })
})

/* ---------- ② まとめの正しさ（合成データの計測） ---------- */

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 記号ごとの画の本数が、確定したまとまりと一致した割合 */
function partitionAccuracy(session: Session, boxes: TokenBox[], legacy: boolean): number {
  const commits = simulateCommits(session.strokes, boxes, { legacy, early: !legacy })
  const got = sizesOf(commits)
  const want = session.sizes
  // 先頭から順に一致しているまとまりの数を数える（1つずれたら以降は不一致）
  let ok = 0
  for (let i = 0; i < want.length; i++) {
    if (got[i] === want[i]) ok++
    else break
  }
  return ok / want.length
}

describe('まとめの正しさの機械計測（合成データ・実機ではない）', () => {
  it('新方式は、書いた記号の並びをそのままのまとまりに分ける（旧方式より高い）', () => {
    const rng = mulberry32(20260827)
    let newSum = 0
    let oldSum = 0
    const trials = 60
    for (let n = 0; n < trials; n++) {
      const widths = Array.from({ length: 8 }, () => 34 + Math.floor(rng() * 60))
      const boxes = makeBoxes(widths)
      const symbols: PenStroke[][] = []
      const count = 5 + Math.floor(rng() * 4)
      // 同じ単語の同じマスに続けて別の記号を書くことはしない（人にも区別できず、
      // 実際の使い方でも「書き直し＝同じ記号」になる）
      let lastSlot = ''
      for (let i = 0; i < count; i++) {
        const t = boxes[Math.floor(rng() * boxes.length)]
        const kind = rng()
        let slot = ''
        let strokes: PenStroke[]
        if (kind < 0.28) {
          slot = `above#${t.index}`
          strokes = letterAbove(t, 1 + Math.floor(rng() * 3))
        } else if (kind < 0.56) {
          slot = `below#${t.index}`
          strokes = letterBelow(t, 1 + Math.floor(rng() * 2))
        } else if (kind < 0.7) {
          slot = `open#${t.index}`
          strokes = openBracket(t)
        } else if (kind < 0.84) {
          slot = `close#${t.index}`
          strokes = closeBracket(t)
        } else if (kind < 0.92) {
          slot = `below#${t.index}`
          strokes = circledKanji(t)
        } else {
          const j = Math.min(boxes.length - 1, t.index + Math.floor(rng() * 3))
          slot = `ul#${t.index}`
          strokes = underline(t, boxes[j])
        }
        if (slot === lastSlot) continue
        lastSlot = slot
        symbols.push(strokes)
      }
      const session = buildSession(symbols, {
        interSymbolMs: 200 + Math.floor(rng() * 250),
        interStrokeMs: 90 + Math.floor(rng() * 90),
        strokeMs: 110 + Math.floor(rng() * 120),
      })
      newSum += partitionAccuracy(session, boxes, false)
      oldSum += partitionAccuracy(session, boxes, true)
    }
    const nw = newSum / trials
    const old = oldSum / trials
    console.log(
      `[計測] まとまりの一致率（合成データ）: 新方式 ${(nw * 100).toFixed(1)}% / 旧方式 ${(old * 100).toFixed(1)}%（n=${trials}回）`,
    )
    expect(nw).toBeGreaterThanOrEqual(0.95)
    expect(nw).toBeGreaterThan(old)
  })
})

/* ---------- ③ 確定までの時間（合成データの計測） ---------- */

/**
 * 例文②「The girl standing by the door is my sister.」に近い単語幅。
 * 短い単語（by・is・my）が並ぶ実際の文では、隣の単語に書いた文字どうしの
 * すき間が旧方式のしきい値（40px）を下回り、次々と吸い込まれていた。
 */
const REAL_BOXES = makeBoxes([34, 36, 76, 24, 34, 42, 20, 28, 54])

/** テンポよく品詞→働き→括弧と書いていく1文ぶん（塾長の症状が出る書き方） */
function fastWritingSession(boxes: TokenBox[]): Session {
  const symbols: PenStroke[][] = []
  for (let i = 0; i < 4; i++) symbols.push(letterAbove(boxes[i]))
  for (let i = 0; i < 4; i++) symbols.push(letterBelow(boxes[i]))
  symbols.push(openBracket(boxes[4]))
  symbols.push(closeBracket(boxes[6]))
  symbols.push(letterAbove(boxes[5], 2))
  return buildSession(symbols, { interSymbolMs: 220, interStrokeMs: 110, strokeMs: 140 })
}

/**
 * 記号1つごとの「書き終えてから、その記号が形になるまで」（ms）。
 * まとめられてしまった記号は、まとまり全体が確定するまで形にならない
 * ＝塾長の症状（書いたのに反映されない・別の記号として認識される）の大きさ。
 */
function symbolLatencies(session: Session, boxes: TokenBox[], legacy: boolean): number[] {
  const commits = simulateCommits(session.strokes, boxes, { legacy, early: !legacy })
  const endOf = (s: PenStroke) => Math.max(...s.map((p) => p.t ?? 0))
  // まとまりごとの「最後に含む画の番号」
  const bounds: Array<{ lastStroke: number; at: number }> = []
  let n = 0
  for (const c of commits) {
    n += c.strokes
    bounds.push({ lastStroke: n - 1, at: c.at })
  }
  const out: number[] = []
  let idx = 0
  for (const size of session.sizes) {
    const lastOfSymbol = idx + size - 1
    const hit = bounds.find((b) => b.lastStroke >= lastOfSymbol)
    if (hit) out.push(hit.at - endOf(session.strokes[lastOfSymbol]))
    idx += size
  }
  return out
}

const stat = (xs: number[]) => ({
  mean: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0,
  max: xs.length ? Math.max(...xs) : 0,
})

function latencyOf(commits: CommitEvent[]) {
  const waits = commits
    .map((c) => c.waitAfterNextStartMs)
    .filter((v): v is number => v !== null)
  const mean = waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : 0
  return { mean, max: waits.length ? Math.max(...waits) : 0, n: waits.length }
}

describe('確定までの時間の機械計測（合成データ・実機ではない）', () => {
  const session = fastWritingSession(REAL_BOXES)

  it('境界をまたいだら待たずに確定する（次を書き始めてから前が確定するまで ≒ 0ms）', () => {
    const commits = simulateCommits(session.strokes, REAL_BOXES, { early: true })
    const now = latencyOf(commits)
    const before = latencyOf(simulateCommits(session.strokes, REAL_BOXES, { legacy: true }))
    console.log(
      `[計測] 確定までの時間（合成データ・11記号をテンポよく書いた場合）: ` +
        `新方式 平均 ${now.mean.toFixed(0)}ms・最大 ${now.max.toFixed(0)}ms ／ ` +
        `旧方式 平均 ${before.mean.toFixed(0)}ms・最大 ${before.max.toFixed(0)}ms`,
    )
    expect(now.mean).toBeLessThanOrEqual(5)
    expect(now.max).toBeLessThan(before.max)
  })

  it('記号ごとの「書き終えてから形になるまで」も短くなる', () => {
    const nw = stat(symbolLatencies(session, REAL_BOXES, false))
    const old = stat(symbolLatencies(session, REAL_BOXES, true))
    console.log(
      `[計測] 書き終えてからその記号が形になるまで（合成データ）: ` +
        `新方式 平均 ${nw.mean.toFixed(0)}ms・最大 ${nw.max.toFixed(0)}ms ／ ` +
        `旧方式 平均 ${old.mean.toFixed(0)}ms・最大 ${old.max.toFixed(0)}ms`,
    )
    expect(nw.mean).toBeLessThan(old.mean)
    expect(nw.max).toBeLessThanOrEqual(750)
  })

  it('新方式は書いた記号の数だけ確定する（旧方式はまとめて1つになる）', () => {
    const now = simulateCommits(session.strokes, REAL_BOXES, { early: true })
    const before = simulateCommits(session.strokes, REAL_BOXES, { legacy: true })
    console.log(
      `[計測] 書いた記号 ${session.sizes.length} 個 → 確定したまとまり: ` +
        `新方式 ${now.length} 個 / 旧方式 ${before.length} 個`,
    )
    expect(sizesOf(now)).toEqual(session.sizes)
    expect(before.length).toBeLessThan(session.sizes.length)
  })

  it('同じマスで書き続けている間は待つ（画数の多い記号を途中で切らない）', () => {
    const kanji = buildSession([circledKanji(BOXES[3])], { interStrokeMs: 200, strokeMs: 150 })
    const commits = simulateCommits(kanji.strokes, BOXES, { early: true })
    expect(sizesOf(commits)).toEqual([4])
    // 書き終えてから確定するまでは、いままでどおりの待ち時間
    expect(commits[0].afterLastStrokeMs).toBe(750)
  })
})
