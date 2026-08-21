/**
 * 構文AIの入口の可否（GET /api/reading/syntax-ai/status）。
 *
 * ログイン中の生徒がAI判定・添削問答を使えるかを返す。
 * 画面はこの結果でボタンの表示/非表示を切り替える。判定の根拠はサーバ側のゲート
 * （有効フラグ→許可一覧→期間→月上限）で、表示を偽装しても judge/dialogue 側で再判定する。
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/api/auth'
import { checkGate, createAdminClient } from '@/lib/syntax-ai/server'
import { GATE_DENY_LABEL } from '@/lib/syntax-ai/gate'

export async function GET() {
  const supabase = await createClient()
  const { user, error: authError } = await requireAuth(supabase)
  if (authError) return authError

  const admin = createAdminClient()
  if (!admin) {
    return NextResponse.json({ allowed: false, reason: 'disabled', message: GATE_DENY_LABEL.disabled })
  }

  const { gate } = await checkGate(admin, user.id)
  return NextResponse.json({
    allowed: gate.allowed,
    reason: gate.reason,
    message: gate.reason ? GATE_DENY_LABEL[gate.reason] : null,
  })
}
