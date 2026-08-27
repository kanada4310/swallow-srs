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
import {
  estimateCostYen,
  failedCallYen,
  reserveCostYen,
  DEFAULT_MODEL,
  DEFAULT_USD_JPY,
  type TokenUsage,
} from './pricing'
import type { SystemBlock } from './prompt'
import { INDEX_FILE, readMaterialFile } from '@/lib/reading/material-store'

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

/**
 * 今月（日本時間の暦月）の使用額合計（円）。
 * **読み取れなかったときは null を返す**（0 を返すと上限判定が「通す側」に倒れるため）。
 */
export async function monthSpentYen(
  admin: SupabaseClient,
  now: Date = new Date()
): Promise<number | null> {
  const { data, error } = await admin
    .from('syntax_ai_usage')
    .select('cost_yen')
    .gte('created_at', jstMonthStartIso(now))
  if (error || !data) return null
  return data.reduce((sum, r) => sum + Number(r.cost_yen || 0), 0)
}

/**
 * 受付判定。**読めないものがあれば必ず「受け付けない」に倒す**（ADR「安全の線」1）。
 * - 設定が読めない → 停止中として扱う
 * - 今月の使用額が集計できない → 上限を効かせられないので受け付けない
 */
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
  if (spent === null) {
    console.error('構文AI: 今月の使用額を集計できないため受付を止めました')
    return {
      gate: { allowed: false, reason: 'usage-unknown', spentYen: 0, capYen: config.monthlyCapYen },
      config,
    }
  }
  return { gate: evaluateGate(config, userId, spent, now), config }
}

/**
 * 送られてきた文が本当に教材の文かを確かめる（外部のAIへ教材以外の文を送らせない）。
 *
 * 教材データ（契約C22）は 2026-08-27 に `private/reading-data/`（配信されない場所）へ移した。
 * サーバー側からはそのまま読めるので、以前のように自サイトへ取りに行かない
 * （クッキーを引き継いで取りに行く必要も無くなった）。
 */
export function verifySentenceTokens(
  lessonId: string,
  sentenceKey: string,
  tokens: string[]
): boolean {
  try {
    const idx = JSON.parse(readMaterialFile(INDEX_FILE)) as {
      lessons?: Array<{ id: string; file: string }>
    }
    const entry = (idx.lessons ?? []).find((l) => l.id === lessonId)
    if (!entry) return false
    const data = JSON.parse(readMaterialFile(entry.file)) as {
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

/** 使用記録を先に置けなかった＝上限を効かせられないので、AIを呼ばずに断るときの目印 */
export class UsageRecordUnavailableError extends Error {
  constructor() {
    super('使用記録を残せないため受け付けられません')
    this.name = 'UsageRecordUnavailableError'
  }
}

/**
 * AIを1回呼び、使用記録を残す。lesson/sentence は自前DBの集計用で、AIへは送らない。
 *
 * **費用は先取りで計上する。** 呼んだあとに記録を書こうとすると、書けなかったときに
 * 使用額が過少になり上限3,000円が効かなくなる（＝止まらない側の壊れ方）。そこで
 *   ①最悪値で記録を1行置く → ②置けなければAIを呼ばずに断る → ③呼べたら実測値に置き換える
 * の順にする。③に失敗しても最悪値が残るだけなので、多めに数える側（＝止まる側）に倒れる。
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
  const rate = usdJpyRate()

  // ① 最悪値で先に計上する
  const { data: reserved, error: reserveError } = await admin
    .from('syntax_ai_usage')
    .insert({
      user_id: record.userId,
      kind: record.kind,
      lesson_id: record.lessonId,
      sentence_key: record.sentenceKey,
      model,
      cost_yen: reserveCostYen(model, maxTokens, rate),
    })
    .select('id')
    .single()

  // ② 置けなければAIを呼ばない（お金を使わずに断る）
  if (reserveError || !reserved) {
    console.error('構文AI: 使用記録を先に置けないため呼び出しを中止:', reserveError?.message)
    throw new UsageRecordUnavailableError()
  }

  const settle = async (usage: TokenUsage, costYen: number) => {
    const { error } = await admin
      .from('syntax_ai_usage')
      .update({
        input_tokens: usage.input,
        output_tokens: usage.output,
        cache_write_tokens: usage.cacheWrite,
        cache_read_tokens: usage.cacheRead,
        cost_yen: costYen,
      })
      .eq('id', reserved.id)
    // 置き換えに失敗しても最悪値が残る（多めに数える＝上限は効いたまま）
    if (error) console.error('構文AI: 使用記録の実測値への置き換えに失敗:', error.message)
  }

  let response: Anthropic.Message
  try {
    response = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages,
    })
  } catch (err) {
    // 課金されたかは判定できないので 0 にはせず、控えめな実費相当を残す
    await settle({ input: 0, output: 0, cacheWrite: 0, cacheRead: 0 }, failedCallYen(model, rate))
    throw err
  }

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
  const costYen = estimateCostYen(model, usage, rate)

  // ③ 実測値に置き換える
  await settle(usage, costYen)

  return { text, usage, costYen }
}
