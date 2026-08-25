/**
 * 形の記号（群A＝括弧4種＋下線 / 群B＝○囲み・波線・?・ダッシュ・Ø）の判別。
 *
 * まず線をならしてから幾何特徴（折れの数・閉じ具合・膨らみの向きなど）で当たりを付け、
 * $P 点群照合の結果と混ぜて最終スコアにする。
 * 確信が拮抗したときは candidates を複数返し、UI が候補チップを出す（構想 v1.1 論点3）。
 */

import type { PenStroke, RecognitionResult, ShapeKind, SymbolCandidate } from './types'
import {
  arcFitError,
  bbox,
  bulgeSide,
  chordAngleDeg,
  closedness,
  countCorners,
  countYAlternations,
  distToSegment,
  fitError,
  pathLength,
  resample,
  smooth,
  straightness,
  turnAngles,
} from './geometry'
import { matchClouds } from './pdollar'
import { SHAPE_TEMPLATES } from './templates'

/** 確信の差がこれ未満なら「迷った」として候補チップを出す */
export const AMBIGUOUS_MARGIN = 0.12
/** 最有力候補の確信がこれ未満なら判別失敗（ボタン方式へ逃がす） */
export const MIN_SCORE = 0.35
/** 括弧とみなす最小の大きさ（px）。これより小さい線はダッシュなどの小記号 */
const BRACKET_MIN_SIZE = 26

function median(xs: number[]): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

function ruleScores(strokes: PenStroke[]): Partial<Record<ShapeKind, number>> {
  const scores: Partial<Record<ShapeKind, number>> = {}
  const put = (k: ShapeKind, v: number) => {
    scores[k] = Math.max(scores[k] ?? 0, v)
  }

  if (strokes.length >= 2) {
    const smoothed = strokes.map((s) => smooth(resample(s, 32)))
    // Ø: 閉じた線＋それを横切る斜め線
    const closedIdx = smoothed.findIndex(
      (s) => s.length > 4 && closedness(s) < 0.35 && countCorners(s) <= 1,
    )
    if (closedIdx >= 0 && strokes.length === 2) {
      const other = smoothed[1 - closedIdx]
      const a = Math.abs(chordAngleDeg(other))
      if (straightness(other) > 0.85 && a > 25 && a < 155) put('null-sign', 0.9)
    }
    // ?: フック（曲がった縦長の線）＋小さな点
    if (strokes.length === 2) {
      const sizes = smoothed.map((s) => {
        const b = bbox(s)
        return Math.max(b.width, b.height)
      })
      const dotIdx = sizes.findIndex((s, i) => s < 10 && pathLength(smoothed[i]) < 14)
      if (dotIdx >= 0) {
        const main = smoothed[1 - dotIdx]
        const mb = bbox(main)
        if (mb.height > mb.width * 0.7 && closedness(main) > 0.35 && straightness(main) < 0.9) {
          put('question', 0.9)
        }
      }
    }
    return scores
  }

  const s = smooth(resample(strokes[0], 48), 2)
  const b = bbox(s)
  const straight = straightness(s)
  const closed = closedness(s)
  const corners = countCorners(s)
  const angle = Math.abs(chordAngleDeg(s))
  const size = Math.max(b.width, b.height)
  // 大きな折り返し（h の2割以上の上下反転）の数。括弧は0、?は1になる
  const bigYAlt = countYAlternations(s, Math.max(4, b.height * 0.2))

  // 閉じた線: ○ か ▷ か。カーブの滑らかさ（方向変化の中央値）で見分ける
  if (closed < 0.32 && size > 8) {
    const medTurn = median(turnAngles(s))
    if (medTurn < 25 && corners >= 2) put('triangle', 0.85)
    else put('circle', Math.min(0.92, 0.95 - closed))
  }

  // まっすぐな線
  if (straight > 0.92) {
    if (angle < 30 || angle > 150) put('hline', 0.85 + (straight - 0.92))
    else if ((angle >= 30 && angle <= 75) || (angle > 105 && angle < 150)) {
      put(size < 30 ? 'tick' : 'slash', 0.8)
    }
    // ほぼ垂直の棒だけでは括弧の種類を決められない（$P と候補チップに任せる）
  }

  // 波線: 横方向に進みつつ上下に3回以上折り返す
  if (b.width > b.height * 1.2 && straight < 0.95 && countYAlternations(s) >= 3) put('wavy', 0.9)

  // ?（1画で書いたもの）: 縦長・閉じていない・上へ膨らんでから下りる・終点が下側
  if (
    closed >= 0.3 &&
    b.height > b.width * 0.8 &&
    straight < 0.9 &&
    bigYAlt >= 1 &&
    s[s.length - 1].y > b.top + b.height * 0.6
  ) {
    put('question', 0.8)
  }

  // 括弧の系統: 縦に長く、閉じておらず、上下の折り返しのない線
  if (
    closed >= 0.3 &&
    b.height > b.width * 0.9 &&
    straight <= 0.95 &&
    size >= BRACKET_MIN_SIZE &&
    bigYAlt === 0
  ) {
    const first = s[0]
    const last = s[s.length - 1]
    const goingDown = last.y >= first.y
    let bulge = bulgeSide(s)
    if (!goingDown) bulge = -bulge // 下→上に書いても同じ扱いにする
    // 弦が縦のとき、bulge > 0 は左膨らみ（＝右に開く「開き括弧」）
    const openish = bulge > 0

    // 4種の見分け。
    // 丸括弧と山括弧は「円弧としての当てはまり」vs「頂点で折れた2本線としての当てはまり」を
    // 直接比べる（統計量より原理的で、書き方の揺れに強い）。
    // 角括弧と波括弧は折れの数（強55°・弱40°の2段しきい値）で拾う。
    const cornersStrict = countCorners(s, { minTurnDeg: 55 })
    const cornersLenient = countCorners(s, { minTurnDeg: 40 })

    // 弦から最も離れた点＝頂点（山括弧なら折れ目、丸括弧なら膨らみの頂上）
    let apexIdx = 0
    let apexDist = -1
    for (let i = 0; i < s.length; i++) {
      const cross = Math.abs((last.x - first.x) * (s[i].y - first.y) - (last.y - first.y) * (s[i].x - first.x))
      if (cross > apexDist) {
        apexDist = cross
        apexIdx = i
      }
    }
    const apex = s[apexIdx]
    const polyErr = fitError(s, (p) =>
      Math.min(distToSegment(p, first, apex), distToSegment(p, apex, last)),
    ) / size
    const arcErr = arcFitError(s, first, apex, last) / size

    const vertexLeft = apex.x < (first.x + last.x) / 2
    const endsX = (first.x + last.x) / 2

    if (cornersLenient <= 2) {
      // 丸括弧（ ）: 円弧としての当てはまりが2本線より良い
      if (arcErr < 0.035 && arcErr < polyErr - 0.01) put(openish ? 'paren-open' : 'paren-close', 0.9)
      else if (arcErr < polyErr && arcErr < 0.05) put(openish ? 'paren-open' : 'paren-close', 0.7)
      // 山括弧 〈 〉: 2本線としての当てはまりが円弧より良い。頂点の側で開閉を決める
      if (polyErr < 0.035 && polyErr < arcErr - 0.01) put(vertexLeft ? 'angle-open' : 'angle-close', 0.9)
      else if (polyErr < arcErr && polyErr < 0.05) put(vertexLeft ? 'angle-open' : 'angle-close', 0.7)
    }

    // 角括弧・波括弧は「円弧にも2本線にも当てはまらない」ことも要求する
    // （ノイズで折れの数が水増しされた丸括弧・山括弧を吸い込まないため）
    const minFitErr = Math.min(arcErr, polyErr)

    // 角括弧 [ ]: 直角の折れ2つ。端の横棒がどちらを向いているか（右向き＝ [ ）
    if (cornersStrict === 2 && cornersLenient <= 3 && minFitErr > 0.03) {
      put(endsX > b.cx ? 'square-open' : 'square-close', 0.9)
    } else if (cornersLenient === 2 && minFitErr > 0.03) {
      put(endsX > b.cx ? 'square-open' : 'square-close', 0.6)
    }

    // 波括弧 { }: 折れが3つ以上。中央のツノの向きで開閉を決める
    const midX = s[Math.floor(s.length / 2)].x
    if ((cornersStrict >= 3 || cornersLenient >= 4) && minFitErr > 0.04) {
      put(midX < endsX ? 'brace-open' : 'brace-close', 0.9)
    } else if (cornersLenient === 3 && minFitErr > 0.03) {
      put(midX < endsX ? 'brace-open' : 'brace-close', 0.65)
    }
  }

  return scores
}

/** 形の記号を判別する。座標は px 前提（tick と slash の境目などに大きさを使う） */
export function classifyShape(strokes: PenStroke[]): RecognitionResult {
  const rules = ruleScores(strokes)
  const pMatches = matchClouds(strokes, SHAPE_TEMPLATES)
  const pScore = new Map<ShapeKind, number>()
  for (const m of pMatches) pScore.set(m.symbol, m.score)

  const kinds = new Set<ShapeKind>([
    ...(Object.keys(rules) as ShapeKind[]),
    ...pMatches.map((m) => m.symbol),
  ])
  const ranked: SymbolCandidate[] = Array.from(kinds)
    .map((symbol) => {
      const r = rules[symbol]
      const p = pScore.get(symbol) ?? 0
      // 幾何特徴の裏付けがある候補を優先し、$P だけの候補は控えめに扱う
      const score = r !== undefined ? 0.65 * r + 0.35 * p : 0.5 * p
      return { symbol, score }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)

  if (ranked.length === 0 || ranked[0].score < MIN_SCORE) {
    return { best: null, candidates: ranked, ambiguous: true }
  }
  const ambiguous = ranked.length > 1 && ranked[0].score - ranked[1].score < AMBIGUOUS_MARGIN
  return { best: ranked[0], candidates: ranked, ambiguous }
}
