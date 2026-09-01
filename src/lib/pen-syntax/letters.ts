/**
 * 文字（群C）の判別＝有限候補への当てはめ。
 *
 * 自由な手書き文字認識ではなく、書かれた行（上=品詞・下=働き）で候補を絞ったうえで
 * $P 点群照合により最も近い候補を選ぶ（構想 v1.2 確定の設計）。
 * 内蔵お手本に加えて、本人の字を「お手本登録」した分（userTemplates）と、
 * 実書き蓄積（塾の共通お手本集＋本人の蓄積）も同じ形（UserTemplateStore）で照合対象にする。
 *
 * 2026-09-01（項目2・似た記号の見分け強化）: 働きの文字に**幾何特徴の裏付け**を追加した。
 * $P 点群照合は輪郭の全体で比べるため、S（くねった1画）が ▷ や C と紛れやすい。
 * 「違いの出る部分」（S=前半と後半で膨らみの向きが逆 / ▷=閉じて角がある /
 * C=閉じずに片側だけ膨らむ / V=底で1回折れる / ＋=直線2本が交差）を直接見て、
 * 点群照合の点数に上乗せする。旗 tuning.roleGeometry で切れる（前後比較用）。
 */

import type {
  Lane,
  PenStroke,
  PosLetter,
  RecognitionResult,
  RoleLetter,
  SymbolCandidate,
} from './types'
import { POS_LETTERS, ROLE_LETTERS } from './types'
import { type CloudTemplate, makeTemplate, matchClouds } from './pdollar'
import { POS_TEMPLATES, ROLE_TEMPLATES } from './templates'
import { DEFAULT_TUNING, type RecognizerTuning } from './tuning'
import {
  bbox,
  bulgeSide,
  chordAngleDeg,
  closedness,
  countCorners,
  maxTurnPoint,
  resample,
  smooth,
  straightness,
  turnAngles,
} from './geometry'

export const LETTER_AMBIGUOUS_MARGIN = DEFAULT_TUNING.marginLetter
export const LETTER_MIN_SCORE = DEFAULT_TUNING.minScoreLetter

/** お手本登録の保存形式（localStorage に置く。座標は正規化前の生データでよい） */
export type UserTemplateStore = Partial<Record<string, PenStroke[][]>>

export function userTemplatesFor(store: UserTemplateStore | null, symbols: readonly string[]): CloudTemplate[] {
  if (!store) return []
  const out: CloudTemplate[] = []
  for (const sym of symbols) {
    for (const strokes of store[sym] ?? []) {
      if (strokes.length > 0) out.push(makeTemplate(sym, strokes))
    }
  }
  return out
}

/* ---------- 働きの文字の幾何特徴（項目2・違いの出る部分を直接見る） ---------- */

function median(xs: number[]): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

/**
 * 働きの文字の幾何特徴による裏付け点（0〜1）。確信のあるものだけ返す。
 * $P の点数に上乗せする形で使う（単独では確定させない）。
 */
export function roleRuleScores(strokes: PenStroke[]): Partial<Record<RoleLetter, number>> {
  const scores: Partial<Record<RoleLetter, number>> = {}
  const put = (k: RoleLetter, v: number) => {
    scores[k] = Math.max(scores[k] ?? 0, v)
  }

  if (strokes.length === 1) {
    const s = smooth(resample(strokes[0], 48), 2)
    if (s.length < 8) return scores
    const b = bbox(s)
    const size = Math.max(b.width, b.height)
    if (size < 6) return scores
    const closed = closedness(s)
    const straight = straightness(s)
    const corners = countCorners(s)

    // S: 前半と後半で膨らみの向きが逆（S字カーブ）。閉じていない・十分曲がっている
    if (closed > 0.3 && straight < 0.8 && b.height > b.width * 0.7) {
      const half = Math.floor(s.length / 2)
      const b1 = bulgeSide(s.slice(0, half + 1))
      const b2 = bulgeSide(s.slice(half))
      const minSwing = size * 0.05
      if (b1 * b2 < 0 && Math.abs(b1) > minSwing && Math.abs(b2) > minSwing) put('S', 0.9)
    }

    // 閉じた線: なめらかなら O、角が2つ以上なら ▷
    if (closed < 0.32 && size > 8) {
      const medTurn = median(turnAngles(s))
      if (medTurn < 25 && corners >= 2) put('▷', 0.85)
      else if (corners <= 1) put('O', 0.85)
    }

    // C: 閉じずに片側だけ膨らむ弧。始点・終点が右側（右に開く）
    if (closed >= 0.35 && straight < 0.85 && corners <= 1) {
      const half = Math.floor(s.length / 2)
      const b1 = bulgeSide(s.slice(0, half + 1))
      const b2 = bulgeSide(s.slice(half))
      const sameSide = b1 * b2 > 0 || Math.abs(b1) < size * 0.03 || Math.abs(b2) < size * 0.03
      const endsRight = s[0].x > b.cx && s[s.length - 1].x > b.cx
      if (sameSide && endsRight) put('C', 0.85)
    }

    // V: 底で1回だけ折れ、始点・終点が上側
    if (closed > 0.4 && corners === 1) {
      const apex = maxTurnPoint(strokes[0])
      const startTop = s[0].y < b.cy
      const endTop = s[s.length - 1].y < b.cy
      if (apex.y > b.cy && startTop && endTop) put('V', 0.9)
    }
    return scores
  }

  if (strokes.length === 2) {
    // ＋: まっすぐな横棒と縦棒が交差する
    const a = smooth(resample(strokes[0], 24))
    const c = smooth(resample(strokes[1], 24))
    if (straightness(a) > 0.85 && straightness(c) > 0.85) {
      const angA = Math.abs(chordAngleDeg(a))
      const angC = Math.abs(chordAngleDeg(c))
      const horiz = (x: number) => x < 35 || x > 145
      const vert = (x: number) => x >= 55 && x <= 125
      const ba = bbox(a)
      const bc = bbox(c)
      const overlap =
        Math.min(ba.right, bc.right) >= Math.max(ba.left, bc.left) - 2 &&
        Math.min(ba.bottom, bc.bottom) >= Math.max(ba.top, bc.top) - 2
      if (overlap && ((horiz(angA) && vert(angC)) || (vert(angA) && horiz(angC)))) put('＋', 0.9)
    }
  }

  if (strokes.length >= 2 && strokes.length <= 4) {
    // Po: P の下に小さな丸（o）が付く。「小さな閉じた画が右下にある」ことが違いの出る部分
    const all = strokes.flat()
    const ab = bbox(all)
    const smoothed = strokes.map((st) => smooth(resample(st, 24)))
    const sizes = smoothed.map((st) => {
      const sb = bbox(st)
      return Math.max(sb.width, sb.height)
    })
    const maxSize = Math.max(...sizes)
    const oIdx = smoothed.findIndex((st, i) => {
      if (sizes[i] > maxSize * 0.6) return false
      if (closedness(st) >= 0.45) return false
      const sb = bbox(st)
      // 全体の下半分（P の縦棒の足もと）にある小さな丸
      return sb.cy > ab.cy
    })
    if (oIdx >= 0 && strokes.length >= 3) put('Po', 0.85)
    // P: 縦棒＋上半分のふくらみで、右下の小さな丸が無い
    if (oIdx < 0 && strokes.length === 2) {
      const stemIdx = smoothed.findIndex((st) => {
        const sb = bbox(st)
        return sb.height > sb.width * 2 && straightness(st) > 0.8
      })
      if (stemIdx >= 0) {
        const other = smoothed[1 - stemIdx]
        const ob = bbox(other)
        if (ob.cy < ab.cy) put('P', 0.75)
      }
    }
  }

  return scores
}

/* ---------- 判別の入口 ---------- */

/**
 * 品詞の文字の幾何特徴（項目2）。a と ad は輪郭が似るが**画数と横幅**が違う:
 * a=1〜2画・縦長 / ad=3〜4画・横長（a＋背の高い d） / aux=5画以上。
 */
export function posRuleScores(strokes: PenStroke[]): Partial<Record<PosLetter, number>> {
  const scores: Partial<Record<PosLetter, number>> = {}
  const all = strokes.flat()
  if (all.length === 0) return scores
  const b = bbox(all)
  if (strokes.length >= 5) scores.aux = 0.85
  else if (strokes.length >= 3 && b.width > b.height * 0.9) scores.ad = 0.8
  else if (strokes.length <= 2 && b.width < b.height * 1.1) {
    // 縦長の1〜2画は a / n / v の側（ad・aux ではない）。個別の字は $P に任せる
  }
  return scores
}

/** 品詞（上の行）の文字判別 */
export function classifyPosLetter(
  strokes: PenStroke[],
  store: UserTemplateStore | null = null,
  tuning: RecognizerTuning = DEFAULT_TUNING,
): RecognitionResult {
  const templates = [...POS_TEMPLATES, ...(userTemplatesFor(store, POS_LETTERS) as Array<CloudTemplate<PosLetter>>)]
  const matches = matchClouds(strokes, templates)
  if (!tuning.roleGeometry) return toResult(matches, tuning)
  const rules = posRuleScores(strokes)
  const merged = matches
    .map((m) => {
      const r = rules[m.symbol as PosLetter]
      return { symbol: m.symbol, score: r !== undefined ? Math.min(0.98, m.score + 0.3 * r) : m.score }
    })
    .sort((a, b) => b.score - a.score)
  return toResult(merged, tuning)
}

/** 働き（下の行）の文字判別 */
export function classifyRoleLetter(
  strokes: PenStroke[],
  store: UserTemplateStore | null = null,
  tuning: RecognizerTuning = DEFAULT_TUNING,
): RecognitionResult {
  const templates = [...ROLE_TEMPLATES, ...(userTemplatesFor(store, ROLE_LETTERS) as Array<CloudTemplate<RoleLetter>>)]
  const matches = matchClouds(strokes, templates)
  if (!tuning.roleGeometry) return toResult(matches, tuning)
  // 幾何特徴の裏付けがある候補に上乗せする（$P の順位を「違いの出る部分」で正す）
  const rules = roleRuleScores(strokes)
  const merged = matches
    .map((m) => {
      const r = rules[m.symbol]
      return { symbol: m.symbol, score: r !== undefined ? Math.min(0.98, m.score + 0.3 * r) : m.score }
    })
    .sort((a, b) => b.score - a.score)
  return toResult(merged, tuning)
}

export function classifyLetter(
  strokes: PenStroke[],
  lane: Lane,
  store: UserTemplateStore | null = null,
  tuning: RecognizerTuning = DEFAULT_TUNING,
): RecognitionResult {
  return lane === 'above'
    ? classifyPosLetter(strokes, store, tuning)
    : classifyRoleLetter(strokes, store, tuning)
}

function toResult(
  matches: Array<{ symbol: string; score: number }>,
  tuning: RecognizerTuning,
): RecognitionResult {
  const ranked = matches.slice(0, 3) as SymbolCandidate[]
  if (ranked.length === 0 || ranked[0].score < tuning.minScoreLetter) {
    return { best: null, candidates: ranked, ambiguous: true }
  }
  const ambiguous =
    (ranked.length > 1 && ranked[0].score - ranked[1].score < tuning.marginLetter) ||
    // 取り違えゼロ側の安全弁: 確信が下限未満なら、差が開いていても自動確定させない
    ranked[0].score < tuning.confirmMinLetter
  return { best: ranked[0], candidates: ranked, ambiguous }
}

// 働き・品詞の文字は塾長の実書き込みの表記のまま解答値として保存する
// （Po・▷・P を「前O」「接」「M」などに言い換えない。2026-08-26 塾長指示）。
// 品詞の英字は採点側 gradeSyntax が漢字名の正解表と同値として照合する。
