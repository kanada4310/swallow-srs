/**
 * POST /api/sync/pull - サーバーから最新データを取得
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface PullRequest {
  userId: string
  lastSyncAt?: string
  deckIds?: string[] // Optional: only sync specific decks
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  // Get current user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: PullRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Verify the request is for the current user
  if (body.userId !== user.id) {
    return NextResponse.json({ error: 'User ID mismatch' }, { status: 403 })
  }

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

  // Get assigned decks through deck_assignments
  const { data: assignments } = await supabase
    .from('deck_assignments')
    .select('deck_id')
    .eq('user_id', user.id)

  const assignedDeckIds = assignments?.map((a) => a.deck_id) ?? []

  let assignedDecks: typeof ownDecks = []
  if (assignedDeckIds.length > 0) {
    const { data } = await supabase
      .from('decks')
      .select('*')
      .in('id', assignedDeckIds)

    assignedDecks = data ?? []
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

  return NextResponse.json(response)
}
