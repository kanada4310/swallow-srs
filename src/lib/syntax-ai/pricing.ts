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

/** 講師画面のモデル選択肢（既定は中位） */
export const MODEL_OPTIONS: Array<{ id: string; label: string }> = [
  { id: 'claude-sonnet-4-6', label: '中位 claude-sonnet-4-6（既定・推奨）' },
  { id: 'claude-haiku-4-5', label: '下位 claude-haiku-4-5（費用約1/3・精度比較用）' },
  { id: 'claude-sonnet-5', label: '中位 claude-sonnet-5（新世代・同単価）' },
]

export const DEFAULT_MODEL = 'claude-sonnet-4-6'
export const DEFAULT_USD_JPY = 150

const FALLBACK_PRICE = MODEL_PRICES['claude-sonnet-4-6']

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
