/**
 * POST /api/sync/pull - サーバーから最新データを取得
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
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
  const { data: memberAssignments, error: memberError } = await supabase
    .from('class_members')
    .select('class_id')
    .eq('user_id', user.id)

  console.log(`[pull] user=${user.id} class_members=${memberAssignments?.length ?? 0} error=${memberError?.message ?? 'none'}`)

  const userClassIdsForAssign = (memberAssignments || []).map(m => m.class_id)

  const assignFilters = [`user_id.eq.${user.id}`]
  if (userClassIdsForAssign.length > 0) {
    assignFilters.push(`class_id.in.(${userClassIdsForAssign.join(',')})`)
  }

  const { data: assignments, error: assignError } = await supabase
    .from('deck_assignments')
    .select('deck_id')
    .or(assignFilters.join(','))

  console.log(`[pull] user=${user.id} classIds=${JSON.stringify(userClassIdsForAssign)} assignments=${assignments?.length ?? 0} assignError=${assignError?.message ?? 'none'}`)

  const assignedDeckIds = assignments?.map((a) => a.deck_id) ?? []

  let assignedDecks: typeof ownDecks = []
  if (assignedDeckIds.length > 0) {
    const { data, error: deckError } = await supabase
      .from('decks')
      .select('*')
      .in('id', assignedDeckIds)

    console.log(`[pull] user=${user.id} assignedDeckIds=${JSON.stringify(assignedDeckIds)} fetchedDecks=${data?.length ?? 0} deckError=${deckError?.message ?? 'none'}`)
    assignedDecks = data ?? []
  }

  // Also fetch child decks of assigned decks (subdecks auto-inherit distribution)
  if (assignedDeckIds.length > 0) {
    const { data: childDecks } = await supabase
      .from('decks')
      .select('*')
      .in('parent_deck_id', assignedDeckIds)

    if (childDecks && childDecks.length > 0) {
      assignedDecks = [...(assignedDecks ?? []), ...childDecks]

      // Also fetch grandchildren (depth 2)
      const childIds = childDecks.map(d => d.id)
      const { data: grandchildDecks } = await supabase
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
    // Fetch notes
    let notesQuery = supabase
      .from('notes')
      .select('*')
      .in('deck_id', deckIds)

    if (lastSyncAt) {
      notesQuery = notesQuery.gt('updated_at', lastSyncAt.toISOString())
    }

    const { data: notes } = await notesQuery

    if (notes && notes.length > 0) {
      response.notes = notes
    }

    // Fetch cards
    let cardsQuery = supabase
      .from('cards')
      .select('*')
      .in('deck_id', deckIds)

    if (lastSyncAt) {
      cardsQuery = cardsQuery.gt('updated_at', lastSyncAt.toISOString())
    }

    const { data: cards } = await cardsQuery

    if (cards && cards.length > 0) {
      response.cards = cards
    }
  }

  // Fetch card states for the user
  let cardStatesQuery = supabase
    .from('card_states')
    .select('*')
    .eq('user_id', user.id)

  if (lastSyncAt) {
    cardStatesQuery = cardStatesQuery.gt('updated_at', lastSyncAt.toISOString())
  }

  const { data: cardStates } = await cardStatesQuery

  if (cardStates && cardStates.length > 0) {
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
