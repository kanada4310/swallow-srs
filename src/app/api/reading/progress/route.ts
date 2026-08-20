/**
 * 読解ページの途中保存。
 *
 * GET  /api/reading/progress            … 自分の全講の保存を返す（一覧の「続きから」用）
 * GET  /api/reading/progress?lessonId=X … その講の保存だけ返す
 * PUT  /api/reading/progress            … その講の保存を書き込む（後勝ち。ただし古い端末の上書きは拒む）
 *
 * 保存先の表（reading_progress）がまだ本番に無い場合は 503 と code=TABLE_MISSING を返す。
 * 画面側はそれを見て「この端末にだけ保存」に切り替えるので、生徒の入力は失われない。
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/api/auth'
import type { ReadingProgressState } from '@/lib/reading/types'

/** 表そのものが無い（マイグレーション未適用）ときの Postgres / PostgREST のしるし */
function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /reading_progress/i.test(error.message || '') &&
      /(does not exist|schema cache)/i.test(error.message || '')
  )
}

const tableMissingResponse = () =>
  NextResponse.json(
    {
      error: '途中保存の置き場所がまだ用意されていません',
      code: 'TABLE_MISSING',
    },
    { status: 503 }
  )

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { user, error: authError } = await requireAuth(supabase)
  if (authError) return authError

  const lessonId = request.nextUrl.searchParams.get('lessonId')

  let query = supabase
    .from('reading_progress')
    .select('lesson_id, state, updated_at')
    .eq('user_id', user.id)

  if (lessonId) query = query.eq('lesson_id', lessonId)

  const { data, error } = await query
  if (error) {
    if (isMissingTable(error)) return tableMissingResponse()
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []).map((r) => ({
    lessonId: r.lesson_id as string,
    state: r.state as ReadingProgressState,
    updatedAt: r.updated_at as string,
  }))

  if (lessonId) {
    return NextResponse.json({ progress: rows[0] ?? null })
  }
  return NextResponse.json({ progress: rows })
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const { user, error: authError } = await requireAuth(supabase)
  if (authError) return authError

  let body: { lessonId?: string; state?: ReadingProgressState }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { lessonId, state } = body
  if (!lessonId || !state || typeof state !== 'object') {
    return NextResponse.json({ error: 'lessonId と state が必要です' }, { status: 400 })
  }
  if (state.version !== 1 || state.lessonId !== lessonId) {
    return NextResponse.json({ error: '保存する形が合っていません' }, { status: 400 })
  }

  // 別の端末のほうが新しければ、そちらを勝たせて呼び出し側に返す
  const { data: existing, error: readError } = await supabase
    .from('reading_progress')
    .select('state, updated_at')
    .eq('user_id', user.id)
    .eq('lesson_id', lessonId)
    .maybeSingle()

  if (readError && isMissingTable(readError)) return tableMissingResponse()

  if (existing?.state) {
    const savedAt = new Date((existing.state as ReadingProgressState).updatedAt ?? 0).getTime()
    const incomingAt = new Date(state.updatedAt ?? 0).getTime()
    if (savedAt > incomingAt) {
      return NextResponse.json({
        conflict: true,
        progress: {
          lessonId,
          state: existing.state as ReadingProgressState,
          updatedAt: existing.updated_at as string,
        },
      })
    }
  }

  const { error } = await supabase.from('reading_progress').upsert(
    {
      user_id: user.id,
      lesson_id: lessonId,
      state,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,lesson_id' }
  )

  if (error) {
    if (isMissingTable(error)) return tableMissingResponse()
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
