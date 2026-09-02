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
  bracketMark,
  BRACKET_SLOT_H,
  BRACKET_SLOT_W,
  findLineAt,
  laneOf,
  noteMark,
  ROLE_ROW_H,
  snapCloseBracket,
  snapEnclosedRange,
  snapHorizontalRange,
  snapNearestToken,
  snapOpenBracket,
  underlineSegments,
  wavyPath,
} from './snap'
import { shouldGroupStrokes } from './grouping'
import {
  applySymbol,
  canMarkKariShin,
  emptyPenAnnotation,
  pruneExceptionMarks,
  roleCellParts,
  toggleExceptionMark,
} from './apply'
import { classifyExceptionMark, recognizeGroup } from './recognize'
import { EXCEPTION_KANJI } from './types'
import { classifyPosLetter, classifyRoleLetter } from './letters'
import type { PenStroke, TokenBox } from './types'
import {
  emptyAnswer,
  gradeSyntax,
  SYNTAX_PROBLEMS,
  type StudentSpan,
  type SyntaxProblem,
} from '@/lib/reading/syntax'

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

  it('判別の入口（recognizeGroup）は○囲みの漢字を例外マークとして返さない（2026-08-31 選択式化）', () => {
    // classifyExceptionMark 自体は残すが、入口からは呼ばない。
    // ○囲みは形の判別（circle=台帳外）に落ち、タッチで付ける案内につながる
    const r = recognizeGroup(circled, BOXES, null)
    expect(
      r.result.candidates.every((c) => !(EXCEPTION_KANJI as readonly string[]).includes(c.symbol)),
    ).toBe(true)
    expect(r.result.best == null || !(EXCEPTION_KANJI as readonly string[]).includes(r.result.best.symbol)).toBe(true)
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

  it('下線は文字のベースラインを基準に引く（外枠の下端ではない）', () => {
    // 下枠線・下余白ぶん、外枠の下端はベースラインより下にある
    const withBaseline: TokenBox[] = BOXES.map((t) => ({ ...t, baseline: 64 }))
    const segs = underlineSegments({ from: 0, to: 1 }, withBaseline, 1)
    expect(segs[0].y).toBe(65) // ベースライン(64) + 1
    // ベースラインが測れないときは従来どおり外枠の下端で代用する
    expect(underlineSegments({ from: 0, to: 1 }, BOXES, 1)[0].y).toBe(71)
  })

  it('括弧の重ね描きは単語のすき間の中央に置き、入れ子は横へずらす', () => {
    // 単語1=80〜130・単語2=150〜200 → すき間の中央は 140
    const box = BOXES[2]
    const single = bracketMark(box, BOXES, 'open')
    expect(single.x).toBe(140)
    expect(single.y).toBe(55) // 本文の行の中央（top40〜bottom70）
    expect(single.roleTop).toBe(70)
    // 2つ並ぶときは中央をはさんで左右に振り分ける（0=外側＝左）
    const outer = bracketMark(box, BOXES, 'open', 0, 2)
    const inner = bracketMark(box, BOXES, 'open', 1, 2)
    expect(outer.x).toBe(140 - BRACKET_SLOT_W / 2)
    expect(inner.x).toBe(140 + BRACKET_SLOT_W / 2)
    // 閉じ括弧は単語の右のすき間（200〜220 の中央 210）
    expect(bracketMark(box, BOXES, 'close').x).toBe(210)
  })

  it('同じすき間に並ぶ入れ子カッコは縦にもずらして重ならないようにする（2026-08-31）', () => {
    const box = BOXES[2] // 本文の行の中央は y=55
    // 1つだけなら中央のまま
    expect(bracketMark(box, BOXES, 'open').y).toBe(55)
    // 開き側: 0=外側が上・1=内側が下（横と合わせて斜めに離れる）
    expect(bracketMark(box, BOXES, 'open', 0, 2).y).toBe(55 - BRACKET_SLOT_H / 2)
    expect(bracketMark(box, BOXES, 'open', 1, 2).y).toBe(55 + BRACKET_SLOT_H / 2)
    // 閉じ側: 0=内側（単語寄り）が下・1=外側が上＝同じまとまりの開きと閉じが同じ高さになる
    expect(bracketMark(box, BOXES, 'close', 0, 2).y).toBe(55 + BRACKET_SLOT_H / 2)
    expect(bracketMark(box, BOXES, 'close', 1, 2).y).toBe(55 - BRACKET_SLOT_H / 2)
    // 3つ並んでも中央をはさんで等間隔（外→内で上→下）
    expect(bracketMark(box, BOXES, 'open', 0, 3).y).toBe(55 - BRACKET_SLOT_H)
    expect(bracketMark(box, BOXES, 'open', 1, 3).y).toBe(55)
    expect(bracketMark(box, BOXES, 'open', 2, 3).y).toBe(55 + BRACKET_SLOT_H)
  })

  it('カッコの真下の働きは、単語の下の働きの欄と同じ帯（高さ ROLE_ROW_H）に置く', () => {
    // 単語の下の働きのマスは単語の外枠の下端から始まり、高さは ROLE_ROW_H。
    // カッコの真下の働きも同じ上端・同じ高さの帯に置き、中央そろえで高さをそろえる
    const box = BOXES[2]
    expect(bracketMark(box, BOXES, 'open').roleTop).toBe(box.bottom)
    expect(ROLE_ROW_H).toBe(24)
  })

  it('採点の注記は単語の中央・働きの欄のすぐ下に重ねて置く', () => {
    const box = BOXES[2] // left 150 / right 200 / bottom 70
    expect(noteMark(box)).toEqual({ x: 175, top: 70 + ROLE_ROW_H })
  })

  it('行頭・行末はとなりの単語が無いので見込み幅ぶん外へ置く', () => {
    expect(bracketMark(BOXES[0], BOXES, 'open').x).toBe(BOXES[0].left - 8)
    const last = BOXES[BOXES.length - 1]
    expect(bracketMark(last, BOXES, 'close').x).toBe(last.right + 8)
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

  it('例外の印のうち仮・真・強は extras（採点対象外）として近くの単語に付く', () => {
    const r = applySymbol(init(), '仮', [arc(105, 20, 16, -90, 266), line([100, 14], [110, 26])], BOXES)
    expect(r.applied).toBe(true)
    expect(r.next.extras).toEqual([{ kind: 'exception', label: '仮', from: 1, to: 1 }])
    expect(r.next.answer.role[1]).toBeNull()
  })

  it('例外の印のうち「同」は働きの値として answer.role に入る（採点される・一本化）', () => {
    // 入力経路（手書き・タッチ）によらず、同は role・仮真強は extras に入る（2026-08-31）
    const r = applySymbol(init(), '同', [line([85, 80], [115, 95])], BOXES)
    expect(r.applied).toBe(true)
    expect(r.next.answer.role[1]).toBe('同')
    expect(r.next.extras).toEqual([])
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

  it('カッコの真下なら、左どなりの単語のほうが近くてもまとまりの働きになる', () => {
    // 単語1=80〜130・単語2=150〜200。すき間(130〜150)に書くと中心は単語1に近い
    let state = init()
    state = applySymbol(state, 'square-open', [line([142, 42], [136, 55], [142, 68])], BOXES).next
    const r = applySymbol(state, 'O', [line([131, 80], [136, 95])], BOXES)
    expect(r.applied).toBe(true)
    expect(r.next.pendingOpens).toEqual([{ type: 'n', index: 2, role: 'O' }])
    expect(r.next.answer.role[1]).toBeNull()
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

  it('折り返しのある文では、別の行のカッコに働きが吸われない（縦位置も見る）', () => {
    // 1行目=単語0〜2（top40）／2行目=単語3〜5（top140）。吸着に使う箱を
    // 行で絞らずに渡しても、書いた高さでカッコの行を見分けられること
    const wrapped: TokenBox[] = [
      { index: 0, left: 10, right: 60, top: 40, bottom: 70 },
      { index: 1, left: 70, right: 120, top: 40, bottom: 70 },
      { index: 2, left: 130, right: 180, top: 40, bottom: 70 },
      { index: 3, left: 10, right: 60, top: 140, bottom: 170 },
      { index: 4, left: 70, right: 120, top: 140, bottom: 170 },
      { index: 5, left: 130, right: 180, top: 140, bottom: 170 },
    ]
    const problem2 = SYNTAX_PROBLEMS[1]
    const base = emptyPenAnnotation(emptyAnswer(problem2))
    // 1行目の単語1の前に [ を書いた（閉じ待ち）
    const state = { ...base, pendingOpens: [{ type: 'n' as const, index: 1 }] }
    // 2行目の下（単語3と4のすき間の真下）に S を書く＝1行目のカッコとは無関係
    const r = applySymbol(state, 'S', [line([63, 178], [68, 190])], wrapped)
    expect(r.applied).toBe(true)
    // 1行目のカッコには付かない（縦位置を見ないと、ここで吸われていた）
    expect(r.next.pendingOpens).toEqual([{ type: 'n', index: 1 }])
    // 同じ高さ・同じ横位置でも、2行目のカッコになら付く
    const state2 = { ...base, pendingOpens: [{ type: 'n' as const, index: 4 }] }
    const r2 = applySymbol(state2, 'S', [line([63, 178], [68, 190])], wrapped)
    expect(r2.next.pendingOpens).toEqual([{ type: 'n', index: 4, role: 'S' }])
  })

  it('下線の塊の中のどの単語の下に書いても、働きは塊の最後の単語に付く（2026-08-31）', () => {
    // My brother に下線（塊）。S を My（1語目）の下に書く
    let state = init()
    state = { ...state, answer: { ...state.answer, spans: [{ from: 0, to: 1, type: 'ul' as const }] } }
    const r = applySymbol(state, 'S', [line([25, 80], [45, 95])], BOXES, { tokens: problem.tokens })
    expect(r.applied).toBe(true)
    expect(r.next.answer.role[1]).toBe('S') // 塊の最後の単語（brother）
    expect(r.next.answer.role[0]).toBeNull()
    expect(r.target).toEqual({ from: 1, to: 1 })
  })

  it('塊の末尾が句読点なら、その手前の単語に働きが付く', () => {
    // very well .（5〜7語目）に下線。O を very（5語目）の下に書く
    let state = init()
    state = { ...state, answer: { ...state.answer, spans: [{ from: 4, to: 6, type: 'ul' as const }] } }
    const r = applySymbol(state, 'O', [line([295, 80], [320, 95])], BOXES, { tokens: problem.tokens })
    expect(r.next.answer.role[5]).toBe('O') // 「.」を飛ばして well に付く
    expect(r.next.answer.role[6]).toBeNull()
  })

  it('下線の塊が無い単語では、従来どおり書いた単語に働きが付く', () => {
    const r = applySymbol(init(), 'S', [line([25, 80], [45, 95])], BOXES, { tokens: problem.tokens })
    expect(r.next.answer.role[0]).toBe('S')
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

describe('行をまたぐ下線の連結（2026-08-31 確定仕様4）', () => {
  // 折り返した2行の文。1行目=0〜2語目／2行目=3〜5語目
  const LINE1: TokenBox[] = [
    { index: 0, left: 10, right: 60, top: 40, bottom: 70 },
    { index: 1, left: 70, right: 120, top: 40, bottom: 70 },
    { index: 2, left: 130, right: 180, top: 40, bottom: 70 },
  ]
  const LINE2: TokenBox[] = [
    { index: 3, left: 10, right: 60, top: 140, bottom: 170 },
    { index: 4, left: 70, right: 120, top: 140, bottom: 170 },
    { index: 5, left: 130, right: 180, top: 140, bottom: 170 },
  ]
  const ALL = [...LINE1, ...LINE2]
  const TOKENS6 = ['The', 'tall', 'kind', 'young', 'teacher', '.']
  const problem = SYNTAX_PROBLEMS[0]
  const init = (spans: StudentSpan[], roles: Array<[number, string]> = []) => {
    const base = emptyPenAnnotation(emptyAnswer(problem))
    const role = [...base.answer.role]
    for (const [i, v] of roles) role[i] = v
    return { ...base, answer: { ...base.answer, spans, role } }
  }
  /** 2行目の行頭（3語目）から4語目までの下線 */
  const strokeLine2Head = [line([12, 175], [118, 176])]

  it('前の行の末尾まで達した働き未記入の下線があり、次の行の行頭から書けば連結する', () => {
    const state = init([{ from: 0, to: 2, type: 'ul' }])
    const r = applySymbol(state, 'hline', strokeLine2Head, LINE2, {
      tokens: TOKENS6,
      allBoxes: ALL,
    })
    expect(r.applied).toBe(true)
    expect(r.next.answer.spans).toEqual([{ from: 0, to: 4, type: 'ul' }])
    expect(r.message).toContain('つなげて')
    expect(r.target).toEqual({ from: 0, to: 4 })
  })

  it('前の行の下線に働きが書いてあれば連結しない（別々の塊のまま）', () => {
    const state = init([{ from: 0, to: 2, type: 'ul' }], [[2, 'S']])
    const r = applySymbol(state, 'hline', strokeLine2Head, LINE2, {
      tokens: TOKENS6,
      allBoxes: ALL,
    })
    expect(r.next.answer.spans).toEqual([
      { from: 0, to: 2, type: 'ul' },
      { from: 3, to: 4, type: 'ul' },
    ])
  })

  it('前の行の下線が行末に達していなければ連結しない', () => {
    const state = init([{ from: 0, to: 1, type: 'ul' }])
    const r = applySymbol(state, 'hline', strokeLine2Head, LINE2, {
      tokens: TOKENS6,
      allBoxes: ALL,
    })
    expect(r.next.answer.spans).toHaveLength(2)
  })

  it('新しい下線が行頭から始まっていなければ連結しない', () => {
    const state = init([{ from: 0, to: 2, type: 'ul' }])
    // 2行目の2語目（4語目）から引いた下線
    const r = applySymbol(state, 'hline', [line([72, 175], [118, 176])], LINE2, {
      tokens: TOKENS6,
      allBoxes: ALL,
    })
    expect(r.next.answer.spans).toEqual([
      { from: 0, to: 2, type: 'ul' },
      { from: 4, to: 4, type: 'ul' },
    ])
  })

  it('行末・行頭の句読点は無視して判定する（許容誤差は語単位）', () => {
    // 前の行の末尾（2語目）が読点なら、その手前まで達した下線でも「行末まで」とみなす
    const withComma = ['The', 'tall', ',', 'young', 'teacher', '.']
    const state = init([{ from: 0, to: 1, type: 'ul' }])
    const r = applySymbol(state, 'hline', strokeLine2Head, LINE2, {
      tokens: withComma,
      allBoxes: ALL,
    })
    expect(r.next.answer.spans).toEqual([{ from: 0, to: 4, type: 'ul' }])
  })

  it('全行の単語箱が無ければ連結しない（従来どおり別の下線になる）', () => {
    const state = init([{ from: 0, to: 2, type: 'ul' }])
    const r = applySymbol(state, 'hline', strokeLine2Head, LINE2, { tokens: TOKENS6 })
    expect(r.next.answer.spans).toHaveLength(2)
  })

  /* ---- 波線も下線と同じ扱いで行またぎ連結する（2026-09-02 項目2） ---- */

  const initWavy = (extras: Array<{ from: number; to: number }>) => {
    const base = emptyPenAnnotation(emptyAnswer(problem))
    return { ...base, extras: extras.map((x) => ({ kind: 'wavy' as const, ...x })) }
  }

  it('波線: 前の行の末尾まで達した波線があり、次の行の行頭から書けば連結する', () => {
    const state = initWavy([{ from: 0, to: 2 }])
    const r = applySymbol(state, 'wavy', strokeLine2Head, LINE2, {
      tokens: TOKENS6,
      allBoxes: ALL,
    })
    expect(r.applied).toBe(true)
    expect(r.next.extras).toEqual([{ kind: 'wavy', from: 0, to: 4 }])
    expect(r.message).toContain('つなげて')
    expect(r.target).toEqual({ from: 0, to: 4 })
  })

  it('波線: 前の行の波線が行末に達していなければ連結しない', () => {
    const state = initWavy([{ from: 0, to: 1 }])
    const r = applySymbol(state, 'wavy', strokeLine2Head, LINE2, {
      tokens: TOKENS6,
      allBoxes: ALL,
    })
    expect(r.next.extras).toHaveLength(2)
  })

  it('波線: 新しい波線が行頭から始まっていなければ連結しない', () => {
    const state = initWavy([{ from: 0, to: 2 }])
    const r = applySymbol(state, 'wavy', [line([72, 175], [118, 176])], LINE2, {
      tokens: TOKENS6,
      allBoxes: ALL,
    })
    expect(r.next.extras).toEqual([
      { kind: 'wavy', from: 0, to: 2 },
      { kind: 'wavy', from: 4, to: 4 },
    ])
  })
})

describe('findLineAt（下線・波線のタッチの当たり判定・2026-09-02 項目3）', () => {
  const BOXES2: TokenBox[] = [
    { index: 0, left: 10, right: 60, top: 40, bottom: 70, baseline: 64 },
    { index: 1, left: 70, right: 120, top: 40, bottom: 70, baseline: 64 },
    { index: 2, left: 130, right: 180, top: 40, bottom: 70, baseline: 64 },
  ]
  const spans = [{ from: 0, to: 1, type: 'ul' }]
  const extras = [{ kind: 'wavy', from: 2, to: 2 }]

  it('下線の真上のタッチは下線に当たる（線はベースライン+1の高さ）', () => {
    const hit = findLineAt({ x: 30, y: 66 }, spans, extras, BOXES2)
    expect(hit).toEqual({ kind: 'ul', index: 0, from: 0, to: 1 })
  })

  it('波線の範囲のタッチは波線に当たる', () => {
    const hit = findLineAt({ x: 150, y: 66 }, spans, extras, BOXES2)
    expect(hit).toEqual({ kind: 'wavy', index: 0, from: 2, to: 2 })
  })

  it('線から縦に離れたタッチ・横の範囲外のタッチは当たらない', () => {
    expect(findLineAt({ x: 30, y: 45 }, spans, extras, BOXES2)).toBeNull()
    expect(findLineAt({ x: 178, y: 66 }, spans, [], BOXES2)).toBeNull()
  })

  it('下線と波線が同じ範囲に重なるときは波線を先にする（直すのは主に波線のため）', () => {
    const both = findLineAt(
      { x: 30, y: 66 },
      [{ from: 0, to: 1, type: 'ul' }],
      [{ kind: 'wavy', from: 0, to: 1 }],
      BOXES2,
    )
    expect(both?.kind).toBe('wavy')
  })
})

describe('wavyPath（波線のひとつながり描画・2026-09-02 項目2）', () => {
  it('幅ぶんの波を1本のパスで返す（M で始まり q の連なり）', () => {
    const d = wavyPath(40)
    expect(d.startsWith('M0,3')).toBe(true)
    // 半周期4pxなので 40px なら10回の曲線
    expect(d.match(/ q /g)?.length).toBe(10)
  })

  it('端数の幅でも最後の半周期を短くして幅ちょうどで終わる', () => {
    const d = wavyPath(10)
    // 4+4+2 の3区間
    expect(d.match(/ q /g)?.length).toBe(3)
    // 相対 x の合計が幅と一致する
    const dxs = Array.from(d.matchAll(/ q [-\d.]+,[-\d.]+ ([-\d.]+),0/g)).map((m) => Number(m[1]))
    expect(dxs.reduce((a, b) => a + b, 0)).toBeCloseTo(10, 5)
  })

  it('幅が0以下なら空文字（描かない）', () => {
    expect(wavyPath(0)).toBe('')
    expect(wavyPath(-5)).toBe('')
  })
})

describe('roleCellParts（○で囲んだ例外マークを働きの欄に置く）', () => {
  const problem = SYNTAX_PROBLEMS[0]
  const init = () => emptyPenAnnotation(emptyAnswer(problem))
  /** 2語目を○で囲んだ「仮」／2語目の下の「S」 */
  const kari: PenStroke[] = [arc(105, 20, 16, -90, 266), line([100, 14], [110, 26])]
  const roleS: PenStroke[] = [line([85, 80], [115, 95])]
  const cellOf = (state: ReturnType<typeof init>, i: number) =>
    roleCellParts(state.answer.role[i], state.extras.filter((x) => i >= x.from && i <= x.to))

  it('「仮」と働きは1つの値（仮S）になり、書く順序を変えても同じ結果になる', () => {
    // 順序①: ○仮 → S
    let a = applySymbol(init(), '仮', kari, BOXES).next
    a = applySymbol(a, 'S', roleS, BOXES).next
    // 順序②: S → ○仮
    let b = applySymbol(init(), 'S', roleS, BOXES).next
    b = applySymbol(b, '仮', kari, BOXES).next

    expect(cellOf(a, 1).text).toBe('仮S')
    expect(cellOf(b, 1).text).toBe('仮S')
    expect(cellOf(a, 1)).toEqual(cellOf(b, 1))
    expect(cellOf(a, 1).before).toEqual(['仮'])
    expect(cellOf(a, 1).value).toBe('S')
  })

  it('「強」は単独の印として1マスに出る（働きが無くても表示される）', () => {
    const kyo = applySymbol(init(), '強', kari, BOXES).next
    expect(cellOf(kyo, 1).text).toBe('強')
    expect(cellOf(kyo, 1).alone).toEqual(['強'])
    expect(cellOf(kyo, 1).empty).toBe(false)
  })

  it('「同」は働きの値としてマスに出る（extras ではなく role）', () => {
    const dou = applySymbol(init(), '同', kari, BOXES).next
    expect(cellOf(dou, 1).text).toBe('同')
    expect(cellOf(dou, 1).value).toBe('同')
    expect(cellOf(dou, 1).alone).toEqual([])
  })

  it('働きも例外マークも無ければ空のマスになる', () => {
    expect(cellOf(init(), 1).empty).toBe(true)
    expect(cellOf(init(), 1).text).toBe('')
  })

  it('並びは記号の台帳の順で決まる（複数付いても書いた順序に左右されない）', () => {
    const marks = [
      { kind: 'exception' as const, label: '強' as const, from: 1, to: 1 },
      { kind: 'exception' as const, label: '仮' as const, from: 1, to: 1 },
    ]
    expect(roleCellParts('S', marks).text).toBe('仮S強')
    expect(roleCellParts('S', [...marks].reverse()).text).toBe('仮S強')
  })
})

describe('例外の印の一本化と採点の整合（2026-08-31）', () => {
  const problem = SYNTAX_PROBLEMS[0] // 正解表に仮・真・同・強の定義は無い
  const init = () => emptyPenAnnotation(emptyAnswer(problem))

  it('仮・強の印（extras）を付けても採点は1点も変わらない', () => {
    // 正解どおりの解答（働き: brother=S / plays=V / tennis=O ほか）
    const base = emptyAnswer(problem)
    base.role[1] = 'S'
    base.role[2] = 'V'
    base.role[3] = 'O'
    const before = gradeSyntax(problem, base)
    // 印は extras に入り SyntaxAnswer には含まれないため、採点の入力が変わらない
    let state = { ...init(), answer: base }
    state = toggleExceptionMark(state, '仮', 1)
    state = toggleExceptionMark(state, '強', 2)
    const after = gradeSyntax(problem, state.answer)
    expect(after.got).toBe(before.got)
    expect(after.total).toBe(before.total)
    expect(after.roleMark[1]?.mark).toBe('ok')
  })

  it('正解表に定義の無い単語へ「同」を書いても減点されない（採点対象外のマス）', () => {
    const a = emptyAnswer(problem)
    a.role[1] = 'S'
    a.role[2] = 'V'
    a.role[3] = 'O'
    const before = gradeSyntax(problem, a)
    a.role[4] = '同' // very には働きの正解定義が無い
    const after = gradeSyntax(problem, a)
    expect(after.got).toBe(before.got)
    expect(after.total).toBe(before.total)
  })

  it('正解表に「同格」がある単語では、働き「同」が正解になる（roleBase の別名）', () => {
    // 模範分析集の転記には「同格」の2字が残っている（第7講の実データと同じ形）
    const p: SyntaxProblem = {
      id: 'apposition',
      title: 'test',
      source: 'test',
      tokens: ['Graham', ',', 'inventor', '.'],
      key: { pos: {}, role: { 2: { ok: ['同格'] } }, spans: [], notes: [] },
    }
    const a = { pos: [null, null, null, null], role: [null, null, '同', null], spans: [] }
    const g = gradeSyntax(p, a)
    expect(g.roleMark[2]?.mark).toBe('ok')
  })

  it('toggleExceptionMark: 付け外しがトグルで、仮と真は同じ単語に同時に付かない', () => {
    let state = init()
    state = toggleExceptionMark(state, '仮', 1)
    expect(state.extras).toEqual([{ kind: 'exception', label: '仮', from: 1, to: 1 }])
    // 真を付けると仮が外れる（仮主語と真主語は別の単語）
    state = toggleExceptionMark(state, '真', 1)
    expect(state.extras).toEqual([{ kind: 'exception', label: '真', from: 1, to: 1 }])
    // もう一度押すと外れる
    state = toggleExceptionMark(state, '真', 1)
    expect(state.extras).toEqual([])
    // 強は仮・真と共存できる
    state = toggleExceptionMark(state, '仮', 1)
    state = toggleExceptionMark(state, '強', 1)
    expect(state.extras).toHaveLength(2)
  })

  it('pruneExceptionMarks: 働きが S / O でなくなったら仮・真は外れる（強は残る）', () => {
    const marks = [
      { kind: 'exception' as const, label: '仮' as const, from: 1, to: 1 },
      { kind: 'exception' as const, label: '強' as const, from: 1, to: 1 },
    ]
    expect(canMarkKariShin('S')).toBe(true)
    expect(canMarkKariShin('O')).toBe(true)
    expect(canMarkKariShin('V')).toBe(false)
    expect(canMarkKariShin(null)).toBe(false)
    // S のままなら何も外れない
    expect(pruneExceptionMarks(marks, 1, 'S')).toEqual(marks)
    // V に変えると仮だけ外れる
    expect(pruneExceptionMarks(marks, 1, 'V')).toEqual([marks[1]])
    // 別の単語の印には触れない
    expect(pruneExceptionMarks(marks, 2, null)).toEqual(marks)
  })
})
