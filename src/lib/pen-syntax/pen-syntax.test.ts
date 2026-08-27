import { describe, expect, it } from 'vitest'
import {
  bbox,
  closedness,
  countCorners,
  countYAlternations,
  resample,
  straightness,
} from './geometry'
import { classifyShape } from './shapes'
import { evaluatePointer, initialPalmState } from './palm'
import {
  laneOf,
  snapCloseBracket,
  snapEnclosedRange,
  snapHorizontalRange,
  snapNearestToken,
  snapOpenBracket,
  underlineSegments,
} from './snap'
import { shouldGroupStrokes } from './grouping'
import { applySymbol, emptyPenAnnotation } from './apply'
import { classifyExceptionMark } from './recognize'
import { classifyPosLetter, classifyRoleLetter } from './letters'
import type { PenStroke, TokenBox } from './types'
import { emptyAnswer, SYNTAX_PROBLEMS } from '@/lib/reading/syntax'

function line(...pts: Array<[number, number]>): PenStroke {
  return pts.map(([x, y]) => ({ x, y }))
}

function arc(cx: number, cy: number, r: number, deg0: number, deg1: number, steps = 24): PenStroke {
  const out: PenStroke = []
  for (let i = 0; i <= steps; i++) {
    const a = ((deg0 + ((deg1 - deg0) * i) / steps) * Math.PI) / 180
    out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) })
  }
  return out
}

/** 7単語ぶんの単語箱（本文の帯は y=40〜70） */
const BOXES: TokenBox[] = Array.from({ length: 7 }, (_, i) => ({
  index: i,
  left: i * 70 + 10,
  right: i * 70 + 60,
  top: 40,
  bottom: 70,
}))

describe('geometry', () => {
  it('resample は指定の点数で等間隔に打ち直す', () => {
    const pts = resample(line([0, 0], [100, 0]), 11)
    expect(pts).toHaveLength(11)
    expect(pts[5].x).toBeCloseTo(50, 0)
  })

  it('直線の straightness は 1 に近く、円の closedness は小さい', () => {
    expect(straightness(line([0, 0], [50, 50], [100, 100]))).toBeCloseTo(1, 5)
    expect(closedness(arc(50, 50, 40, -90, 268))).toBeLessThan(0.2)
  })

  it('countCorners: 円弧=0 / 山括弧=1 / 角括弧=2', () => {
    expect(countCorners(arc(50, 50, 40, -80, 80))).toBe(0)
    expect(countCorners(line([64, 10], [36, 50], [64, 90]))).toBe(1)
    expect(countCorners(line([64, 10], [40, 10], [40, 90], [64, 90]))).toBe(2)
  })

  it('countYAlternations: 波線は3回以上折り返す', () => {
    const wavy = line([0, 50], [10, 35], [20, 50], [30, 65], [40, 50], [50, 35], [60, 50], [70, 65])
    expect(countYAlternations(wavy)).toBeGreaterThanOrEqual(3)
    expect(countYAlternations(line([0, 50], [80, 50]))).toBe(0)
  })

  it('bbox は外接箱を返す', () => {
    const b = bbox(line([10, 20], [30, 60]))
    expect(b.width).toBe(20)
    expect(b.height).toBe(40)
    expect(b.cx).toBe(20)
  })
})

describe('classifyShape（形の記号）', () => {
  it('丸括弧の開閉を膨らみの向きで判別する', () => {
    const open = [arc(60, 50, 40, 110, 250)] // 左に膨らむ＝（
    const close = [arc(40, 50, 40, -70, 70)] // 右に膨らむ＝）
    expect(classifyShape(open).best?.symbol).toBe('paren-open')
    expect(classifyShape(close).best?.symbol).toBe('paren-close')
  })

  it('角括弧・山括弧・波括弧を折れの数で判別する', () => {
    expect(classifyShape([line([64, 10], [40, 10], [40, 90], [64, 90])]).best?.symbol).toBe('square-open')
    expect(classifyShape([line([36, 10], [60, 10], [60, 90], [36, 90])]).best?.symbol).toBe('square-close')
    expect(classifyShape([line([64, 10], [36, 50], [64, 90])]).best?.symbol).toBe('angle-open')
    expect(classifyShape([line([36, 10], [64, 50], [36, 90])]).best?.symbol).toBe('angle-close')
    expect(
      classifyShape([
        line([64, 6], [50, 12], [46, 28], [46, 42], [34, 50], [46, 58], [46, 72], [50, 88], [64, 94]),
      ]).best?.symbol,
    ).toBe('brace-open')
  })

  it('下から上に書いた括弧も同じ向きに判別する', () => {
    const openUp = [arc(60, 50, 40, 250, 110)] // （ を下→上に
    expect(classifyShape(openUp).best?.symbol).toBe('paren-open')
  })

  it('横線・円・波線を判別する', () => {
    expect(classifyShape([line([10, 50], [120, 52])]).best?.symbol).toBe('hline')
    expect(classifyShape([arc(50, 50, 30, -90, 266)]).best?.symbol).toBe('circle')
    const wavy = [
      line([5, 50], [15, 36], [25, 50], [35, 64], [45, 50], [55, 36], [65, 50], [75, 64], [85, 50]),
    ]
    expect(classifyShape(wavy).best?.symbol).toBe('wavy')
  })

  it('短い斜め線はダッシュ（tick）、長い斜め線は slash', () => {
    expect(classifyShape([line([56, 20], [48, 38])]).best?.symbol).toBe('tick')
    expect(classifyShape([line([80, 10], [30, 80])]).best?.symbol).toBe('slash')
  })

  it('円＋斜線は Ø と判別する', () => {
    const strokes = [arc(50, 50, 34, -90, 266), line([76, 14], [24, 86])]
    expect(classifyShape(strokes).best?.symbol).toBe('null-sign')
  })

  it('ほぼ垂直の棒だけでは決めず、候補を出す', () => {
    const r = classifyShape([line([50, 10], [50, 90])])
    expect(r.ambiguous || r.best === null || r.best.score < 0.7).toBe(true)
  })
})

describe('classifyRoleLetter（働きの文字）', () => {
  it('S・V・O・C を判別する（M は記号一覧に無い）', () => {
    const S = [[...arc(50, 27, 21, -30, -270, 14), ...arc(50, 71, 23, -90, 130, 14)]]
    const V = [line([22, 10], [50, 90], [78, 10])]
    const O = [arc(50, 50, 38, -90, 268)]
    expect(classifyRoleLetter(S).best?.symbol).toBe('S')
    expect(classifyRoleLetter(V).best?.symbol).toBe('V')
    expect(classifyRoleLetter(O).best?.symbol).toBe('O')
    // M は塾長の現在の分析で使われていないため候補に出ない
    const M = [line([14, 90], [20, 10], [50, 72], [80, 10], [86, 90])]
    expect(classifyRoleLetter(M).candidates.every((c) => String(c.symbol) !== 'M')).toBe(true)
  })

  it('品詞の英字（n・v・a・ad・aux）を判別する', () => {
    const n = [line([32, 38], [32, 92]), [...arc(50, 64, 18, 180, 360, 10), ...line([68, 64], [68, 92])]]
    const v = [line([30, 40], [50, 92], [70, 40])]
    const a = [arc(46, 69, 21, -40, 320, 16), line([66, 46], [66, 92])]
    const ad = [
      arc(24, 72, 18, -40, 320, 14),
      line([40, 54], [40, 92]),
      arc(66, 72, 17, -40, 320, 14),
      line([83, 28], [83, 92]),
    ]
    expect(classifyPosLetter(n).best?.symbol).toBe('n')
    expect(classifyPosLetter(v).best?.symbol).toBe('v')
    expect(classifyPosLetter(a).best?.symbol).toBe('a')
    expect(classifyPosLetter(ad).best?.symbol).toBe('ad')
  })

  it('お手本登録した字も照合対象になる', () => {
    // 内蔵お手本と大きく違う書き方の「V」（浅いチェック型）を登録すると拾えるようになる
    const odd = [line([10, 40], [45, 70], [90, 20])]
    const store = { V: [odd] }
    expect(classifyRoleLetter(odd, store).best?.symbol).toBe('V')
  })
})

describe('classifyExceptionMark（○で囲んだ漢字の例外マーク）', () => {
  // 「仮」に見立てた字画（縦棒＋斜め2画）を大きな円で囲む
  const kanji = [line([95, 45], [95, 62]), line([100, 45], [112, 52]), line([100, 58], [112, 64])]
  const circled = [arc(103, 54, 22, -90, 266), ...kanji]

  it('円＋中の字画の組を例外マークとして拾い、候補は台帳の漢字4種から出す', () => {
    const r = classifyExceptionMark(circled, null)
    expect(r).not.toBeNull()
    expect(r!.candidates.map((c) => c.symbol)).toEqual(expect.arrayContaining(['仮']))
    // お手本が無ければ確定させず、候補チップで選んでもらう
    expect(r!.ambiguous).toBe(true)
  })

  it('本人のお手本があれば、その漢字が最有力になる', () => {
    const store = { 仮: [kanji] }
    const r = classifyExceptionMark(circled, store)
    expect(r!.best?.symbol).toBe('仮')
  })

  it('英字の a（丸＋縦棒）や Po の小さな丸は例外マークに誤検出しない', () => {
    const a = [arc(46, 69, 21, -40, 320, 16), line([66, 46], [66, 92])]
    expect(classifyExceptionMark(a, null)).toBeNull()
    const po = [
      line([24, 10], [24, 82]),
      [...line([24, 14], [40, 14]), ...arc(40, 26, 12, -90, 90, 10), ...line([40, 38], [24, 38])],
      arc(66, 68, 14, -90, 266),
    ]
    expect(classifyExceptionMark(po, null)).toBeNull()
  })
})

describe('palm（手のひら対策）', () => {
  it('ペンは常に受理し、以後の指は拒否する', () => {
    let state = initialPalmState()
    const pen = evaluatePointer({ pointerType: 'pen' }, 'any', state)
    expect(pen.accept).toBe(true)
    state = pen.next
    const touch = evaluatePointer({ pointerType: 'touch', width: 8 }, 'any', state)
    expect(touch.accept).toBe(false)
    expect(touch.next.rejectedTouches).toBe(1)
  })

  it('大きい接触（手のひら）はどのモードでも拒否する', () => {
    const d = evaluatePointer({ pointerType: 'touch', width: 30, height: 28 }, 'any', initialPalmState())
    expect(d.accept).toBe(false)
    expect(d.reason).toBe('touch-rejected-palm')
  })

  it('ペン専用モードでは指を拒否し、指モードならペン未使用時に受理する', () => {
    const rejected = evaluatePointer({ pointerType: 'touch', width: 8 }, 'pen-only', initialPalmState())
    expect(rejected.accept).toBe(false)
    const ok = evaluatePointer({ pointerType: 'touch', width: 8 }, 'any', initialPalmState())
    expect(ok.accept).toBe(true)
  })

  it('マウスはペン専用モード以外で受理する', () => {
    expect(evaluatePointer({ pointerType: 'mouse' }, 'pen-or-mouse', initialPalmState()).accept).toBe(true)
    expect(evaluatePointer({ pointerType: 'mouse' }, 'pen-only', initialPalmState()).accept).toBe(false)
  })
})

describe('snap（単語への吸着）', () => {
  it('開き括弧は単語の左端、閉じ括弧は右端に吸着する', () => {
    // 3語目（index2: left=150）の少し左に書いた開き括弧
    const open = [line([146, 42], [140, 55], [146, 68])]
    expect(snapOpenBracket(open, BOXES)?.index).toBe(2)
    // 3語目（right=200）の少し右の閉じ括弧
    const close = [line([203, 42], [209, 55], [203, 68])]
    expect(snapCloseBracket(close, BOXES)?.index).toBe(2)
  })

  it('下線は横に重なる単語の範囲に吸着する', () => {
    const ul = [line([15, 76], [195, 78])] // 1〜3語目をまたぐ
    expect(snapHorizontalRange(ul, BOXES)).toEqual({ from: 0, to: 2 })
  })

  it('○囲みは中に入った単語に吸着する', () => {
    const circle = [arc(105, 55, 35, -90, 266)] // 2語目(80〜130)を囲む
    expect(snapEnclosedRange(circle, BOXES)).toEqual({ from: 1, to: 1 })
  })

  it('文字は一番近い単語に吸着し、行（上下）を判別する', () => {
    const letter = [line([90, 85], [110, 95])] // 2語目の下
    expect(snapNearestToken(letter, BOXES)?.index).toBe(1)
    expect(laneOf(letter, BOXES)).toBe('below')
    expect(laneOf([line([90, 10], [110, 20])], BOXES)).toBe('above')
    expect(laneOf([line([90, 45], [110, 60])], BOXES)).toBe('band')
  })

  it('下線の表示線分は単語間で途切れず1本につながる', () => {
    // 1〜3語目（left=10〜right=200）に引いた下線 → 行全体で1本
    const segs = underlineSegments({ from: 0, to: 2 }, BOXES, -3)
    expect(segs).toHaveLength(1)
    expect(segs[0].left).toBe(10)
    expect(segs[0].right).toBe(200)
    expect(segs[0].y).toBe(67) // 単語下端(70) - 3
  })

  it('折り返しで複数行にまたがる下線は行ごとに1本ずつになる', () => {
    const wrapped: TokenBox[] = [
      { index: 0, left: 10, right: 60, top: 40, bottom: 70 },
      { index: 1, left: 70, right: 120, top: 40, bottom: 70 },
      { index: 2, left: 10, right: 60, top: 110, bottom: 140 }, // 2行目
    ]
    const segs = underlineSegments({ from: 0, to: 2 }, wrapped, 2)
    expect(segs).toHaveLength(2)
    expect(segs[0]).toEqual({ left: 10, right: 120, y: 72 })
    expect(segs[1]).toEqual({ left: 10, right: 60, y: 142 })
  })

  it('時間と場所が近い画はひとまとめにする', () => {
    const first = [line([100, 80], [100, 95]).map((p, i) => ({ ...p, t: i * 10 }))]
    const near = line([105, 82], [115, 92]).map((p, i) => ({ ...p, t: 200 + i * 10 }))
    const far = line([400, 82], [410, 92]).map((p, i) => ({ ...p, t: 200 + i * 10 }))
    const late = line([105, 82], [115, 92]).map((p, i) => ({ ...p, t: 3000 + i * 10 }))
    expect(shouldGroupStrokes(first, near)).toBe(true)
    expect(shouldGroupStrokes(first, far)).toBe(false)
    expect(shouldGroupStrokes(first, late)).toBe(false)
  })
})

describe('applySymbol（解答への反映）', () => {
  const problem = SYNTAX_PROBLEMS[0]
  const init = () => emptyPenAnnotation(emptyAnswer(problem))

  it('開き括弧→閉じ括弧でまとまりになる', () => {
    let state = init()
    const open = applySymbol(state, 'paren-open', [line([286, 42], [280, 55], [286, 68])], BOXES)
    expect(open.applied).toBe(true)
    state = open.next
    expect(state.pendingOpens).toEqual([{ type: 'adv', index: 4 }])
    const close = applySymbol(state, 'paren-close', [line([413, 42], [419, 55], [413, 68])], BOXES)
    expect(close.applied).toBe(true)
    expect(close.next.answer.spans).toEqual([{ from: 4, to: 5, type: 'adv' }])
    expect(close.next.pendingOpens).toEqual([])
  })

  it('開き括弧が無いまま閉じ括弧を書くと反映しない', () => {
    const r = applySymbol(init(), 'paren-close', [line([413, 42], [419, 55], [413, 68])], BOXES)
    expect(r.applied).toBe(false)
    expect(r.message).toContain('開き括弧')
  })

  it('本文の帯より下の横線は下線（ul）になる', () => {
    const r = applySymbol(init(), 'hline', [line([12, 74], [128, 75])], BOXES)
    expect(r.applied).toBe(true)
    expect(r.next.answer.spans).toEqual([{ from: 0, to: 1, type: 'ul' }])
  })

  it('上の行の文字は品詞（英字略記のまま）、下の行の文字は働きに入る', () => {
    let state = init()
    const pos = applySymbol(state, 'n', [line([80, 10], [120, 30])], BOXES)
    expect(pos.next.answer.pos[1]).toBe('n')
    state = pos.next
    const role = applySymbol(state, 'S', [line([85, 80], [115, 95])], BOXES)
    expect(role.next.answer.role[1]).toBe('S')
  })

  it('働きの表記は言い換えず塾長表記のまま保存する（Po・▷・P）', () => {
    const po = applySymbol(init(), 'Po', [line([360, 80], [380, 95])], BOXES)
    expect(po.next.answer.role[5]).toBe('Po')
    const tri = applySymbol(init(), '▷', [line([10, 80], [40, 95])], BOXES)
    expect(tri.next.answer.role[0]).toBe('▷')
    const p = applySymbol(init(), 'P', [line([85, 80], [115, 95])], BOXES)
    expect(p.next.answer.role[1]).toBe('P')
  })

  it('波線（熟語の印）は採点対象外の extras として持つ', () => {
    const wavy = applySymbol(init(), 'wavy', [line([15, 76], [130, 78])], BOXES)
    expect(wavy.applied).toBe(true)
    expect(wavy.next.extras[0].kind).toBe('wavy')
    expect(wavy.next.answer.spans).toEqual([])
  })

  it('○で囲んだ漢字の例外マーク（仮・真など）は extras として近くの単語に付く', () => {
    const r = applySymbol(init(), '仮', [arc(105, 20, 16, -90, 266), line([100, 14], [110, 26])], BOXES)
    expect(r.applied).toBe(true)
    expect(r.next.extras).toEqual([{ kind: 'exception', label: '仮', from: 1, to: 1 }])
  })

  it('働きの＋（等位接続詞）はそのまま働きに入る', () => {
    const r = applySymbol(init(), '＋', [line([85, 80], [115, 82]), line([100, 74], [100, 92])], BOXES)
    expect(r.applied).toBe(true)
    expect(r.next.answer.role[1]).toBe('＋')
  })

  it('開始カッコ（[・{）の真下に書いた働きは、まとまり全体の働きになる', () => {
    // 3語目（left=150）から始まる [ ] のまとまりを作っておく
    let state = init()
    state = {
      ...state,
      answer: { ...state.answer, spans: [{ from: 2, to: 4, type: 'n' as const }] },
    }
    // 開始カッコの真下（単語の左端より左・下の行）に C を書く
    const r = applySymbol(state, 'C', [line([138, 80], [146, 95])], BOXES)
    expect(r.applied).toBe(true)
    expect(r.next.answer.spans[0]).toEqual({ from: 2, to: 4, type: 'n', role: 'C' })
    // 単語のマスには入らない（まとまり全体の働き）
    expect(r.next.answer.role[2]).toBeNull()
    // 単語の真下に書けば従来どおり単語の働きに入る
    const onWord = applySymbol(state, 'S', [line([165, 80], [180, 95])], BOXES)
    expect(onWord.next.answer.role[2]).toBe('S')
    expect(onWord.next.answer.spans[0].role).toBeUndefined()
  })

  it('閉じる前の開始カッコの真下にも働きを書ける（閉じたあとも失われない）', () => {
    // 3語目（left=150）の前に [ を書く（まだ閉じない）
    let state = init()
    const open = applySymbol(state, 'square-open', [line([142, 42], [136, 55], [142, 68])], BOXES)
    expect(open.applied).toBe(true)
    state = open.next
    expect(state.pendingOpens).toEqual([{ type: 'n', index: 2 }])
    // 開いてすぐ、そのカッコの真下に O を書く
    const role = applySymbol(state, 'O', [line([138, 80], [146, 95])], BOXES)
    expect(role.applied).toBe(true)
    state = role.next
    expect(state.pendingOpens).toEqual([{ type: 'n', index: 2, role: 'O' }])
    // 単語のマスには入らない（まとまり全体の働き）
    expect(state.answer.role[2]).toBeNull()
    // あとから閉じ括弧を書いても、先に書いた働きは引き継がれる
    const close = applySymbol(state, 'square-close', [line([274, 42], [280, 55], [274, 68])], BOXES)
    expect(close.applied).toBe(true)
    expect(close.next.answer.spans).toEqual([{ from: 2, to: 3, type: 'n', role: 'O' }])
    expect(close.next.pendingOpens).toEqual([])
  })

  it('閉じ待ちのカッコが複数あるときは、あとに書いたほう（内側）に働きが付く', () => {
    let state = init()
    state = applySymbol(state, 'square-open', [line([142, 42], [136, 55], [142, 68])], BOXES).next
    state = applySymbol(state, 'brace-open', [line([142, 42], [136, 55], [142, 68])], BOXES).next
    const role = applySymbol(state, 'C', [line([138, 80], [146, 95])], BOXES)
    expect(role.next.pendingOpens).toEqual([
      { type: 'n', index: 2 },
      { type: 'comp', index: 2, role: 'C' },
    ])
  })

  it('閉じ待ちのカッコが無ければ、従来どおり単語の働きに入る', () => {
    // 開き括弧を書いていない場所の真下（単語の左端より左）に書いた場合
    const r = applySymbol(init(), 'S', [line([138, 80], [146, 95])], BOXES)
    expect(r.applied).toBe(true)
    expect(r.next.answer.role[2]).toBe('S')
    expect(r.next.pendingOpens).toEqual([])
  })

  it('台帳から外れた形（単語囲みの○・?・ダッシュ・Ø）は反映せず案内を返す', () => {
    for (const symbol of ['circle', 'question', 'tick', 'null-sign', 'slash'] as const) {
      const r = applySymbol(init(), symbol, [arc(105, 55, 35, -90, 266)], BOXES)
      expect(r.applied).toBe(false)
      expect(r.message).toBeTruthy()
      expect(r.next).toBe(r.next) // 状態は変わらない
      expect(r.next.extras).toEqual([])
    }
  })

  it('上の行の横線（ダッシュの名残）は反映せず、自動色分けの案内を返す', () => {
    const r = applySymbol(init(), 'hline', [line([85, 20], [120, 21])], BOXES)
    expect(r.applied).toBe(false)
    expect(r.message).toContain('自動で色分け')
  })
})
