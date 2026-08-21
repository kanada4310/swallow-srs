/**
 * 構文AI試行の費用計算（純ロジック）。
 *
 * 単価は Anthropic 公式料金表（2026-06時点・claude-api スキルで確認）。
 * キャッシュ書込は1時間TTL（=入力単価の2倍）、読取は入力単価の1割。
 * 円換算は既定 1ドル150円（環境変数 SYNTAX_AI_USD_JPY で変更可・サーバ側で渡す）。
 *
 * 未知のモデルIDには一覧中で最も高い Sonnet 系の単価を当てる（安い方へ誤らない）。
 */

export interface TokenUsage {
  input: number
  output: number
  cacheWrite: number
  cacheRead: number
}

interface ModelPrice {
  /** USD / 100万トークン */
  input: number
  output: number
  cacheWrite1h: number
  cacheRead: number
}

export const MODEL_PRICES: Record<string, ModelPrice> = {
  'claude-sonnet-4-6': { input: 3, output: 15, cacheWrite1h: 6, cacheRead: 0.3 },
  'claude-sonnet-5': { input: 3, output: 15, cacheWrite1h: 6, cacheRead: 0.3 },
  'claude-haiku-4-5': { input: 1, output: 5, cacheWrite1h: 2, cacheRead: 0.1 },
}

/**
 * 講師画面のモデル選択肢。
 * 3つとも 2026-08-21 に実際に呼んで使えることを確認済み。
 * 中位2つは同じ単価（sonnet-5 は 2026-08-31 まで割引中だが、計算は割引前で見積もる＝安全側）。
 */
export const MODEL_OPTIONS: Array<{ id: string; label: string }> = [
  { id: 'claude-sonnet-5', label: '中位 claude-sonnet-5（新世代・推奨）' },
  { id: 'claude-sonnet-4-6', label: '中位 claude-sonnet-4-6（現在の設定値・同単価）' },
  { id: 'claude-haiku-4-5', label: '下位 claude-haiku-4-5（費用約1/3・精度比較用）' },
]

export const DEFAULT_MODEL = 'claude-sonnet-4-6'
export const DEFAULT_USD_JPY = 150

const FALLBACK_PRICE = MODEL_PRICES['claude-sonnet-4-6']

/**
 * 採点基準（ルールブック全文）の分量。実測 41,596 トークン（2026-08-21）。
 * 先取り計上の見積もりに使うので、安全側（多め）に丸める。
 */
export const RULEBOOK_APPROX_TOKENS = 45_000

/**
 * AIを呼ぶ「前」に上限へ積んでおく額（円）。
 *
 * 呼んだあとに記録が書けないと使用額が過少になり上限が効かなくなるため、
 * 先に最悪値を積んでから呼び、成功したら実測値に置き換える（過大計上の側に倒す）。
 * 最悪値＝その時間の最初の1回（ルールブックをキャッシュに書く）＋出力を上限まで使った場合。
 */
export function reserveCostYen(
  model: string,
  maxTokens: number,
  usdJpy: number = DEFAULT_USD_JPY
): number {
  return estimateCostYen(
    model,
    { input: 3_000, output: maxTokens, cacheWrite: RULEBOOK_APPROX_TOKENS, cacheRead: 0 },
    usdJpy
  )
}

/**
 * 呼び出しが失敗したときに残す額（円）。
 * 課金されたかどうかは判定できないため、0 にはせず控えめな実費相当を残す
 * （失敗を繰り返しても上限に近づく＝止まる側に倒すため）。
 */
export function failedCallYen(model: string, usdJpy: number = DEFAULT_USD_JPY): number {
  return estimateCostYen(
    model,
    { input: 1_000, output: 100, cacheWrite: 0, cacheRead: RULEBOOK_APPROX_TOKENS },
    usdJpy
  )
}

/** 1回のAPI呼び出しの概算費用（円）。小数第4位まで保持する */
export function estimateCostYen(
  model: string,
  usage: TokenUsage,
  usdJpy: number = DEFAULT_USD_JPY
): number {
  const p = MODEL_PRICES[model] ?? FALLBACK_PRICE
  const usd =
    (usage.input * p.input +
      usage.output * p.output +
      usage.cacheWrite * p.cacheWrite1h +
      usage.cacheRead * p.cacheRead) /
    1_000_000
  return Math.round(usd * usdJpy * 10_000) / 10_000
}
