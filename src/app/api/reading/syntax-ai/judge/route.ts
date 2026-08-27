/**
 * 1文の通し分析へのAI判定（POST /api/reading/syntax-ai/judge・1往復）。
 *
 * 受付前にサーバ側ゲート（有効→許可生徒→期間→月上限3,000円）を必ず通す。
 * 外部のAIへ送るのは教材の文と生徒の書き込みだけ。文が教材のものかも照合する。
 * 呼び出しごとにトークン数と概算費用を syntax_ai_usage に記録する（実測の材料）。
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/api/auth'
import {
  callClaudeAndRecord,
  checkGate,
  createAdminClient,
  getAnthropicClient,
  UsageRecordUnavailableError,
  verifySentenceTokens,
} from '@/lib/syntax-ai/server'
import { GATE_DENY_LABEL } from '@/lib/syntax-ai/gate'
import { buildJudgeUserMessage, buildSystemBlocks } from '@/lib/syntax-ai/prompt'
import { parseJudgeResponse } from '@/lib/syntax-ai/serialize'
import { isSentenceKey, validateAnswer, validateTokens } from '@/lib/syntax-ai/validate'
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

  const verified = verifySentenceTokens(lessonId, sentenceKey, tokens as string[])
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
      system: buildSystemBlocks('judge'),
      messages: [
        {
          role: 'user',
          content: buildJudgeUserMessage(
            tokens as string[],
            answer as SentenceSyntaxWork['answer'],
            body.unknown === true
          ),
        },
      ],
      maxTokens: 2000,
      record: { userId: user.id, kind: 'judge', lessonId, sentenceKey },
    })

    const result = parseJudgeResponse(text)
    if (!result) {
      return NextResponse.json(
        { error: '判定の返答を読み取れませんでした。もう一度お試しください' },
        { status: 502 }
      )
    }
    return NextResponse.json({ result, costYen })
  } catch (err) {
    if (err instanceof UsageRecordUnavailableError) {
      // 使った額を数えられない＝上限が効かないので、AIを呼ばずに断っている
      return NextResponse.json(
        { error: '利用状況を記録できないため、いまはAI判定を受け付けられません' },
        { status: 503 }
      )
    }
    console.error('構文AI判定の呼び出しに失敗:', err instanceof Error ? err.message : err)
    return NextResponse.json(
      { error: 'AIの呼び出しに失敗しました。少し待ってからお試しください' },
      { status: 502 }
    )
  }
}
