/**
 * POST /api/garden/imprint — 品種インプリントの保存（Phase 10.4）
 *
 * 生徒がノートに刻む「見た目」だけを user_creature_state に upsert する。
 * card_states（学習エンジン）には一切触れない純コスメ層。
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/api/auth'
import { VARIETY_MAP } from '@/lib/garden/varieties'

interface ImprintRequest {
  noteId: string
  variety: string
  nickname?: string | null
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { user, error: authError } = await requireAuth(supabase)
  if (authError) return authError

  let body: ImprintRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.noteId || !body.variety) {
    return NextResponse.json({ error: 'noteId and variety are required' }, { status: 400 })
  }
  if (!VARIETY_MAP[body.variety]) {
    return NextResponse.json({ error: 'Unknown variety' }, { status: 400 })
  }

  // RLS で user_id = auth.uid() を強制（自分の刻印のみ）
  const { error } = await supabase.from('user_creature_state').upsert(
    {
      user_id: user.id,
      note_id: body.noteId,
      imprint: { variety: body.variety },
      nickname: body.nickname ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,note_id' }
  )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
