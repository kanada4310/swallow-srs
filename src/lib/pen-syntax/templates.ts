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
 * 黄リー教式の英字略記（n / v / a / ad / aux / p）の骨格。
 * 塾長の実書き込み（模範分析集 第7講・形式仕様.md）で確認された字母のみを候補にする。
 * 英字は漢字より画数が少なく個人差も小さいが、実運用は「お手本登録」で本人の字を足せる。
 */

/** 小文字 a の骨格（丸＋右の縦棒）を任意の位置に置く */
function letterA(cx: number, stemX: number, top: number, bottom: number): PenStroke[] {
  const r = (bottom - top) / 2
  const cy = (top + bottom) / 2
  return [arc(cx, cy, r, -40, 320, 16), line([stemX, top], [stemX, bottom])]
}

export const POS_STROKE_SOURCES: Array<{ symbol: PosLetter; strokes: PenStroke[] }> = [
  // n: 縦棒＋アーチ（1画で書く形と2画で書く形の両方を内蔵）
  {
    symbol: 'n',
    strokes: [
      [
        ...line([32, 40], [32, 92]),
        ...line([32, 92], [32, 62]),
        ...arc(50, 64, 18, 180, 360, 10),
        ...line([68, 64], [68, 92]),
      ],
    ],
  },
  {
    symbol: 'n',
    strokes: [line([32, 38], [32, 92]), [...arc(50, 64, 18, 180, 360, 10), ...line([68, 64], [68, 92])]],
  },
  // v
  { symbol: 'v', strokes: [line([30, 40], [50, 92], [70, 40])] },
  // a: 丸＋右の縦棒（2画）と、ひと筆書き
  { symbol: 'a', strokes: letterA(46, 66, 46, 92) },
  {
    symbol: 'a',
    strokes: [[...arc(46, 69, 21, -40, 320, 16), ...line([66, 48], [66, 88], [71, 92])]],
  },
  // ad: a＋d（d は丸＋高い縦棒）
  {
    symbol: 'ad',
    strokes: [
      ...letterA(24, 40, 52, 92),
      arc(66, 72, 17, -40, 320, 14),
      line([83, 28], [83, 92]),
    ],
  },
  // aux: a＋u＋x
  {
    symbol: 'aux',
    strokes: [
      ...letterA(15, 28, 56, 92),
      [...line([38, 56], [38, 78]), ...arc(47, 78, 9, 180, 0, 8), ...line([56, 78], [56, 56], [56, 86], [62, 92])],
      line([70, 56], [94, 92]),
      line([94, 56], [70, 92]),
    ],
  },
  // p: 下に伸びる縦棒＋上の丸（2画）と、ひと筆書き
  {
    symbol: 'p',
    strokes: [
      line([34, 42], [34, 96]),
      [...line([34, 46], [46, 42]), ...arc(46, 56, 14, -90, 90, 10), ...line([46, 70], [34, 70])],
    ],
  },
  {
    symbol: 'p',
    strokes: [
      [
        ...line([34, 42], [34, 96]),
        ...line([34, 96], [34, 46]),
        ...arc(46, 58, 14, -90, 90, 12),
        ...line([46, 72], [34, 72]),
      ],
    ],
  },
]

export const POS_TEMPLATES: Array<CloudTemplate<PosLetter>> = POS_STROKE_SOURCES.map((s) =>
  makeTemplate(s.symbol, s.strokes),
)
