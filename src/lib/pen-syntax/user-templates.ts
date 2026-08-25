/**
 * お手本登録（本人の字を localStorage に保存して照合に使う）。
 * 認識に迷う文字・記号だけ登録すればよい。ブラウザ内で完結（外部送信なし）。
 */

import type { PenStroke } from './types'
import type { UserTemplateStore } from './letters'

const KEY = 'pen-syntax-user-templates-v1'
const MAX_PER_SYMBOL = 3

export function loadUserTemplates(): UserTemplateStore {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? (parsed as UserTemplateStore) : {}
  } catch {
    return {}
  }
}

export function saveUserTemplate(symbol: string, strokes: PenStroke[]): UserTemplateStore {
  const store = loadUserTemplates()
  const compact = strokes.map((s) => s.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })))
  const list = [...(store[symbol] ?? []), compact].slice(-MAX_PER_SYMBOL)
  const next = { ...store, [symbol]: list }
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // 保存できなくても動作は続ける（内蔵お手本だけで判別する）
  }
  return next
}

export function clearUserTemplates(symbol?: string): UserTemplateStore {
  const store = loadUserTemplates()
  const next = { ...store }
  if (symbol) delete next[symbol]
  try {
    if (symbol) window.localStorage.setItem(KEY, JSON.stringify(next))
    else window.localStorage.removeItem(KEY)
  } catch {
    // 何もしない
  }
  return symbol ? next : {}
}
