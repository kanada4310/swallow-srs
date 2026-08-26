/**
 * 分析の順序の記録（2026-08-26・指示書 2026-08-26-srs-pen-order-hints）。
 *
 * 塾長の考え「構文分析は最終的な解答が合っていればよいものではなく、
 * その時点で特定できるものをどんどん特定して不明瞭な部分を固める——順序も大切な作業」
 * に基づき、確定した分析に「どの記号をどの順で書いたか」の並びを付帯情報として持つ。
 *
 * - 並びは筆画の時刻（PenPoint.t＝入力イベントの時刻）から導出する
 * - 解答データ（SyntaxAnswer）・採点データの形式は変えない（この記録は別の入れ物）
 * - 講師が書いた並びは「模範の順序」としてこの端末（localStorage）に保存できる
 *   （生徒の並びとの比較・検討順ヒント〔order-hints.ts〕の並べ替えの材料。外部送信なし・DB変更なし）
 *
 * 並びの導出規則（reduceOrderEvents）:
 * - 同じマスへの上書き（同じ key への apply）は前の記入を並びから外し、最後の記入だけ残す
 * - 「一手戻す」（undo）は並びの最後の1件を外す
 * - 一覧からの削除（remove）は同じ key の最新の1件を外す
 * ※ 上書き後に undo したときの厳密な復元までは追わない（この記録は採点ではなく資料）。
 */

import type { PenStroke, SymbolId } from './types'
import { EXCEPTION_KANJI, POS_LETTERS, ROLE_LETTERS } from './types'
import { CLOSE_TO_SPAN, OPEN_TO_SPAN } from './apply'
import { symbolLabel } from './ledger'

/** どの操作で記入されたか: pen=ペン判別 / chip=候補チップ / list=一覧から選択 */
export type StepVia = 'pen' | 'chip' | 'list'

/** 確定した分析の並びの1手 */
export interface AnalysisStep {
  /** 記号（台帳の ID か文字そのもの。表示は symbolLabel） */
  symbol: string
  /** 上書き・削除の照合に使う鍵（pos:3 / role:1-1 / span:ul:0-1 / open:adv:4 / extra:wavy:2-4） */
  key: string
  /** 吸着した単語の範囲（token の添字） */
  from: number
  to: number
  /** 筆画の開始時刻（ms・入力イベント時刻）。一覧からの記入は操作時刻 */
  at: number
  via: StepVia
}

export type OrderEvent =
  | ({ kind: 'apply' } & AnalysisStep)
  | { kind: 'undo'; at: number }
  | { kind: 'remove'; key: string; at: number }

/** 操作の時系列から「どの記号をどの順で書いたか」の並びを導出する */
export function reduceOrderEvents(events: OrderEvent[]): AnalysisStep[] {
  const steps: AnalysisStep[] = []
  for (const ev of events) {
    if (ev.kind === 'apply') {
      const i = steps.findIndex((s) => s.key === ev.key)
      if (i >= 0) steps.splice(i, 1)
      steps.push({ symbol: ev.symbol, key: ev.key, from: ev.from, to: ev.to, at: ev.at, via: ev.via })
    } else if (ev.kind === 'undo') {
      steps.pop()
    } else {
      for (let i = steps.length - 1; i >= 0; i--) {
        if (steps[i].key === ev.key) {
          steps.splice(i, 1)
          break
        }
      }
    }
  }
  return steps
}

/**
 * 記号と吸着先から照合用の鍵を作る（ペン判別で反映されたときに使う）。
 * 一覧からの記入・削除の鍵（pos:i / role:i-i / span:type:f-t / open:type:i / extra:…）と
 * 同じ形にそろえ、同じマスの上書きが並びの上でも1件にまとまるようにする。
 */
export function orderKeyFor(symbol: SymbolId, target: { from: number; to: number }): string | null {
  if ((POS_LETTERS as readonly string[]).includes(symbol)) return `pos:${target.from}`
  if ((ROLE_LETTERS as readonly string[]).includes(symbol) || symbol === 'triangle') {
    return `role:${target.from}-${target.to}`
  }
  if ((EXCEPTION_KANJI as readonly string[]).includes(symbol)) {
    return `extra:${symbol}:${target.from}-${target.to}`
  }
  const open = OPEN_TO_SPAN[symbol]
  if (open) return `open:${open}:${target.from}`
  const close = CLOSE_TO_SPAN[symbol]
  if (close) return `span:${close}:${target.from}-${target.to}`
  if (symbol === 'hline') return `span:ul:${target.from}-${target.to}`
  if (symbol === 'wavy') return `extra:wavy:${target.from}-${target.to}`
  return null
}

/** 筆画の開始時刻（1画目の最初の点の時刻）。無ければ null */
export function strokeStartTime(strokes: PenStroke[]): number | null {
  const t = strokes[0]?.[0]?.t
  return typeof t === 'number' ? t : null
}

/** 並びの1手を人の読める短い文字列にする（例「（｜by the door」） */
export function describeStep(step: AnalysisStep, tokens: string[]): string {
  const text = tokens.slice(step.from, step.to + 1).join(' ')
  const short = text.length > 26 ? `${text.slice(0, 25)}…` : text
  return `${symbolLabel(step.symbol)}｜${short}`
}

/* ---------- 模範の順序（講師用・この端末の localStorage に保存） ---------- */

export interface ModelOrder {
  id: string
  problemId: string
  problemTitle: string
  steps: AnalysisStep[]
  /** 保存時点の並びの読み仮名（describeStep の結果。貼り付け先で単語列が無くても読める） */
  summary: string[]
  savedAt: string
}

const MODEL_KEY = 'pen-syntax-model-orders-v1'

export function loadModelOrders(): ModelOrder[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(MODEL_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as ModelOrder[]) : []
  } catch {
    return []
  }
}

export function saveModelOrder(input: {
  problemId: string
  problemTitle: string
  steps: AnalysisStep[]
  summary: string[]
}): ModelOrder[] {
  const order: ModelOrder = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    ...input,
    savedAt: new Date().toISOString(),
  }
  const next = [...loadModelOrders(), order]
  try {
    window.localStorage.setItem(MODEL_KEY, JSON.stringify(next))
  } catch {
    // 保存できない環境でも一覧表示は続ける
  }
  return next
}

export function deleteModelOrder(id: string): ModelOrder[] {
  const next = loadModelOrders().filter((o) => o.id !== id)
  try {
    window.localStorage.setItem(MODEL_KEY, JSON.stringify(next))
  } catch {
    // 何もしない
  }
  return next
}

/* ---------- 生徒の並びの控え（採点＝確定のたびに端末内へ追記） ---------- */

export interface OrderHistoryEntry {
  problemId: string
  problemTitle: string
  steps: AnalysisStep[]
  /** 採点の得点率（並びと出来の突き合わせ用） */
  percent: number
  gradedAt: string
}

const HISTORY_KEY = 'pen-syntax-order-history-v1'
const HISTORY_MAX = 30

export function loadOrderHistory(): OrderHistoryEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as OrderHistoryEntry[]) : []
  } catch {
    return []
  }
}

export function appendOrderHistory(entry: OrderHistoryEntry): void {
  const next = [...loadOrderHistory(), entry].slice(-HISTORY_MAX)
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
  } catch {
    // 保存できなくても採点の動作は続ける
  }
}
