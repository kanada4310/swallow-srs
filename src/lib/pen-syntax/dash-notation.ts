/**
 * 節・句の深さの自動判定と、ダッシュ表記（S′ ″ ‴）との相互変換
 * （記号の台帳・確定版 2026-08-26）。
 *
 * 生徒はダッシュを書かない。働きは S・V・O・C だけを書き、何段目の節・句の中かは
 * **囲んだ括弧から自動で判定**して、画面では色（入れ子括弧と同じ色）＋控えめな
 * 深さの印で示す。印刷・書き出し・模範分析集（第7講データ）との照合では、
 * ここの変換でダッシュ表記に自動変換する（深さの情報は相互変換できる＝採点同値）。
 */

import type { StudentSpan } from '@/lib/reading/syntax'

/**
 * 単語を囲んでいる括弧（下線 ul 以外のまとまり）の数＝その単語の深さ。
 * 0 = どの括弧にも入っていない（文の主節の要素）。
 */
export function depthOfToken(spans: StudentSpan[], index: number): number {
  return spans.filter((s) => s.type !== 'ul' && index >= s.from && index <= s.to).length
}

/** 深さ 1・2・3 は ′ ″ ‴（模範分析集の表記）。4以上は ′ を深さのぶん繰り返す */
export function dashesForDepth(depth: number): string {
  if (depth <= 0) return ''
  if (depth === 1) return '′'
  if (depth === 2) return '″'
  if (depth === 3) return '‴'
  return '′'.repeat(depth)
}

/** 働き＋深さ → ダッシュ表記（印刷・書き出し・照合用）。例: ('S', 2) → 'S″' */
export function roleWithDepth(role: string, depth: number): string {
  return role + dashesForDepth(depth)
}

/** ダッシュとして許容する文字（転記データの表記ゆれも受ける） */
const DASH_CHARS: Record<string, number> = {
  '′': 1, // U+2032 prime
  '″': 2, // U+2033 double prime
  '‴': 3, // U+2034 triple prime
  "'": 1, // ASCII アポストロフィ
  '’': 1, // 右シングル引用符
  '`': 1,
}

/** ダッシュ表記を分解する。例: 'S″' → { role: 'S', depth: 2 } / 'C' → { role: 'C', depth: 0 } */
export function parseDashedRole(text: string): { role: string; depth: number } {
  let role = text
  let depth = 0
  while (role.length > 0) {
    const last = role[role.length - 1]
    const d = DASH_CHARS[last]
    if (d === undefined) break
    depth += d
    role = role.slice(0, -1)
  }
  return { role, depth }
}

/** 採点同値: ダッシュ（深さの印）を除いて働きが同じか。例: 'S′' ≡ 'S' */
export function rolesEquivalent(a: string | null, b: string | null): boolean {
  if (a == null || b == null) return a === b
  return parseDashedRole(a).role === parseDashedRole(b).role
}
