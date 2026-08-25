/**
 * 判別用の内蔵お手本（0〜100 の座標系・y は下向き）。
 *
 * 形の記号（群A＋B）と、文字（群C）の全候補ぶんを内蔵する。
 * 文字は書き手の癖の影響が大きいので、内蔵お手本に加えて
 * 「お手本登録」（本人の字を localStorage に保存）で上書き・追加できる。
 * 生のストローク（*_STROKE_SOURCES）は計測ベンチマークの生成元にも使う。
 */

import type { PenPoint, PenStroke, PosLetter, RoleLetter, ShapeKind } from './types'
import { type CloudTemplate, makeTemplate } from './pdollar'

function line(...pts: Array<[number, number]>): PenStroke {
  return pts.map(([x, y]) => ({ x, y }))
}

/** 円弧を点列にする（deg は 0=右・90=下） */
function arc(cx: number, cy: number, r: number, deg0: number, deg1: number, steps = 16): PenStroke {
  const out: PenPoint[] = []
  for (let i = 0; i <= steps; i++) {
    const a = ((deg0 + ((deg1 - deg0) * i) / steps) * Math.PI) / 180
    out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) })
  }
  return out
}

function circle(cx: number, cy: number, r: number): PenStroke {
  return arc(cx, cy, r, -90, 270, 28)
}

/* ===================== 形の記号（群A＋B） ===================== */

export const SHAPE_STROKE_SOURCES: Array<{ symbol: ShapeKind; strokes: PenStroke[] }> = [
  { symbol: 'paren-open', strokes: [line([60, 8], [42, 28], [36, 50], [42, 72], [60, 92])] },
  { symbol: 'paren-close', strokes: [line([40, 8], [58, 28], [64, 50], [58, 72], [40, 92])] },
  { symbol: 'square-open', strokes: [line([64, 10], [40, 10], [40, 90], [64, 90])] },
  { symbol: 'square-close', strokes: [line([36, 10], [60, 10], [60, 90], [36, 90])] },
  { symbol: 'angle-open', strokes: [line([64, 10], [36, 50], [64, 90])] },
  { symbol: 'angle-close', strokes: [line([36, 10], [64, 50], [36, 90])] },
  {
    symbol: 'brace-open',
    strokes: [
      line([64, 6], [50, 12], [46, 28], [46, 42], [34, 50], [46, 58], [46, 72], [50, 88], [64, 94]),
    ],
  },
  {
    symbol: 'brace-close',
    strokes: [
      line([36, 6], [50, 12], [54, 28], [54, 42], [66, 50], [54, 58], [54, 72], [50, 88], [36, 94]),
    ],
  },
  { symbol: 'hline', strokes: [line([8, 50], [92, 50])] },
  { symbol: 'circle', strokes: [circle(50, 50, 40)] },
  {
    symbol: 'wavy',
    strokes: [
      line(
        [5, 50], [13, 38], [21, 50], [29, 62], [37, 50], [45, 38], [53, 50], [61, 62], [69, 50],
        [77, 38], [85, 50], [93, 62],
      ),
    ],
  },
  {
    symbol: 'question',
    strokes: [[...arc(50, 28, 20, 180, 380, 14), ...line([68, 35], [52, 55], [50, 68])]],
  },
  {
    symbol: 'question',
    strokes: [
      [...arc(50, 28, 20, 180, 380, 14), ...line([68, 35], [52, 55], [50, 66])],
      line([50, 84], [50, 90]),
    ],
  },
  { symbol: 'slash', strokes: [line([72, 12], [28, 88])] },
  { symbol: 'tick', strokes: [line([56, 20], [44, 60])] },
  { symbol: 'null-sign', strokes: [circle(50, 50, 34), line([76, 14], [24, 86])] },
  { symbol: 'triangle', strokes: [line([32, 15], [32, 85], [78, 50], [32, 15])] },
]

export const SHAPE_TEMPLATES: Array<CloudTemplate<ShapeKind>> = SHAPE_STROKE_SOURCES.map((s) =>
  makeTemplate(s.symbol, s.strokes),
)

/* ===================== 働きの文字（群C・下の行） ===================== */

export const ROLE_STROKE_SOURCES: Array<{ symbol: RoleLetter; strokes: PenStroke[] }> = [
  {
    symbol: 'S',
    strokes: [[...arc(50, 27, 21, -30, -270, 14), ...arc(50, 71, 23, -90, 130, 14)]],
  },
  { symbol: 'V', strokes: [line([22, 10], [50, 90], [78, 10])] },
  { symbol: 'O', strokes: [circle(50, 50, 38)] },
  { symbol: 'C', strokes: [arc(54, 50, 40, -60, -300, 20)] },
  { symbol: 'M', strokes: [line([14, 90], [20, 10], [50, 72], [80, 10], [86, 90])] },
  {
    symbol: 'P',
    strokes: [
      line([32, 10], [32, 90]),
      [...line([32, 14], [52, 14]), ...arc(52, 30, 16, -90, 90, 10), ...line([52, 46], [32, 46])],
    ],
  },
  {
    symbol: 'Po',
    strokes: [
      line([24, 10], [24, 82]),
      [...line([24, 14], [40, 14]), ...arc(40, 26, 12, -90, 90, 10), ...line([40, 38], [24, 38])],
      circle(66, 68, 14),
    ],
  },
  { symbol: '▷', strokes: [line([34, 18], [34, 82], [76, 50], [34, 18])] },
]

export const ROLE_TEMPLATES: Array<CloudTemplate<RoleLetter>> = ROLE_STROKE_SOURCES.map((s) =>
  makeTemplate(s.symbol, s.strokes),
)

/* ===================== 品詞の文字（群C・上の行） =====================
 * ルールブック本文の略記（名・前・形・冠 …）に合わせた1文字の骨格。
 * 手書きの漢字は個人差が大きいため、あくまで初期値。実運用は「お手本登録」で本人の字を足す。
 */

/** 口（くち）の3画 */
function boxStrokes(l: number, t: number, r: number, b: number): PenStroke[] {
  return [line([l, t], [l, b]), line([l, t], [r, t], [r, b]), line([l, b], [r, b])]
}

export const POS_STROKE_SOURCES: Array<{ symbol: PosLetter; strokes: PenStroke[] }> = [
  {
    symbol: '名',
    strokes: [
      line([55, 5], [30, 30]),
      line([28, 20], [72, 20], [45, 48]),
      ...boxStrokes(35, 55, 70, 90),
    ],
  },
  {
    symbol: '代',
    strokes: [
      line([30, 8], [16, 38]),
      line([24, 24], [24, 90]),
      line([40, 34], [86, 28]),
      line([62, 12], [74, 68], [86, 74]),
      line([76, 40], [84, 50]),
    ],
  },
  {
    symbol: '動',
    strokes: [
      line([12, 12], [44, 12]),
      line([28, 6], [28, 74]),
      ...boxStrokes(16, 24, 40, 44),
      line([12, 54], [44, 54]),
      line([12, 66], [44, 66]),
      line([8, 78], [48, 78]),
      line([56, 28], [84, 28], [76, 84]),
      line([68, 28], [52, 88]),
    ],
  },
  {
    symbol: '助',
    strokes: [
      ...boxStrokes(12, 14, 40, 78),
      line([12, 36], [40, 36]),
      line([12, 56], [40, 56]),
      line([8, 84], [46, 84]),
      line([58, 26], [86, 26], [78, 84]),
      line([70, 26], [54, 88]),
    ],
  },
  {
    symbol: '形',
    strokes: [
      line([10, 18], [46, 18]),
      line([8, 44], [48, 44]),
      line([22, 44], [12, 86]),
      line([36, 44], [36, 86]),
      line([84, 14], [60, 32]),
      line([87, 40], [62, 58]),
      line([90, 64], [58, 88]),
    ],
  },
  {
    symbol: '副',
    strokes: [
      line([10, 10], [44, 10]),
      ...boxStrokes(18, 18, 38, 32),
      ...boxStrokes(12, 42, 42, 84),
      line([27, 42], [27, 84]),
      line([12, 63], [42, 63]),
      line([60, 18], [60, 56]),
      line([78, 8], [78, 84], [70, 90]),
    ],
  },
  {
    symbol: '前',
    strokes: [
      line([32, 6], [38, 16]),
      line([62, 6], [54, 16]),
      line([12, 22], [88, 22]),
      line([26, 32], [24, 86]),
      line([26, 32], [48, 32], [48, 84]),
      line([26, 50], [48, 50]),
      line([26, 66], [48, 66]),
      line([62, 34], [62, 64]),
      line([80, 28], [80, 84], [72, 90]),
    ],
  },
  {
    symbol: '接',
    strokes: [
      line([18, 8], [18, 84], [10, 76]),
      line([6, 30], [30, 30]),
      line([6, 56], [30, 52]),
      line([62, 6], [62, 14]),
      line([44, 18], [88, 18]),
      line([52, 26], [56, 34]),
      line([80, 26], [74, 34]),
      line([44, 42], [88, 42]),
      line([64, 48], [52, 68], [70, 88]),
      line([48, 62], [86, 62]),
      line([74, 50], [58, 90]),
    ],
  },
  {
    symbol: '冠',
    strokes: [
      line([12, 26], [12, 14], [88, 14], [88, 26]),
      line([20, 36], [52, 36]),
      line([16, 50], [54, 50]),
      line([30, 50], [20, 80]),
      line([42, 50], [42, 74], [56, 78]),
      line([62, 42], [90, 42]),
      line([78, 34], [78, 80], [68, 86]),
      line([66, 58], [72, 64]),
    ],
  },
  {
    symbol: '分',
    strokes: [
      line([44, 8], [14, 44]),
      line([56, 8], [86, 44]),
      line([34, 54], [70, 54], [58, 90]),
      line([56, 58], [28, 92]),
    ],
  },
  {
    symbol: '不',
    strokes: [
      line([10, 16], [90, 16]),
      line([54, 16], [14, 68]),
      line([50, 26], [50, 90]),
      line([62, 42], [76, 58]),
    ],
  },
]

export const POS_TEMPLATES: Array<CloudTemplate<PosLetter>> = POS_STROKE_SOURCES.map((s) =>
  makeTemplate(s.symbol, s.strokes),
)
