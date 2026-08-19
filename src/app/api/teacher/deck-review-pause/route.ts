/**
 * 講師向け: 復習通知の管理 API（生徒×デッキ）。
 *
 * GET  /api/teacher/deck-review-pause
 *   担当生徒 × ルートデッキの一覧（期限切れ枚数・最終学習日・停止状態）。
 *   期限切れがある or 停止中のデッキだけを返す（=「どの生徒のどのデッキの
 *   復習が走っているか」）。停止の自動解除もここで実施。
 *
 * POST /api/teacher/deck-review-pause  { userId, deckId, action: 'pause'|'resume' }
 *   停止/再開。実体は billing 用の admin API と同じ共通ロジック
 *   （user_deck_settings.settings の reviewPaused/reviewPausedAt）。
 *
 * 認証: 講師セッション（requireTeacher）＋担当生徒チェック。
 * 集計・書き込みは service role client で行う（通知集計と同じ視野を保つため。
 * RLS 経由だと生徒の個人デッキが講師から見えず、通知一覧とズレるのを避ける）。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { requireTeacher } from '@/lib/api/auth'
import {
  fetchDeckMaps,
  fetchDueGroupsForUser,
  fetchPauseEntries,
  checkAndAutoRelease,
  setReviewPause,
  type DeckMaps,
} from '@/lib/review-pause/server'

/** 講師の担当生徒ID一覧（own class + billing 連携クラス。既存APIと同じ判定） */
async function getTeacherStudentIds(
  supabase: SupabaseClient,
  teacherId: string
): Promise<string[]> {
  const { data: classes } = await supabase
    .from('classes')
    .select('id, class_members(user_id)')
    .or(`teacher_id.eq.${teacherId},billing_template_id.not.is.null`)
  interface ClassWithMembers {
    id: string
    class_members: { user_id: string }[]
  }
  const members = ((classes as ClassWithMembers[]) || []).flatMap(
    c => (c.class_members || []).map(m => m.user_id)
  )
  return Array.from(new Set(members))
}

function createAdminClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) return null
  return createSupabaseClient(supabaseUrl, serviceRoleKey)
}

interface StudentDeckRow {
  deckId: string
  deckName: string
  dueCount: number
  lastReviewedAt: string | null
  paused: boolean
  pausedAt: string | null
}

interface StudentRow {
  userId: string
  name: string
  decks: StudentDeckRow[]
}

async function fetchLastReviewedAt(
  admin: SupabaseClient,
  userId: string,
  subtree: string[]
): Promise<string | null> {
  const { data } = await admin
    .from('review_logs')
    .select('reviewed_at, cards!inner(deck_id)')
    .eq('user_id', userId)
    .in('cards.deck_id', subtree)
    .order('reviewed_at', { ascending: false })
    .limit(1)
  return (data?.[0]?.reviewed_at as string | undefined) ?? null
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { user, error: authError } = await requireTeacher(supabase)
    if (authError) return authError

    const admin = createAdminClient()
    if (!admin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const studentIds = await getTeacherStudentIds(supabase, user.id)
    if (studentIds.length === 0) {
      return NextResponse.json({ students: [] })
    }

    const { data: profiles } = await admin
      .from('profiles')
      .select('id, name')
      .in('id', studentIds)
    const nameOf = new Map((profiles || []).map(p => [p.id as string, p.name as string]))

    const deckMaps: DeckMaps = await fetchDeckMaps(admin)

    // 停止エントリ（自動解除込み）: Map<userId, Map<rootDeckId, pausedAt>>
    const pauseEntries = await fetchPauseEntries(admin, studentIds)
    const pausedByUser = new Map<string, Map<string, string | null>>()
    for (const entry of pauseEntries) {
      const stillPaused = await checkAndAutoRelease(admin, entry, deckMaps.subtreeOf)
      if (!stillPaused) continue
      let map = pausedByUser.get(entry.userId)
      if (!map) {
        map = new Map()
        pausedByUser.set(entry.userId, map)
      }
      map.set(entry.rootDeckId, entry.pausedAt)
    }

    const now = new Date().toISOString()
    const students: StudentRow[] = []

    for (const studentId of studentIds) {
      const dueGroups = await fetchDueGroupsForUser(admin, studentId, now, deckMaps.rootOf)
      const pausedMap = pausedByUser.get(studentId) || new Map<string, string | null>()

      // 期限切れがある or 停止中のルートデッキを行にする
      const rootIds = new Set<string>([
        ...Array.from(dueGroups.keys()),
        ...Array.from(pausedMap.keys()),
      ])
      if (rootIds.size === 0) continue

      const decks: StudentDeckRow[] = []
      for (const rootId of Array.from(rootIds)) {
        const subtree = deckMaps.subtreeOf.get(rootId) || [rootId]
        const lastReviewedAt = await fetchLastReviewedAt(admin, studentId, subtree)
        decks.push({
          deckId: rootId,
          deckName: deckMaps.nameOf.get(rootId) || '(不明なデッキ)',
          dueCount: dueGroups.get(rootId)?.dueCount || 0,
          lastReviewedAt,
          paused: pausedMap.has(rootId),
          pausedAt: pausedMap.get(rootId) ?? null,
        })
      }
      decks.sort((a, b) => b.dueCount - a.dueCount)

      students.push({
        userId: studentId,
        name: nameOf.get(studentId) || '',
        decks,
      })
    }

    students.sort((a, b) => a.name.localeCompare(b.name, 'ja'))

    return NextResponse.json({ students })
  } catch (error) {
    console.error('Error in teacher deck-review-pause GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { user, error: authError } = await requireTeacher(supabase)
    if (authError) return authError

    const body = await request.json()
    const { userId, deckId, action } = body as {
      userId?: string
      deckId?: string
      action?: string
    }
    if (!userId || !deckId || (action !== 'pause' && action !== 'resume')) {
      return NextResponse.json(
        { error: 'userId, deckId and action (pause|resume) are required' },
        { status: 400 }
      )
    }

    const studentIds = await getTeacherStudentIds(supabase, user.id)
    if (!studentIds.includes(userId)) {
      return NextResponse.json({ error: 'Student not found in your classes' }, { status: 403 })
    }

    const admin = createAdminClient()
    if (!admin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const result = await setReviewPause(admin, userId, deckId, action)
    return NextResponse.json({ success: true, userId, ...result })
  } catch (error) {
    if (error instanceof Error && error.message === 'Deck not found') {
      return NextResponse.json({ error: 'Deck not found' }, { status: 404 })
    }
    console.error('Error in teacher deck-review-pause POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
