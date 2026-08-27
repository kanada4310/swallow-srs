/**
 * お手本登録（本人の字を localStorage に保存して照合に使う）。
 * 認識に迷う文字・記号だけ登録すればよい。ブラウザ内で完結（外部送信なし）。
 *
 * 保存は**利用者ごと**（2026-08-27）。以前は端末ごとの固定の鍵1本だったため、
 * 同じ端末を別のアカウントで使うと、先に誰かが登録した字が「本人の登録済み」と
 * 誤判定され、本人は一度も登録を促されないまま他人の筆跡で判別されていた。
 * 旧い鍵（利用者なし）のデータは**誰の字か分からないので読み込まない**
 * （他人の字を引き継がない＝迷ったら登録し直してもらう側に倒す）。
 */

import type { PenStroke } from './types'
import type { UserTemplateStore } from './letters'

const KEY_PREFIX = 'pen-syntax-user-templates-v1'
const MAX_PER_SYMBOL = 3

/** 保存の鍵（利用者ごと）。完了の印と同じ単位にそろえてある */
export function userTemplatesKey(userId: string | null | undefined): string {
  return `${KEY_PREFIX}:${userId || 'anon'}`
}

export function loadUserTemplates(userId: string | null | undefined): UserTemplateStore {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(userTemplatesKey(userId))
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? (parsed as UserTemplateStore) : {}
  } catch {
    return {}
  }
}

export function saveUserTemplate(
  userId: string | null | undefined,
  symbol: string,
  strokes: PenStroke[],
): UserTemplateStore {
  const store = loadUserTemplates(userId)
  const compact = strokes.map((s) => s.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })))
  const list = [...(store[symbol] ?? []), compact].slice(-MAX_PER_SYMBOL)
  const next = { ...store, [symbol]: list }
  try {
    window.localStorage.setItem(userTemplatesKey(userId), JSON.stringify(next))
  } catch {
    // 保存できなくても動作は続ける（内蔵お手本だけで判別する）
  }
  return next
}

export function clearUserTemplates(
  userId: string | null | undefined,
  symbol?: string,
): UserTemplateStore {
  const store = loadUserTemplates(userId)
  const next = { ...store }
  if (symbol) delete next[symbol]
  try {
    if (symbol) window.localStorage.setItem(userTemplatesKey(userId), JSON.stringify(next))
    else window.localStorage.removeItem(userTemplatesKey(userId))
  } catch {
    // 何もしない
  }
  return symbol ? next : {}
}
