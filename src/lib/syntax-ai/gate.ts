/**
 * 構文AI試行の受付判定（純ロジック）。
 *
 * 試行の枠（ADR syntax-ai-trial の「安全の線」）をここで機械的に判定する:
 *   有効フラグ → 許可生徒の一覧 → 試行期間 → 月の上限額
 * サーバのAPIは毎回この判定を通し、通らなければ外部のAIを呼ばない。
 * 画面の入口（ボタン表示）も同じ判定結果を status API 経由で参照する。
 */

export interface SyntaxAiConfig {
  enabled: boolean
  allowedUserIds: string[]
  startsAt: string | null
  endsAt: string | null
  monthlyCapYen: number
  model: string
}

export type GateDenyReason =
  | 'disabled'
  | 'not-allowed'
  | 'before-start'
  | 'ended'
  | 'cap-reached'

export interface GateResult {
  allowed: boolean
  reason: GateDenyReason | null
  /** 今月の使用額（円）と上限。見える化のためそのまま返す */
  spentYen: number
  capYen: number
}

/** 許可生徒はこの人数まで（試行の枠: 2〜3人） */
export const MAX_ALLOWED_STUDENTS = 3

export const GATE_DENY_LABEL: Record<GateDenyReason, string> = {
  disabled: 'AI判定は現在停止中です',
  'not-allowed': 'AI判定は試行中のため、対象の生徒だけが使えます',
  'before-start': '試行はまだ開始されていません',
  ended: '試行期間が終了しました',
  'cap-reached': '今月の利用上限に達したため、AI判定はお休み中です',
}

/** 日本時間の暦月の始まり（UTCのISO文字列で返す）。月上限の集計区間に使う */
export function jstMonthStartIso(now: Date): string {
  const jst = new Date(now.getTime() + 9 * 3600_000)
  const start = Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), 1) - 9 * 3600_000
  return new Date(start).toISOString()
}

export function evaluateGate(
  config: SyntaxAiConfig,
  userId: string,
  spentYen: number,
  now: Date = new Date()
): GateResult {
  const base = { spentYen, capYen: config.monthlyCapYen }
  if (!config.enabled) return { allowed: false, reason: 'disabled', ...base }
  if (!config.allowedUserIds.includes(userId)) {
    return { allowed: false, reason: 'not-allowed', ...base }
  }
  if (config.startsAt && now.getTime() < new Date(config.startsAt).getTime()) {
    return { allowed: false, reason: 'before-start', ...base }
  }
  if (config.endsAt && now.getTime() >= new Date(config.endsAt).getTime()) {
    return { allowed: false, reason: 'ended', ...base }
  }
  if (spentYen >= config.monthlyCapYen) {
    return { allowed: false, reason: 'cap-reached', ...base }
  }
  return { allowed: true, reason: null, ...base }
}
