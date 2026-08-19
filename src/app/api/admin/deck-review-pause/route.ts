/**
 * POST /api/admin/deck-review-pause
 *
 * デッキ単位の復習通知 停止/再開 API（機械間）。
 * billing の LINE postback ハンドラ（「このデッキの復習通知を停止」ボタン）から呼ぶ。
 *
 * 認証: SRS_AUTH_SECRET を Bearer トークンとして検証（billing-sync と同じ）
 *
 * Request body:
 * {
 *   lineUserId?: "U...",   // billing からは LINE ユーザーIDで指定
 *   userId?: "uuid",       // SRS 内部ユーザーIDでも可（どちらか必須）
 *   deckId: "uuid",        // サブデッキIDでも可（サーバーでルートに解決）
 *   action: "pause" | "resume"
 * }
 *
 * Response: { success: true, userId, rootDeckId, deckName, paused }
 * 停止は user_deck_settings.settings の reviewPaused/reviewPausedAt に保存。
 * card_states には触れない（通知集計から外すだけ）。再開は生徒が自分で
 * そのデッキを学習しても自動で行われる（集計時判定）。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { deriveLineEmail } from '@/lib/auth/line-user'
import { setReviewPause } from '@/lib/review-pause/server'

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const authSecret = process.env.SRS_AUTH_SECRET
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!authSecret || !supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }
    if (authHeader !== `Bearer ${authSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { lineUserId, deckId, action } = body as {
      lineUserId?: string
      userId?: string
      deckId?: string
      action?: string
    }
    let userId = body.userId as string | undefined

    if (!deckId || (action !== 'pause' && action !== 'resume')) {
      return NextResponse.json(
        { error: 'deckId and action (pause|resume) are required' },
        { status: 400 }
      )
    }
    if (!userId && !lineUserId) {
      return NextResponse.json({ error: 'userId or lineUserId is required' }, { status: 400 })
    }

    const supabase = createSupabaseClient(supabaseUrl, serviceRoleKey)

    // lineUserId → profiles.id（due-count と同じ解決方法）
    if (!userId && lineUserId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', deriveLineEmail(lineUserId))
        .maybeSingle()
      if (!profile) {
        return NextResponse.json({ error: 'Student not found' }, { status: 404 })
      }
      userId = profile.id
    }

    const result = await setReviewPause(supabase, userId!, deckId, action)

    return NextResponse.json({ success: true, userId, ...result })
  } catch (error) {
    if (error instanceof Error && error.message === 'Deck not found') {
      return NextResponse.json({ error: 'Deck not found' }, { status: 404 })
    }
    console.error('Error in deck-review-pause:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
