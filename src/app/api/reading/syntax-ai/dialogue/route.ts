/**
 * 添削問答（POST /api/reading/syntax-ai/dialogue・1呼び出し=コーチの返答1回）。
 *
 * 問答の履歴は画面側が持ち、毎回まるごと送る（サーバに会話状態を持たない）。
 * 受付前にサーバ側ゲートを必ず通す。外部のAIへ送るのは教材の文・書き込み・問答の文面だけ。
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/api/auth'
import {
  callClaudeAndRecord,
  checkGate,
  createAdminClient,
  getAnthropicClient,
  verifySentenceTokens,
} from '@/lib/syntax-ai/server'
import { GATE_DENY_LABEL } from '@/lib/syntax-ai/gate'
import { buildDialogueMessages, buildSystemBlocks } from '@/lib/syntax-ai/prompt'
import { parseJudgeResponse } from '@/lib/syntax-ai/serialize'
import { isSentenceKey, validateAnswer, validateTokens, validateTurns } from '@/lib/syntax-ai/validate'
import type { SentenceSyntaxWork } from '@/lib/reading/types'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { user, error: authError } = await requireAuth(supabase)
  if (authError) return authError

  let body: {
    lessonId?: unknown
    sentenceKey?: unknown
    tokens?: unknown
    answer?: unknown
    unknown?: unknown
    judgeResult?: unknown
    turns?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { lessonId, sentenceKey, tokens, answer } = body
  if (typeof lessonId !== 'string' || !lessonId || lessonId.length > 200) {
    return NextResponse.json({ error: 'lessonId が必要です' }, { status: 400 })
  }
  if (!isSentenceKey(sentenceKey)) {
    return NextResponse.json({ error: 'sentenceKey が必要です' }, { status: 400 })
  }
  const tokensError = validateTokens(tokens)
  if (tokensError) return NextResponse.json({ error: tokensError }, { status: 400 })
  const answerError = validateAnswer(tokens as string[], answer)
  if (answerError) return NextResponse.json({ error: answerError }, { status: 400 })

  const turns = validateTurns(body.turns)
  if (typeof turns === 'string') {
    return NextResponse.json({ error: turns }, { status: 400 })
  }

  // 判定結果は画面から渡されるが、そのまま信用せず読み取り直して整える
  const judgeResult = body.judgeResult
    ? parseJudgeResponse(JSON.stringify(body.judgeResult))
    : null

  const admin = createAdminClient()
  if (!admin) {
    return NextResponse.json({ error: 'サーバの設定が不足しています' }, { status: 503 })
  }

  const { gate, config } = await checkGate(admin, user.id)
  if (!gate.allowed || !config) {
    return NextResponse.json(
      { error: gate.reason ? GATE_DENY_LABEL[gate.reason] : '受付できません', reason: gate.reason },
      { status: 403 }
    )
  }

  const verified = await verifySentenceTokens(
    request.nextUrl.origin,
    request.headers.get('cookie') ?? '',
    lessonId,
    sentenceKey,
    tokens as string[]
  )
  if (!verified) {
    return NextResponse.json({ error: '教材の文と一致しません' }, { status: 400 })
  }

  const anthropic = getAnthropicClient()
  if (!anthropic) {
    return NextResponse.json(
      { error: 'AIの利用鍵が設定されていません（塾長の設定待ち）' },
      { status: 503 }
    )
  }

  try {
    const { text, costYen } = await callClaudeAndRecord({
      admin,
      anthropic,
      model: config.model,
      system: buildSystemBlocks('dialogue'),
      messages: buildDialogueMessages(
        tokens as string[],
        answer as SentenceSyntaxWork['answer'],
        body.unknown === true,
        judgeResult,
        turns
      ),
      maxTokens: 800,
      record: { userId: user.id, kind: 'dialogue', lessonId, sentenceKey },
    })

    const reply = text.trim()
    if (!reply) {
      return NextResponse.json(
        { error: '返答を受け取れませんでした。もう一度お試しください' },
        { status: 502 }
      )
    }
    return NextResponse.json({ reply, costYen })
  } catch (err) {
    console.error('添削問答の呼び出しに失敗:', err instanceof Error ? err.message : err)
    return NextResponse.json(
      { error: 'AIの呼び出しに失敗しました。少し待ってからお試しください' },
      { status: 502 }
    )
  }
}
