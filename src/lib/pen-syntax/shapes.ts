/**
 * 形の記号（群A＝括弧4種＋下線 / 群B＝○囲み・波線・?・ダッシュ・Ø）の判別。
 *
 * まず線をならしてから幾何特徴（折れの数・閉じ具合・膨らみの向きなど）で当たりを付け、
 * $P 点群照合の結果と混ぜて最終スコアにする。
 * 確信が拮抗したときは candidates を複数返し、UI が候補チップを出す（構想 v1.1 論点3）。
 *
 * 加えて「お手本登録」（本人の字・localStorage）があれば照合対象にする（2026-08-26）。
 * 実機で判別率の低い閉じ括弧（〉 ｝ ]）は書き手の癖の影響が大きく、本人のお手本との
 * 距離が近ければそれを強い証拠として扱う。お手本が無いときの挙動は従来と同一。
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
import { matchClouds, type CloudTemplate } from './pdollar'
import { SHAPE_STROKE_SOURCES, SHAPE_TEMPLATES } from './templates'
import { userTemplatesFor, type UserTemplateStore } from './letters'

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

/** 形の記号の全種類（登録お手本の照合対象を絞るのに使う） */
const SHAPE_KINDS: readonly string[] = Array.from(
  new Set(SHAPE_STROKE_SOURCES.map((s) => s.symbol)),
)

/** 同じ向きの括弧4種（お手本の相対比較の母集団） */
const OPEN_BRACKETS: ShapeKind[] = ['paren-open', 'square-open', 'angle-open', 'brace-open']
const CLOSE_BRACKETS: ShapeKind[] = ['paren-close', 'square-close', 'angle-close', 'brace-close']

/** お手本の相対比較で「明確に一番近い」とみなす最小の差 */
const USER_MARGIN = 0.02
/** 幾何特徴が強い確信（0.9級）で別の括弧を指しているとき、覆すのに要求する差 */
const USER_MARGIN_VS_STRONG_RULE = 0.08

/**
 * 括弧らしい1画の線の「開き/閉じ」の向き（膨らみの側）。括弧でなければ null。
 * $P 点群照合は左右の向きの違いに弱いため、お手本の照合はこの向きが一致する
 * 括弧にだけ効かせる（開き括弧の線が閉じ括弧のお手本に吸われるのを防ぐ）。
 */
function bracketOpenish(strokes: PenStroke[]): boolean | null {
  if (strokes.length !== 1) return null
  const s = smooth(resample(strokes[0], 48), 2)
  const b = bbox(s)
  const size = Math.max(b.width, b.height)
  if (
    closedness(s) < 0.3 ||
    b.height <= b.width * 0.9 ||
    straightness(s) > 0.95 ||
    size < BRACKET_MIN_SIZE
  ) {
    return null
  }
  const first = s[0]
  const last = s[s.length - 1]
  let bulge = bulgeSide(s)
  if (last.y < first.y) bulge = -bulge // 下→上に書いても同じ扱いにする
  return bulge > 0
}

/** 記号が括弧の開き/閉じのどちらか（括弧でなければ null） */
function symbolOpenish(symbol: ShapeKind): boolean | null {
  if (symbol.endsWith('-open')) return true
  if (symbol.endsWith('-close')) return false
  return null
}

/**
 * 形の記号を判別する。座標は px 前提（tick と slash の境目などに大きさを使う）。
 * store（お手本登録）を渡すと本人の字も照合対象になる。無ければ従来と同じ挙動。
 */
export function classifyShape(
  strokes: PenStroke[],
  store: UserTemplateStore | null = null,
): RecognitionResult {
  const rules = ruleScores(strokes)
  const pMatches = matchClouds(strokes, SHAPE_TEMPLATES)
  const pScore = new Map<ShapeKind, number>()
  for (const m of pMatches) pScore.set(m.symbol, m.score)

  // 登録お手本（本人の字）。書き手の癖ごと照合できるため、閉じ括弧の見分けに効く。
  // 括弧のお手本は、書かれた線の開き/閉じの向きが一致するものにだけ効かせる
  // （$P 点群照合は左右の向きの違いに弱く、逆向きの括弧に吸われるのを防ぐ）
  const uScore = new Map<ShapeKind, number>()
  const userTpls = userTemplatesFor(store, SHAPE_KINDS) as Array<CloudTemplate<ShapeKind>>
  const openish = userTpls.length > 0 ? bracketOpenish(strokes) : null
  if (userTpls.length > 0) {
    for (const m of matchClouds(strokes, userTpls)) {
      const so = symbolOpenish(m.symbol)
      if (so !== null && openish !== null && so !== openish) continue
      uScore.set(m.symbol, m.score)
    }
  }

  // 括弧の種類は「本人のお手本4種の中でどれに一番近いか」の相対比較で決める。
  // 同じ向きの4種がすべて登録済みで、かつ2位と明確な差があるときだけ採用する
  // （未登録の種類があると、書いた記号のお手本が無いせいで別の種類に吸われるため）。
  let override: { symbol: ShapeKind; margin: number } | null = null
  if (openish !== null && store) {
    const family = openish ? OPEN_BRACKETS : CLOSE_BRACKETS
    if (family.every((k) => (store[k] ?? []).length > 0)) {
      const fam = family
        .map((k) => ({ symbol: k, score: uScore.get(k) ?? 0 }))
        .sort((a, b) => b.score - a.score)
      const margin = fam[0].score - fam[1].score
      if (fam[0].score > 0 && margin >= USER_MARGIN) {
        override = { symbol: fam[0].symbol, margin }
      }
    }
  }

  const kinds = new Set<ShapeKind>([
    ...(Object.keys(rules) as ShapeKind[]),
    ...pMatches.map((m) => m.symbol),
    ...Array.from(uScore.keys()),
  ])
  let ranked: SymbolCandidate[] = Array.from(kinds)
    .map((symbol) => {
      const r = rules[symbol]
      const p = Math.max(pScore.get(symbol) ?? 0, uScore.get(symbol) ?? 0)
      // 幾何特徴の裏付けがある候補を優先し、$P だけの候補は控えめに扱う
      const score = r !== undefined ? 0.65 * r + 0.35 * p : 0.5 * p
      return { symbol, score }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)

  if (override && ranked[0] && override.symbol !== ranked[0].symbol) {
    // 幾何特徴（円弧・2本線の当てはめ等）が強い確信で別の括弧を指しているときは、
    // お手本側により大きな差を要求する（当てはめの得意分野を弱い証拠で覆さない）
    const need =
      (rules[ranked[0].symbol as ShapeKind] ?? 0) >= 0.9 ? USER_MARGIN_VS_STRONG_RULE : USER_MARGIN
    if (override.margin >= need) {
      // 本人のお手本で明確に一番近い括弧を先頭へ。差が大きいほど確信を上げる
      // （差が小さいときは先頭には置くが、候補チップでの確認に回りやすくする）
      const top = ranked[0].score
      const own = ranked.find((c) => c.symbol === override!.symbol)?.score ?? 0
      const boosted = Math.max(own, top + Math.min(override.margin, 0.2))
      ranked = [
        { symbol: override.symbol, score: boosted },
        ...ranked.filter((c) => c.symbol !== override!.symbol),
      ].slice(0, 3)
    }
  }

  if (ranked.length === 0 || ranked[0].score < MIN_SCORE) {
    return { best: null, candidates: ranked, ambiguous: true }
  }
  const ambiguous = ranked.length > 1 && ranked[0].score - ranked[1].score < AMBIGUOUS_MARGIN
  return { best: ranked[0], candidates: ranked, ambiguous }
}
