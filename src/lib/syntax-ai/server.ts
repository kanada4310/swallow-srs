/**
 * 構文AI試行のサーバ側の共通処理。
 *
 * - 設定と使用記録の読み書きは service role（RLSを通さない管理用クライアント）で行う。
 *   生徒からは表に直接触れず、必ずこのAPI層の受付判定（ゲート）を通る。
 * - 外部のAI（Anthropic）へ送るのは教材の文と生徒の書き込み・問答の文面だけ。
 *   ここで組むリクエストに氏名・LINE識別子・内部IDは入れない（絶対規程3）。
 * - API鍵は SYNTAX_AI_ANTHROPIC_API_KEY があればそれを優先し、無ければ既存の
 *   ANTHROPIC_API_KEY を使う（鍵の発行・設定は塾長が行う）。鍵の値はログに出さない。
 */

import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { evaluateGate, jstMonthStartIso, type GateResult, type SyntaxAiConfig } from './gate'
import { estimateCostYen, DEFAULT_MODEL, DEFAULT_USD_JPY, type TokenUsage } from './pricing'
import type { SystemBlock } from './prompt'

export function createAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export function getAnthropicClient(): Anthropic | null {
  const apiKey = process.env.SYNTAX_AI_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null
  return new Anthropic({ apiKey })
}

export function usdJpyRate(): number {
  const raw = Number(process.env.SYNTAX_AI_USD_JPY)
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_USD_JPY
}

/** 設定表（1行）を読む。表が無い・行が無いときは null（=入口を閉じたままにする） */
export async function loadConfig(admin: SupabaseClient): Promise<SyntaxAiConfig | null> {
  const { data, error } = await admin
    .from('syntax_ai_config')
    .select('enabled, allowed_user_ids, starts_at, ends_at, monthly_cap_yen, model')
    .eq('id', 1)
    .maybeSingle()
  if (error || !data) return null
  return {
    enabled: !!data.enabled,
    allowedUserIds: (data.allowed_user_ids as string[]) ?? [],
    startsAt: data.starts_at as string | null,
    endsAt: data.ends_at as string | null,
    monthlyCapYen: Number(data.monthly_cap_yen ?? 3000),
    model: (data.model as string) || DEFAULT_MODEL,
  }
}

/** 今月（日本時間の暦月）の使用額合計（円） */
export async function monthSpentYen(admin: SupabaseClient, now: Date = new Date()): Promise<number> {
  const { data, error } = await admin
    .from('syntax_ai_usage')
    .select('cost_yen')
    .gte('created_at', jstMonthStartIso(now))
  if (error || !data) return 0
  return data.reduce((sum, r) => sum + Number(r.cost_yen || 0), 0)
}

/** 受付判定。設定が読めないときは「停止中」として扱う */
export async function checkGate(
  admin: SupabaseClient,
  userId: string,
  now: Date = new Date()
): Promise<{ gate: GateResult; config: SyntaxAiConfig | null }> {
  const config = await loadConfig(admin)
  if (!config) {
    return {
      gate: { allowed: false, reason: 'disabled', spentYen: 0, capYen: 0 },
      config: null,
    }
  }
  const spent = await monthSpentYen(admin, now)
  return { gate: evaluateGate(config, userId, spent, now), config }
}

/**
 * 送られてきた文が本当に教材の文かを確かめる（外部のAIへ教材以外の文を送らせない）。
 * 教材データは自サイトの静的ファイル（public/reading-data・契約C22）から読む。
 */
export async function verifySentenceTokens(
  origin: string,
  lessonId: string,
  sentenceKey: string,
  tokens: string[]
): Promise<boolean> {
  try {
    const idxRes = await fetch(`${origin}/reading-data/index.json`)
    if (!idxRes.ok) return false
    const idx = (await idxRes.json()) as { lessons?: Array<{ id: string; file: string }> }
    const entry = (idx.lessons ?? []).find((l) => l.id === lessonId)
    if (!entry) return false
    const dataRes = await fetch(`${origin}/reading-data/${entry.file}`)
    if (!dataRes.ok) return false
    const data = (await dataRes.json()) as {
      paragraphs?: Array<{ sentences?: Array<{ tokens?: string[] }> }>
    }
    const [p, s] = sentenceKey.split(':').map(Number)
    const actual = data.paragraphs?.[p]?.sentences?.[s]?.tokens
    if (!actual || actual.length !== tokens.length) return false
    return actual.every((t, i) => t === tokens[i])
  } catch {
    return false
  }
}

export interface ClaudeCallResult {
  text: string
  usage: TokenUsage
  costYen: number
}

/**
 * AIを1回呼び、使用記録を残す。lesson/sentence は自前DBの集計用で、AIへは送らない。
 */
export async function callClaudeAndRecord(params: {
  admin: SupabaseClient
  anthropic: Anthropic
  model: string
  system: SystemBlock[]
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  maxTokens: number
  record: { userId: string; kind: 'judge' | 'dialogue'; lessonId: string; sentenceKey: string }
}): Promise<ClaudeCallResult> {
  const { admin, anthropic, model, system, messages, maxTokens, record } = params

  const response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages,
  })

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')

  const usage: TokenUsage = {
    input: response.usage.input_tokens ?? 0,
    output: response.usage.output_tokens ?? 0,
    cacheWrite: response.usage.cache_creation_input_tokens ?? 0,
    cacheRead: response.usage.cache_read_input_tokens ?? 0,
  }
  const costYen = estimateCostYen(model, usage, usdJpyRate())

  // 記録に失敗しても生徒の画面は止めない（失敗はログに残す。費用は次回の集計に乗らないが
  // 概算の安全側運用として上限3,000円自体に余裕を見ている）
  const { error } = await admin.from('syntax_ai_usage').insert({
    user_id: record.userId,
    kind: record.kind,
    lesson_id: record.lessonId,
    sentence_key: record.sentenceKey,
    model,
    input_tokens: usage.input,
    output_tokens: usage.output,
    cache_write_tokens: usage.cacheWrite,
    cache_read_tokens: usage.cacheRead,
    cost_yen: costYen,
  })
  if (error) {
    console.error('syntax_ai_usage の記録に失敗:', error.message)
  }

  return { text, usage, costYen }
}
