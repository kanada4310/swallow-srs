/**
 * 実書き蓄積の純ロジック（2026-09-01・文字認識検討会の確定内容 v1）。
 *
 * - 入力の検査: 蓄積してよい記号か・線の形が正しいか（サイズ上限つき）
 * - 圧縮: 保存前に点を等間隔に間引き・座標を丸め・時刻を捨てる（容量と個人情報対策）
 * - 間引き: 似た線は足さない・1記号の上限を超えたら古いものから消す
 *   （無限に増やすと照合が遅くなる。上限は「数十件程度」＝検討会の合意）
 * - 合成: 共通お手本集＋本人の蓄積＋端末内のお手本を1つの照合対象にまとめる
 *
 * データベースの表は supabase/migrations/027_pen_stroke_samples.sql。
 * 読み書きの入口は /api/pen-samples（route.ts）。ここは純関数だけ（テスト対象）。
 */

import type { PenPoint, PenStroke, SymbolId } from './types'
import { POS_LETTERS, ROLE_LETTERS } from './types'
import { BRACKET_SYMBOLS } from './ledger'
import type { UserTemplateStore } from './letters'
import { distToSegment, resample } from './geometry'
import { cloudDistance, toCloud } from './pdollar'

/** 本人の蓄積の1記号あたりの上限（超えたら古いものから消す） */
export const PERSONAL_CAP = 16
/** 共通お手本集の1記号あたりの上限 */
export const SHARED_CAP = 24
/** これより近い線は「同じ書き方」とみなして足さない（点群距離。0=同一） */
export const DEDUP_DISTANCE = 0.14

/** 1線の保存点数の上限 */
const MAX_POINTS_PER_STROKE = 48
const MAX_STROKES = 12
const MAX_COORD = 20000

/**
 * 折れ線の形を保ったまま点を間引く（Douglas-Peucker 方式・繰り返し実装）。
 *
 * ※ 等間隔の打ち直し（resample）で間引くと、点群照合が「同じ形なのに
 *   標本の位相がずれた」ぶんの距離（実測で0.2〜0.3）を余計に数えてしまう。
 *   照合の距離は32点の**合計**なので、この下駄は候補の差（0.12）と同程度になり
 *   蓄積したお手本の効きを鈍らせる。形そのものを保つ間引きなら距離はほぼ0。
 */
function rdp(points: PenPoint[], eps: number): PenPoint[] {
  if (points.length <= 2) return points.slice()
  const keep = new Array<boolean>(points.length).fill(false)
  keep[0] = true
  keep[points.length - 1] = true
  const stack: Array<[number, number]> = [[0, points.length - 1]]
  while (stack.length > 0) {
    const [a, b] = stack.pop()!
    let maxD = 0
    let maxI = -1
    for (let i = a + 1; i < b; i++) {
      const d = distToSegment(points[i], points[a], points[b])
      if (d > maxD) {
        maxD = d
        maxI = i
      }
    }
    if (maxI >= 0 && maxD > eps) {
      keep[maxI] = true
      stack.push([a, maxI], [maxI, b])
    }
  }
  return points.filter((_, i) => keep[i])
}

/** 形を保ったまま maxPoints 以下へ間引く（許容誤差を段階的に上げる） */
export function simplifyStroke(points: PenPoint[], maxPoints = MAX_POINTS_PER_STROKE): PenPoint[] {
  if (points.length <= maxPoints) return points.slice()
  let eps = 0.4
  let out = rdp(points, eps)
  while (out.length > maxPoints && eps < 64) {
    eps *= 1.7
    out = rdp(points, eps)
  }
  return out.length > maxPoints ? resample(out, maxPoints) : out
}

/** 蓄積してよい記号（台帳の実書き対象＝括弧8種・下線・波線・品詞・働き・▷） */
export const ACCUMULATABLE_SYMBOLS: readonly SymbolId[] = [
  ...BRACKET_SYMBOLS,
  'hline',
  'wavy',
  'triangle',
  ...POS_LETTERS,
  ...ROLE_LETTERS,
]

export function isAccumulatable(symbol: string): symbol is SymbolId {
  return (ACCUMULATABLE_SYMBOLS as readonly string[]).includes(symbol)
}

export type SampleSource = 'confirmed' | 'chip' | 'enrolled'

export function isSampleSource(x: unknown): x is SampleSource {
  return x === 'confirmed' || x === 'chip' || x === 'enrolled'
}

/**
 * 線の検査と圧縮。不正な形（数値でない・大きすぎる・空）は null。
 * 保存前に点を等間隔に間引き（1線 最大32点）・座標を0.1px単位へ丸め・時刻を捨てる。
 */
export function sanitizeSampleStrokes(strokes: unknown): PenStroke[] | null {
  if (!Array.isArray(strokes) || strokes.length === 0 || strokes.length > MAX_STROKES) return null
  const out: PenStroke[] = []
  for (const stroke of strokes) {
    if (!Array.isArray(stroke) || stroke.length === 0 || stroke.length > 5000) return null
    const pts: PenStroke = []
    for (const p of stroke) {
      if (typeof p !== 'object' || p === null) return null
      const { x, y } = p as { x: unknown; y: unknown }
      if (typeof x !== 'number' || typeof y !== 'number') return null
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null
      if (Math.abs(x) > MAX_COORD || Math.abs(y) > MAX_COORD) return null
      pts.push({ x, y })
    }
    const compact = simplifyStroke(pts)
    out.push(compact.map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 })))
  }
  return out
}

/** 追加の可否と、上限超過ぶんの削除数（古い順に消す）を決める */
export function planAddition(
  existing: PenStroke[][],
  incoming: PenStroke[],
  cap: number,
): { action: 'skip' } | { action: 'add'; removeOldest: number } {
  const cloud = toCloud(incoming)
  for (const e of existing) {
    if (e.length === 0) continue
    if (cloudDistance(cloud, toCloud(e)) < DEDUP_DISTANCE) return { action: 'skip' }
  }
  return { action: 'add', removeOldest: Math.max(0, existing.length + 1 - cap) }
}

/** 複数の蓄積（共通・本人・端末内）を1つの照合対象へまとめる */
export function mergeStores(...stores: Array<UserTemplateStore | null | undefined>): UserTemplateStore {
  const out: UserTemplateStore = {}
  for (const store of stores) {
    if (!store) continue
    for (const symbol of Object.keys(store)) {
      const list = store[symbol]
      if (!list || list.length === 0) continue
      out[symbol] = [...(out[symbol] ?? []), ...list]
    }
  }
  return out
}

/** DBの行（symbol, strokes の並び）を UserTemplateStore の形へ */
export function rowsToStore(rows: Array<{ symbol: string; strokes: unknown }>): UserTemplateStore {
  const out: UserTemplateStore = {}
  for (const row of rows) {
    if (!isAccumulatable(row.symbol)) continue
    const strokes = sanitizeSampleStrokes(row.strokes)
    if (!strokes) continue
    out[row.symbol] = [...(out[row.symbol] ?? []), strokes]
  }
  return out
}
