/**
 * POST /api/integration/deck-unlock
 *
 * CMS（課題管理システム）からの復習デッキ解禁エンドポイント。
 * CMS で課題を提出し終えた生徒に、対応する復習デッキを個別配布する。
 * CMS と SRS は別 Supabase プロジェクトのため、CMS は line_user_id をキーに呼ぶ
 * （SRS 側で profiles.id に解決する）。CMS 側 ADR: 20260708-srs-integration-link。
 *
 * 認証: SRS_AUTH_SECRET を Bearer トークンとして検証（billing-sync と同じ機械間認証）
 *
 * Request body: { lineUserId: string, deckId: string }
 * Response: { data: { assigned: boolean } } / { error: string }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { deriveLineEmail } from '@/lib/auth/line-user'

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

    let body: { lineUserId?: unknown; deckId?: unknown }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const { lineUserId, deckId } = body
    if (typeof lineUserId !== 'string' || typeof deckId !== 'string') {
      return NextResponse.json({ error: 'lineUserId and deckId are required' }, { status: 400 })
    }

    const supabase = createSupabaseClient(supabaseUrl, serviceRoleKey)

    // line_user_id -> profiles.id（メール導出で高速解決）。未登録なら CMS 側で再送されるよう 404
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', deriveLineEmail(lineUserId))
      .maybeSingle()
    if (!profile) {
      return NextResponse.json({ error: 'Student not found in SRS' }, { status: 404 })
    }

    // 存在しないデッキは FK エラーより先に明示的に弾く
    const { data: deck } = await supabase
      .from('decks')
      .select('id')
      .eq('id', deckId)
      .maybeSingle()
    if (!deck) {
      return NextResponse.json({ error: 'Deck not found' }, { status: 404 })
    }

    // 既に配布済みなら冪等に成功を返す
    const { data: existing } = await supabase
      .from('deck_assignments')
      .select('id')
      .eq('deck_id', deckId)
      .eq('user_id', profile.id)
      .maybeSingle()
    if (existing) {
      return NextResponse.json({ data: { assigned: true } })
    }

    const { error: insertError } = await supabase
      .from('deck_assignments')
      .insert({ deck_id: deckId, user_id: profile.id })
    if (insertError) {
      // 競合（同時配布）は一意制約違反 = 既に配布済みとみなす
      if (insertError.code === '23505') {
        return NextResponse.json({ data: { assigned: true } })
      }
      console.error('[deck-unlock] insert failed:', insertError)
      return NextResponse.json({ error: 'Failed to assign deck' }, { status: 500 })
    }

    return NextResponse.json({ data: { assigned: true } })
  } catch (error) {
    console.error('Error in deck-unlock:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
