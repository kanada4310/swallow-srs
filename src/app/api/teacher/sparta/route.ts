/**
 * 講師向け: スパルタプログラム管理 API。
 *
 * GET  /api/teacher/sparta
 *   担当生徒のプログラム一覧（進捗つき）。
 * GET  /api/teacher/sparta?options=<studentId>
 *   登録フォーム用: その生徒が学習できるルートデッキの選択肢。
 * POST /api/teacher/sparta
 *   登録 { userId, deckIds, startDate, endDate, targetCardCount, goalMastery, memo }
 * PUT  /api/teacher/sparta
 *   編集・中止・再開 { id, ...変更フィールド, status }
 * DELETE /api/teacher/sparta?id=xxx
 *   削除（誤登録の取り消し用）
 *
 * 認証: 講師セッション（requireTeacher）＋担当生徒チェック。
 * 集計・書き込みは service role client（復習通知の管理と同じ理由:
 * RLS 経由だと生徒の個人デッキ配下が講師から見えず集計がズレる）。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { requireTeacher } from '@/lib/api/auth'
import { fetchDeckMaps, type DeckMaps } from '@/lib/review-pause/server'
import { validateSpartaInput } from '@/lib/sparta/logic'
import {
  computeBaseline,
  enrichProgram,
  resolveRootDeckIds,
  type SpartaProgramRow,
} from '@/lib/sparta/server'

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

/** 生徒が学習できるルートデッキの選択肢（配布デッキ＋本人所有） */
async function fetchDeckOptions(
  admin: SupabaseClient,
  deckMaps: DeckMaps,
  studentId: string
): Promise<Array<{ id: string; name: string }>> {
  const { data: memberRows } = await admin
    .from('class_members')
    .select('class_id')
    .eq('user_id', studentId)
  const classIds = (memberRows || []).map(r => r.class_id as string)

  let orFilter = `user_id.eq.${studentId}`
  if (classIds.length > 0) orFilter += `,class_id.in.(${classIds.join(',')})`
  const { data: assignments } = await admin
    .from('deck_assignments')
    .select('deck_id')
    .or(orFilter)

  const { data: ownDecks } = await admin
    .from('decks')
    .select('id')
    .eq('owner_id', studentId)

  const rootIds = new Set<string>()
  for (const row of assignments || []) rootIds.add(deckMaps.rootOf(row.deck_id as string))
  for (const row of ownDecks || []) rootIds.add(deckMaps.rootOf(row.id as string))

  return Array.from(rootIds)
    .map(id => ({ id, name: deckMaps.nameOf.get(id) || '(不明なデッキ)' }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { user, error: authError } = await requireTeacher(supabase)
    if (authError) return authError

    const admin = createAdminClient()
    if (!admin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const studentIds = await getTeacherStudentIds(supabase, user.id)

    // 登録フォーム用: デッキ選択肢
    const optionsFor = request.nextUrl.searchParams.get('options')
    if (optionsFor) {
      if (!studentIds.includes(optionsFor)) {
        return NextResponse.json({ error: 'Student not found in your classes' }, { status: 403 })
      }
      const deckMaps = await fetchDeckMaps(admin)
      const decks = await fetchDeckOptions(admin, deckMaps, optionsFor)
      return NextResponse.json({ decks })
    }

    // 生徒の一覧（登録フォームの生徒選択にも使う）
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, name')
      .in('id', studentIds.length > 0 ? studentIds : ['00000000-0000-0000-0000-000000000000'])
    const students = (profiles || [])
      .map(p => ({ id: p.id as string, name: p.name as string }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
    const nameOf = new Map(students.map(s => [s.id, s.name]))

    if (studentIds.length === 0) {
      return NextResponse.json({ programs: [], students: [] })
    }

    const { data: rows, error } = await admin
      .from('sparta_programs')
      .select('*')
      .in('user_id', studentIds)
      .order('end_date', { ascending: false })
    if (error) throw error

    const deckMaps = await fetchDeckMaps(admin)
    const now = new Date()
    const programs = []
    for (const row of (rows || []) as SpartaProgramRow[]) {
      const enriched = await enrichProgram(admin, deckMaps, row, now)
      programs.push({ ...enriched, studentName: nameOf.get(row.user_id) || '' })
    }

    return NextResponse.json({ programs, students })
  } catch (error) {
    console.error('Error in teacher sparta GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { user, error: authError } = await requireTeacher(supabase)
    if (authError) return authError

    const body = await request.json()
    const { userId, deckIds, startDate, endDate, goalMastery, memo } = body as {
      userId?: string
      deckIds?: string[]
      startDate?: string
      endDate?: string
      targetCardCount?: number | null
      goalMastery?: string
      memo?: string
    }
    const targetCardCount = body.targetCardCount ?? null

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }
    const validationError = validateSpartaInput({ deckIds, startDate, endDate, targetCardCount, goalMastery })
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    const studentIds = await getTeacherStudentIds(supabase, user.id)
    if (!studentIds.includes(userId)) {
      return NextResponse.json({ error: 'Student not found in your classes' }, { status: 403 })
    }

    const admin = createAdminClient()
    if (!admin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const deckMaps = await fetchDeckMaps(admin)
    const rootDeckIds = resolveRootDeckIds(deckMaps, deckIds as string[])
    if (!rootDeckIds) {
      return NextResponse.json({ error: 'デッキが見つかりません' }, { status: 404 })
    }

    const baseline = await computeBaseline(
      admin, deckMaps, userId, rootDeckIds, goalMastery as 'stable' | 'mastered'
    )

    const { data: inserted, error } = await admin
      .from('sparta_programs')
      .insert({
        user_id: userId,
        deck_ids: rootDeckIds,
        start_date: startDate,
        end_date: endDate,
        target_card_count: targetCardCount,
        goal_mastery: goalMastery,
        baseline_achieved_count: baseline,
        memo: typeof memo === 'string' && memo.trim() !== '' ? memo.trim() : null,
        created_by: user.id,
      })
      .select('id')
      .single()
    if (error) throw error

    return NextResponse.json({ success: true, id: inserted.id })
  } catch (error) {
    console.error('Error in teacher sparta POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { user, error: authError } = await requireTeacher(supabase)
    if (authError) return authError

    const body = await request.json()
    const { id } = body as { id?: string }
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const admin = createAdminClient()
    if (!admin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const { data: existing, error: readError } = await admin
      .from('sparta_programs')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (readError) throw readError
    if (!existing) {
      return NextResponse.json({ error: 'Program not found' }, { status: 404 })
    }
    const row = existing as SpartaProgramRow

    const studentIds = await getTeacherStudentIds(supabase, user.id)
    if (!studentIds.includes(row.user_id)) {
      return NextResponse.json({ error: 'Student not found in your classes' }, { status: 403 })
    }

    // 変更後の値（未指定は現状維持）
    const deckIds = (body.deckIds as string[] | undefined) ?? row.deck_ids
    const startDate = (body.startDate as string | undefined) ?? row.start_date
    const endDate = (body.endDate as string | undefined) ?? row.end_date
    const targetCardCount =
      'targetCardCount' in body ? ((body.targetCardCount as number | null) ?? null) : row.target_card_count
    const goalMastery = (body.goalMastery as string | undefined) ?? row.goal_mastery
    const memo = 'memo' in body
      ? (typeof body.memo === 'string' && body.memo.trim() !== '' ? (body.memo as string).trim() : null)
      : row.memo
    const status = (body.status as string | undefined) ?? row.status

    if (status !== 'active' && status !== 'canceled') {
      return NextResponse.json({ error: 'status が正しくありません' }, { status: 400 })
    }
    const validationError = validateSpartaInput({ deckIds, startDate, endDate, targetCardCount, goalMastery })
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    const deckMaps = await fetchDeckMaps(admin)
    const rootDeckIds = resolveRootDeckIds(deckMaps, deckIds)
    if (!rootDeckIds) {
      return NextResponse.json({ error: 'デッキが見つかりません' }, { status: 404 })
    }

    // 対象デッキか習得基準が変わったら、進捗の起点（登録時習得数）も測り直す
    const decksChanged =
      rootDeckIds.length !== row.deck_ids.length ||
      rootDeckIds.some(d => !row.deck_ids.includes(d))
    const goalChanged = goalMastery !== row.goal_mastery
    const baseline =
      decksChanged || goalChanged
        ? await computeBaseline(admin, deckMaps, row.user_id, rootDeckIds, goalMastery as 'stable' | 'mastered')
        : row.baseline_achieved_count

    const { error: updateError } = await admin
      .from('sparta_programs')
      .update({
        deck_ids: rootDeckIds,
        start_date: startDate,
        end_date: endDate,
        target_card_count: targetCardCount,
        goal_mastery: goalMastery,
        baseline_achieved_count: baseline,
        memo,
        status,
      })
      .eq('id', id)
    if (updateError) throw updateError

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in teacher sparta PUT:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { user, error: authError } = await requireTeacher(supabase)
    if (authError) return authError

    const id = request.nextUrl.searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const admin = createAdminClient()
    if (!admin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const { data: existing } = await admin
      .from('sparta_programs')
      .select('id, user_id')
      .eq('id', id)
      .maybeSingle()
    if (!existing) {
      return NextResponse.json({ error: 'Program not found' }, { status: 404 })
    }

    const studentIds = await getTeacherStudentIds(supabase, user.id)
    if (!studentIds.includes(existing.user_id as string)) {
      return NextResponse.json({ error: 'Student not found in your classes' }, { status: 403 })
    }

    const { error } = await admin.from('sparta_programs').delete().eq('id', id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in teacher sparta DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
