/**
 * 生徒向け: 自分のスパルタプログラム API。
 *
 * GET /api/sparta/mine
 *   ログイン中の生徒自身のプログラム（中止を除く）を進捗つきで返す。
 *   ホームのスパルタカードが読む。マイグレーション未適用などで表が無い場合は
 *   空配列を返す（生徒の画面にエラーを出さない）。
 *
 * 認証: セッション（requireAuth）。集計は service role client で行い、
 * 対象は必ず auth.uid() 本人の行に限定する（講師APIと同じ集計視野を保つため）。
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/api/auth'
import { fetchDeckMaps } from '@/lib/review-pause/server'
import { enrichProgram, type SpartaProgramRow } from '@/lib/sparta/server'

function createAdminClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) return null
  return createSupabaseClient(supabaseUrl, serviceRoleKey)
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { user, error: authError } = await requireAuth(supabase)
    if (authError) return authError

    const admin = createAdminClient()
    if (!admin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const { data: rows, error } = await admin
      .from('sparta_programs')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('end_date', { ascending: true })
    if (error) {
      // 表が未作成でも生徒の画面を壊さない
      console.error('Error fetching sparta programs (mine):', error)
      return NextResponse.json({ programs: [] })
    }
    if (!rows || rows.length === 0) {
      return NextResponse.json({ programs: [] })
    }

    const deckMaps = await fetchDeckMaps(admin)
    const now = new Date()
    const programs = []
    for (const row of rows as SpartaProgramRow[]) {
      const enriched = await enrichProgram(admin, deckMaps, row, now)
      // 生徒に見せる粒度: 目標・期限・進捗の核だけ（習得度内訳などの細部は講師画面のみ）
      programs.push({
        id: enriched.id,
        deckIds: enriched.deckIds,
        deckNames: enriched.deckNames,
        startDate: enriched.startDate,
        endDate: enriched.endDate,
        phase: enriched.progress.phase,
        achievedInPeriod: enriched.progress.achievedInPeriod,
        targetCount: enriched.progress.targetCount,
        progressPct: enriched.progress.progressPct,
        daysRemaining: enriched.progress.daysRemaining,
        daysTotal: enriched.progress.daysTotal,
        studiedToday: enriched.progress.studiedToday,
        currentStreak: enriched.progress.currentStreak,
      })
    }

    return NextResponse.json({ programs })
  } catch (error) {
    console.error('Error in sparta mine GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
