import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth, canManageDeck } from '@/lib/api/auth'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * サブデッキへの継承配布（022_subdeck_assignments.sql）:
 * 親デッキを配布したら子孫デッキにも source_deck_id 付きの配布行を作る。
 * 直接配布（source_deck_id NULL）と継承配布を区別し、解除は配布元でのみ行う。
 */

/** 子孫デッキに継承配布行を作成（既存はスキップ・冪等） */
async function propagateToDescendants(
  supabase: SupabaseClient,
  deckId: string,
  target: { classId?: string; userId?: string }
): Promise<void> {
  const { data: descendantIds } = await supabase.rpc('get_descendant_deck_ids', {
    p_deck_id: deckId,
  })
  const ids: string[] = (descendantIds || []).map((d: { id?: string } | string) =>
    typeof d === 'string' ? d : d.id!
  )
  if (ids.length === 0) return

  // 既に同一ターゲットの行があるデッキを除外
  const existingQuery = supabase
    .from('deck_assignments')
    .select('deck_id')
    .in('deck_id', ids)
  if (target.classId) existingQuery.eq('class_id', target.classId)
  else existingQuery.eq('user_id', target.userId!)
  const { data: existing } = await existingQuery
  const existingDeckIds = new Set((existing || []).map(e => e.deck_id))

  const rows = ids
    .filter(id => !existingDeckIds.has(id))
    .map(id => ({
      deck_id: id,
      class_id: target.classId ?? null,
      user_id: target.userId ?? null,
      source_deck_id: deckId,
    }))

  if (rows.length > 0) {
    const { error } = await supabase.from('deck_assignments').insert(rows)
    // 23505 = 一意制約違反（並行配布のレース）。冪等なので無視してよい
    if (error && error.code !== '23505') {
      console.error('Error propagating assignments to subdecks:', error)
    }
  }

  // 子孫の is_distributed を同期
  await supabase
    .from('decks')
    .update({ is_distributed: true })
    .in('id', ids)
    .eq('is_distributed', false)
}

// GET /api/deck-assignments?deckId=xxx - Get assignments for a deck
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { user, error: authError } = await requireAuth(supabase)
    if (authError) return authError

    const { searchParams } = new URL(request.url)
    const deckId = searchParams.get('deckId')

    if (!deckId) {
      return NextResponse.json({ error: 'Deck ID is required' }, { status: 400 })
    }

    // Verify user owns the deck
    const { data: deck } = await supabase
      .from('decks')
      .select('id, owner_id')
      .eq('id', deckId)
      .single()

    if (!deck || !(await canManageDeck(supabase, user.id, deck.owner_id))) {
      return NextResponse.json({ error: 'Deck not found or access denied' }, { status: 404 })
    }

    // Get assignments with class and user details
    const { data: assignments, error } = await supabase
      .from('deck_assignments')
      .select(`
        id,
        deck_id,
        class_id,
        user_id,
        assigned_at,
        source_deck_id,
        classes:class_id (
          id,
          name
        ),
        profiles:user_id (
          id,
          name,
          email
        )
      `)
      .eq('deck_id', deckId)

    if (error) {
      console.error('Error fetching assignments:', error)
      return NextResponse.json({ error: 'Failed to fetch assignments' }, { status: 500 })
    }

    // Transform data - Supabase joins return single objects, but TS infers arrays
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transformedAssignments = assignments?.map((a: any) => ({
      id: a.id,
      deckId: a.deck_id,
      assignedAt: a.assigned_at,
      type: a.class_id ? 'class' : 'individual',
      // 継承配布（親デッキの配布から自動作成された行）は解除不可＝配布元で解除する
      inherited: !!a.source_deck_id,
      target: a.class_id
        ? { id: a.classes?.id, name: a.classes?.name }
        : { id: a.profiles?.id, name: a.profiles?.name, email: a.profiles?.email },
    })) || []

    return NextResponse.json({ assignments: transformedAssignments })
  } catch (error) {
    console.error('Error in deck-assignments API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/deck-assignments - Create a new assignment
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { user, error: authError } = await requireAuth(supabase)
    if (authError) return authError

    const body = await request.json()
    const { deckId, classId, userId } = body

    if (!deckId) {
      return NextResponse.json({ error: 'Deck ID is required' }, { status: 400 })
    }

    if (!classId && !userId) {
      return NextResponse.json({ error: 'Either classId or userId is required' }, { status: 400 })
    }

    if (classId && userId) {
      return NextResponse.json({ error: 'Cannot specify both classId and userId' }, { status: 400 })
    }

    // Verify user owns the deck
    const { data: deck } = await supabase
      .from('decks')
      .select('id, owner_id')
      .eq('id', deckId)
      .single()

    if (!deck || !(await canManageDeck(supabase, user.id, deck.owner_id))) {
      return NextResponse.json({ error: 'Deck not found or access denied' }, { status: 404 })
    }

    // Check if assignment already exists
    const existingQuery = supabase
      .from('deck_assignments')
      .select('id')
      .eq('deck_id', deckId)

    if (classId) {
      existingQuery.eq('class_id', classId)
    } else {
      existingQuery.eq('user_id', userId)
    }

    const { data: existing } = await existingQuery.maybeSingle()

    let assignment = existing
    if (!existing) {
      // Create assignment（直接配布 = source_deck_id なし）
      const insertData: { deck_id: string; class_id?: string; user_id?: string } = {
        deck_id: deckId,
      }

      if (classId) {
        insertData.class_id = classId
      } else {
        insertData.user_id = userId
      }

      const { data: created, error: insertError } = await supabase
        .from('deck_assignments')
        .insert(insertData)
        .select()
        .single()

      if (insertError) {
        console.error('Error creating assignment:', insertError)
        return NextResponse.json({ error: 'Failed to create assignment' }, { status: 500 })
      }
      assignment = created
    }
    // 既存でも 400 にせず続行＝サブデッキへの伝播を自己修復できる

    // Update deck's is_distributed flag
    await supabase
      .from('decks')
      .update({ is_distributed: true })
      .eq('id', deckId)

    // サブデッキにも継承配布（親と一緒に配る）
    await propagateToDescendants(supabase, deckId, { classId, userId })

    return NextResponse.json({ success: true, assignment })
  } catch (error) {
    console.error('Error in deck-assignments API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/deck-assignments?id=xxx - Delete an assignment
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { user, error: authError } = await requireAuth(supabase)
    if (authError) return authError

    const { searchParams } = new URL(request.url)
    const assignmentId = searchParams.get('id')

    if (!assignmentId) {
      return NextResponse.json({ error: 'Assignment ID is required' }, { status: 400 })
    }

    // Get assignment to verify ownership
    const { data: assignment } = await supabase
      .from('deck_assignments')
      .select('id, deck_id, class_id, user_id, source_deck_id')
      .eq('id', assignmentId)
      .single()

    if (!assignment) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })
    }

    // 継承行は配布元デッキでしか解除できない（UI 側でもボタン無効化）
    if (assignment.source_deck_id) {
      return NextResponse.json(
        { error: 'この配布は親デッキから継承されています。親デッキの配布設定から解除してください。' },
        { status: 400 }
      )
    }

    // Verify user owns the deck
    const { data: deck } = await supabase
      .from('decks')
      .select('id, owner_id')
      .eq('id', assignment.deck_id)
      .single()

    if (!deck || !(await canManageDeck(supabase, user.id, deck.owner_id))) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // 子孫の継承行を先に削除（同一ターゲットのみ）
    const { data: descendantIds } = await supabase.rpc('get_descendant_deck_ids', {
      p_deck_id: assignment.deck_id,
    })
    const descIds: string[] = (descendantIds || []).map((d: { id?: string } | string) =>
      typeof d === 'string' ? d : d.id!
    )
    if (descIds.length > 0) {
      const cascadeQuery = supabase
        .from('deck_assignments')
        .delete()
        .in('deck_id', descIds)
        .eq('source_deck_id', assignment.deck_id)
      if (assignment.class_id) cascadeQuery.eq('class_id', assignment.class_id)
      else cascadeQuery.eq('user_id', assignment.user_id)
      const { error: cascadeError } = await cascadeQuery
      if (cascadeError) {
        console.error('Error deleting inherited assignments:', cascadeError)
      }
    }

    // Delete assignment
    const { error } = await supabase
      .from('deck_assignments')
      .delete()
      .eq('id', assignmentId)

    if (error) {
      console.error('Error deleting assignment:', error)
      return NextResponse.json({ error: 'Failed to delete assignment' }, { status: 500 })
    }

    // is_distributed の再計算（本体＋子孫のうち、配布行が残っていないデッキを false に）
    const affectedIds = [assignment.deck_id, ...descIds]
    const { data: remaining } = await supabase
      .from('deck_assignments')
      .select('deck_id')
      .in('deck_id', affectedIds)
    const stillAssigned = new Set((remaining || []).map(r => r.deck_id))
    const clearedIds = affectedIds.filter(id => !stillAssigned.has(id))
    if (clearedIds.length > 0) {
      await supabase
        .from('decks')
        .update({ is_distributed: false })
        .in('id', clearedIds)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in deck-assignments API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
