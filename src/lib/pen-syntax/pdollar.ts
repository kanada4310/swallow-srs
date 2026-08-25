/**
 * $P 点群認識（Vatavu, Anthony, Wobbrock 2012 の公知アルゴリズムの自前実装）。
 *
 * 複数画の文字・記号を「点の雲」として正規化し、お手本との距離で候補を出す。
 * 画数・書き順・画の向きに依存しないため、有限候補への当てはめ（群C）に向く。
 * 外部ライブラリ・外部サービスは使わない（追加費用0円の制約）。
 */

import type { PenPoint, PenStroke } from './types'
import { dist, pathLength } from './geometry'

export interface CloudPoint {
  x: number
  y: number
  /** 何画目の点か（画のまたぎでは補間しないための印） */
  id: number
}

export const CLOUD_N = 32

/** 複数画をまとめて弧長等間隔の n 点に打ち直す（画をまたぐ区間は補間しない） */
function resampleStrokes(strokes: PenStroke[], n: number): CloudPoint[] {
  const totalLen = strokes.reduce((s, st) => s + pathLength(st), 0)
  if (totalLen === 0) {
    const p = strokes.flat()[0] ?? { x: 0, y: 0 }
    return Array.from({ length: n }, (_, i) => ({ x: p.x, y: p.y, id: i }))
  }
  const interval = totalLen / (n - 1)
  const out: CloudPoint[] = []
  let acc = 0
  strokes.forEach((stroke, id) => {
    if (stroke.length === 0) return
    if (out.length === 0) out.push({ x: stroke[0].x, y: stroke[0].y, id })
    const pts = stroke.map((p) => ({ ...p }))
    for (let i = 1; i < pts.length; i++) {
      const d = dist(pts[i - 1], pts[i])
      if (d === 0) continue
      if (acc + d >= interval) {
        const t = (interval - acc) / d
        const q = {
          x: pts[i - 1].x + t * (pts[i].x - pts[i - 1].x),
          y: pts[i - 1].y + t * (pts[i].y - pts[i - 1].y),
        }
        out.push({ ...q, id })
        pts.splice(i, 0, q)
        acc = 0
      } else {
        acc += d
      }
    }
  })
  while (out.length < n) {
    const last = out[out.length - 1] ?? { x: 0, y: 0, id: 0 }
    out.push({ ...last })
  }
  return out.slice(0, n)
}

/** 大きさを揃え（縦横比は保つ）、重心を原点に置く */
function normalizeCloud(cloud: CloudPoint[]): CloudPoint[] {
  let left = Infinity
  let right = -Infinity
  let top = Infinity
  let bottom = -Infinity
  for (const p of cloud) {
    left = Math.min(left, p.x)
    right = Math.max(right, p.x)
    top = Math.min(top, p.y)
    bottom = Math.max(bottom, p.y)
  }
  const size = Math.max(right - left, bottom - top) || 1
  const scaled = cloud.map((p) => ({ x: p.x / size, y: p.y / size, id: p.id }))
  const cx = scaled.reduce((s, p) => s + p.x, 0) / scaled.length
  const cy = scaled.reduce((s, p) => s + p.y, 0) / scaled.length
  return scaled.map((p) => ({ x: p.x - cx, y: p.y - cy, id: p.id }))
}

/** 複数画 → 正規化済み点群 */
export function toCloud(strokes: PenStroke[], n = CLOUD_N): CloudPoint[] {
  return normalizeCloud(resampleStrokes(strokes, n))
}

function cloudDistanceOneWay(a: CloudPoint[], b: CloudPoint[], start: number): number {
  const n = a.length
  const matched = new Array<boolean>(n).fill(false)
  let sum = 0
  let i = start
  do {
    let index = -1
    let min = Infinity
    for (let j = 0; j < n; j++) {
      if (matched[j]) continue
      const d = Math.hypot(a[i].x - b[j].x, a[i].y - b[j].y)
      if (d < min) {
        min = d
        index = j
      }
    }
    matched[index] = true
    const weight = 1 - ((i - start + n) % n) / n
    sum += weight * min
    i = (i + 1) % n
  } while (i !== start)
  return sum
}

/** 2つの点群の距離（小さいほど似ている）。両方向の貪欲マッチの最小値 */
export function cloudDistance(a: CloudPoint[], b: CloudPoint[]): number {
  const n = a.length
  const step = Math.max(1, Math.floor(Math.pow(n, 0.5)))
  let min = Infinity
  for (let start = 0; start < n; start += step) {
    min = Math.min(min, cloudDistanceOneWay(a, b, start), cloudDistanceOneWay(b, a, start))
  }
  return min
}

export interface CloudTemplate<T extends string = string> {
  symbol: T
  cloud: CloudPoint[]
}

export function makeTemplate<T extends string>(symbol: T, strokes: PenStroke[]): CloudTemplate<T> {
  return { symbol, cloud: toCloud(strokes) }
}

export interface CloudMatch<T extends string = string> {
  symbol: T
  /** 点群距離（小さいほど近い） */
  distance: number
  /** 0〜1 に丸めた確信度 */
  score: number
}

/** 入力をお手本一覧と照合し、記号ごとの最良距離を近い順に返す */
export function matchClouds<T extends string>(
  strokes: PenStroke[],
  templates: Array<CloudTemplate<T>>,
): Array<CloudMatch<T>> {
  const input = toCloud(strokes)
  const best = new Map<T, number>()
  for (const tpl of templates) {
    const d = cloudDistance(input, tpl.cloud)
    const cur = best.get(tpl.symbol)
    if (cur === undefined || d < cur) best.set(tpl.symbol, d)
  }
  return Array.from(best.entries())
    .map(([symbol, distance]) => ({
      symbol,
      distance,
      score: Math.max(0, 1 - distance / 4),
    }))
    .sort((a, b) => a.distance - b.distance)
}
