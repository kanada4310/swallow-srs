/**
 * 初回お手本登録（義務化）の純ロジックと保存。
 *
 * ペン方式の画面を初めて使うとき、記号のお手本登録を必ず通す（2026-08-26 塾長指示）。
 * - 必須: 品詞・働きの文字（英字）と括弧4種の開き・閉じ（計8種）＝ 21種
 * - 任意（あとで登録でも可）: 下線・○囲み・波線＋?・ダッシュ・Ø
 * - 登録は利用者ごとに初回の1回だけ。完了の印は localStorage に利用者IDつきで持つ
 * - 途中でやめた場合は、登録済みの字はそのまま残り、次回は続きから再開する（実装者判断）
 */

import type { SymbolId } from './types'
import { POS_LETTERS, ROLE_LETTERS } from './types'
import type { UserTemplateStore } from './letters'

/** 括弧4種の開き・閉じ（計8種）。判別強化の相対比較はこの8種の登録がそろって効く */
export const BRACKET_SYMBOLS: SymbolId[] = [
  'paren-open',
  'paren-close',
  'square-open',
  'square-close',
  'angle-open',
  'angle-close',
  'brace-open',
  'brace-close',
]

/**
 * 必須のお手本（登録の順もこの並び）: 括弧8種 → 品詞の英字6種 → 働きの文字7種。
 * P・▷ は働きの側に並べる（模範分析集の実書き込みどおり。2026-08-26 塾長指示）。
 */
export const REQUIRED_SYMBOLS: SymbolId[] = [
  ...BRACKET_SYMBOLS,
  ...POS_LETTERS,
  ...ROLE_LETTERS,
]

/** 任意のお手本（あとで登録でも可）: 下線・○囲み・波線・?・ダッシュ・Ø */
export const OPTIONAL_SYMBOLS: SymbolId[] = [
  'hline',
  'circle',
  'wavy',
  'question',
  'tick',
  'null-sign',
]

/**
 * 記号ごとの必要本数。括弧は2本ずつ書いてもらう
 * （閉じ括弧の判別強化が「本人の字との相対比較」のため、2本あると安定する）。
 */
export function samplesFor(symbol: SymbolId): number {
  return (BRACKET_SYMBOLS as readonly string[]).includes(symbol) ? 2 : 1
}

/** まだ必要本数に達していない必須記号を、登録の順で返す */
export function missingRequired(store: UserTemplateStore | null): SymbolId[] {
  return REQUIRED_SYMBOLS.filter(
    (s) => ((store?.[s] ?? []).length ?? 0) < samplesFor(s),
  )
}

/** 必須のお手本がすべてそろっているか */
export function isEnrollmentComplete(store: UserTemplateStore | null): boolean {
  return missingRequired(store).length === 0
}

/* ---------- 完了の印（利用者ごと・端末内） ---------- */

const DONE_KEY_PREFIX = 'pen-syntax-onboarding-done-v1'

export function onboardingDoneKey(userId: string | null | undefined): string {
  return `${DONE_KEY_PREFIX}:${userId || 'anon'}`
}

export function loadOnboardingDone(userId: string | null | undefined): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(onboardingDoneKey(userId)) === '1'
  } catch {
    return false
  }
}

export function saveOnboardingDone(userId: string | null | undefined): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(onboardingDoneKey(userId), '1')
  } catch {
    // 保存できなくても致命ではない（次回また案内が出るだけ）
  }
}
