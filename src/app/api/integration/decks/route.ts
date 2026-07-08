/**
 * GET /api/integration/decks
 *
 * CMS（課題管理システム）が課題に紐付ける復習デッキを「名前で選ぶ」ための一覧提供 API。
 * 講師・管理者が所有するデッキの id と名前だけを返す（生徒個人デッキは除外）。
 * CMS 側 ADR: 20260708-srs-integration-link。
 *
 * 認証: SRS_AUTH_SECRET を Bearer トークンとして検証（billing-sync と同じ機械間認証）
 *
 * Response: { data: { decks: { id: string, name: string }[] } } / { error: string }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
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

    const supabase = createSupabaseClient(supabaseUrl, serviceRoleKey)

    // 講師・管理者の profiles.id を集め、その所有デッキだけを返す（生徒の個人デッキは出さない）
    const { data: staff, error: staffError } = await supabase
      .from('profiles')
      .select('id')
      .in('role', ['teacher', 'admin'])
    if (staffError) {
      console.error('[integration/decks] staff query failed:', staffError)
      return NextResponse.json({ error: 'Failed to load decks' }, { status: 500 })
    }
    const staffIds = (staff ?? []).map((s) => s.id)
    if (staffIds.length === 0) {
      return NextResponse.json({ data: { decks: [] } })
    }

    const { data: decks, error: decksError } = await supabase
      .from('decks')
      .select('id, name')
      .in('owner_id', staffIds)
      .order('name', { ascending: true })
    if (decksError) {
      console.error('[integration/decks] decks query failed:', decksError)
      return NextResponse.json({ error: 'Failed to load decks' }, { status: 500 })
    }

    return NextResponse.json({ data: { decks: decks ?? [] } })
  } catch (error) {
    console.error('Error in integration/decks:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
