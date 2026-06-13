/**
 * POST /api/sync/pull - サーバーから最新データを取得
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminSupabase } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/api/auth'

interface PullRequest {
  userId: string
  lastSyncAt?: string
  deckIds?: string[] // Optional: only sync specific decks
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { user, error: authError } = await requireAuth(supabase)
  if (authError) return authError

  let body: PullRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Use authenticated user ID (ignore body.userId for security)
  // Client may send stale userId from cached IndexedDB profile

  const lastSyncAt = body.lastSyncAt ? new Date(body.lastSyncAt) : null
  const response: Record<string, unknown> = {}

  // Fetch profile (always include for initialization)
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (profile) {
    response.profiles = [profile]
  }

  // Fetch system note types
  let noteTypesQuery = supabase
    .from('note_types')
    .select('*')
    .or(`is_system.eq.true,owner_id.eq.${user.id}`)

  if (lastSyncAt) {
    noteTypesQuery = noteTypesQuery.gt('updated_at', lastSyncAt.toISOString())
  }

  const { data: noteTypes } = await noteTypesQuery

  if (noteTypes && noteTypes.length > 0) {
    response.noteTypes = noteTypes

    // Fetch card templates for these note types
    const noteTypeIds = noteTypes.map((nt) => nt.id)
    const { data: cardTemplates } = await supabase
      .from('card_templates')
      .select('*')
      .in('note_type_id', noteTypeIds)

    if (cardTemplates) {
      response.cardTemplates = cardTemplates
    }
  }

  // Fetch user's own decks + assigned decks
  const { data: ownDecks } = await supabase
    .from('decks')
    .select('*')
    .eq('owner_id', user.id)

  // Get assigned decks through deck_assignments (direct user + class membership)
  const { data: memberAssignments } = await supabase
    .from('class_members')
    .select('class_id')
    .eq('user_id', user.id)

  const userClassIdsForAssign = (memberAssignments || []).map(m => m.class_id)

  const assignFilters = [`user_id.eq.${user.id}`]
  if (userClassIdsForAssign.length > 0) {
    assignFilters.push(`class_id.in.(${userClassIdsForAssign.join(',')})`)
  }

  const { data: assignments } = await supabase
    .from('deck_assignments')
    .select('deck_id')
    .or(assignFilters.join(','))

  const assignedDeckIds = assignments?.map((a) => a.deck_id) ?? []

  let assignedDecks: typeof ownDecks = []
  if (assignedDeckIds.length > 0) {
    const { data } = await supabase
      .from('decks')
      .select('*')
      .in('id', assignedDeckIds)

    assignedDecks = data ?? []
  }

  // Also fetch child decks of assigned decks (subdecks auto-inherit distribution)
  // Use admin client to bypass RLS — subdecks don't have their own deck_assignments,
  // so the normal RLS policy "is_deck_assigned_to_user" would block them.
  if (assignedDeckIds.length > 0) {
    const adminClient = createAdminSupabase(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const { data: childDecks } = await adminClient
      .from('decks')
      .select('*')
      .in('parent_deck_id', assignedDeckIds)

    if (childDecks && childDecks.length > 0) {
      assignedDecks = [...(assignedDecks ?? []), ...childDecks]

      // Also fetch grandchildren (depth 2)
      const childIds = childDecks.map(d => d.id)
      const { data: grandchildDecks } = await adminClient
        .from('decks')
        .select('*')
        .in('parent_deck_id', childIds)

      if (grandchildDecks && grandchildDecks.length > 0) {
        assignedDecks = [...assignedDecks, ...grandchildDecks]
      }
    }
  }

  const allDecks = [...(ownDecks ?? []), ...assignedDecks]
  const uniqueDecks = Array.from(new Map(allDecks.map((d) => [d.id, d])).values())

  // Filter by lastSyncAt if provided
  let decksToReturn = uniqueDecks
  if (lastSyncAt) {
    decksToReturn = uniqueDecks.filter(
      (d) => new Date(d.updated_at) > lastSyncAt
    )
  }

  if (decksToReturn.length > 0) {
    response.decks = decksToReturn
  }

  // Fetch notes and cards for all decks
  const deckIds = body.deckIds ?? uniqueDecks.map((d) => d.id)

  if (deckIds.length > 0) {
    // Fetch notes — paginate (PostgREST caps responses at 1000 rows, so large
    // decks like 中学英単語(6858) would otherwise sync only the first 1000 notes).
    const PAGE = 1000

    const notes: Record<string, unknown>[] = []
    for (let from = 0; ; from += PAGE) {
      let q = supabase.from('notes').select('*').in('deck_id', deckIds)
      if (lastSyncAt) q = q.gt('updated_at', lastSyncAt.toISOString())
      const { data } = await q.order('id', { ascending: true }).range(from, from + PAGE - 1)
      if (!data || data.length === 0) break
      notes.push(...(data as Record<string, unknown>[]))
      if (data.length < PAGE) break
    }
    if (notes.length > 0) {
      response.notes = notes
    }

    // Fetch cards — paginate for the same reason.
    const cards: Record<string, unknown>[] = []
    for (let from = 0; ; from += PAGE) {
      let q = supabase.from('cards').select('*').in('deck_id', deckIds)
      if (lastSyncAt) q = q.gt('updated_at', lastSyncAt.toISOString())
      const { data } = await q.order('id', { ascending: true }).range(from, from + PAGE - 1)
      if (!data || data.length === 0) break
      cards.push(...(data as Record<string, unknown>[]))
      if (data.length < PAGE) break
    }
    if (cards.length > 0) {
      response.cards = cards
    }
  }

  // Fetch card states for the user — paginate (a heavy user can exceed 1000 states).
  const cardStates: Record<string, unknown>[] = []
  for (let from = 0; ; from += 1000) {
    let q = supabase.from('card_states').select('*').eq('user_id', user.id)
    if (lastSyncAt) q = q.gt('updated_at', lastSyncAt.toISOString())
    const { data } = await q.order('card_id', { ascending: true }).range(from, from + 999)
    if (!data || data.length === 0) break
    cardStates.push(...(data as Record<string, unknown>[]))
    if (data.length < 1000) break
  }

  if (cardStates.length > 0) {
    response.cardStates = cardStates
  }

  // Fetch user_deck_settings for the user
  const { data: userDeckSettings } = await supabase
    .from('user_deck_settings')
    .select('*')
    .eq('user_id', user.id)

  if (userDeckSettings && userDeckSettings.length > 0) {
    response.userDeckSettings = userDeckSettings
  }

  // Fetch classes (teacher's own classes + billing-synced classes + classes user is a member of)
  const { data: teacherClasses } = await supabase
    .from('classes')
    .select('*')
    .or(`teacher_id.eq.${user.id},billing_template_id.not.is.null`)

  const { data: membershipClasses } = await supabase
    .from('class_members')
    .select('class_id, classes(*)')
    .eq('user_id', user.id)

  const allClasses = [
    ...(teacherClasses || []),
    ...((membershipClasses || []) as unknown as Array<{ class_id: string; classes: Record<string, unknown> | null }>)
      .map(m => m.classes)
      .filter((c): c is Record<string, unknown> => c !== null),
  ]
  const uniqueClasses = Array.from(new Map(allClasses.map(c => [c.id, c])).values())

  if (uniqueClasses.length > 0) {
    response.classes = uniqueClasses

    // Fetch class members for these classes
    const classIds = uniqueClasses.map(c => c.id as string)
    const { data: classMembers } = await supabase
      .from('class_members')
      .select('*')
      .in('class_id', classIds)

    if (classMembers && classMembers.length > 0) {
      response.classMembers = classMembers
    }
  }

  // Fetch deck_assignments relevant to user
  // (assignments to user directly or to classes user belongs to)
  const userClassIds = (membershipClasses || []).map((m: { class_id: string }) => m.class_id)
  const assignmentFilters = [`user_id.eq.${user.id}`]
  if (userClassIds.length > 0) {
    assignmentFilters.push(`class_id.in.(${userClassIds.join(',')})`)
  }
  // Also get assignments for decks the user owns
  const ownDeckIds = (ownDecks || []).map(d => d.id)
  if (ownDeckIds.length > 0) {
    assignmentFilters.push(`deck_id.in.(${ownDeckIds.join(',')})`)
  }

  const { data: deckAssignments } = await supabase
    .from('deck_assignments')
    .select('*')
    .or(assignmentFilters.join(','))

  if (deckAssignments && deckAssignments.length > 0) {
    response.deckAssignments = deckAssignments
  }

  return NextResponse.json(response)
}
