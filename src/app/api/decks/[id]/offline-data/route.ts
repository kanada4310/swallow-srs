/**
 * GET /api/decks/[id]/offline-data - デッキの全データをオフラインキャッシュ用に取得
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/api/auth'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: deckId } = await params
  const supabase = await createClient()

  const { user, error: authError } = await requireAuth(supabase)
  if (authError) return authError

  // Get deck
  const { data: deck, error: deckError } = await supabase
    .from('decks')
    .select('*')
    .eq('id', deckId)
    .single()

  if (deckError || !deck) {
    return NextResponse.json({ error: 'Deck not found' }, { status: 404 })
  }

  // Get notes, cards, note types, card templates, card states in parallel
  const [
    { data: notes },
    { data: cards },
    { data: cardStates },
  ] = await Promise.all([
    supabase.from('notes').select('*').eq('deck_id', deckId),
    supabase.from('cards').select('*').eq('deck_id', deckId),
    supabase.from('card_states').select('*').eq('user_id', user.id),
  ])

  // Get unique note type IDs from notes
  const noteTypeIds = Array.from(
    new Set((notes || []).map(n => n.note_type_id))
  )

  let noteTypes: unknown[] = []
  let cardTemplates: unknown[] = []

  if (noteTypeIds.length > 0) {
    const [{ data: nt }, { data: ct }] = await Promise.all([
      supabase.from('note_types').select('*').in('id', noteTypeIds),
      supabase.from('card_templates').select('*').in('note_type_id', noteTypeIds),
    ])
    noteTypes = nt || []
    cardTemplates = ct || []
  }

  // Filter card states to only cards in this deck
  const deckCardIds = new Set((cards || []).map(c => c.id))
  const filteredCardStates = (cardStates || []).filter(cs =>
    deckCardIds.has(cs.card_id)
  )

  return NextResponse.json({
    deck,
    notes: notes || [],
    cards: cards || [],
    noteTypes,
    cardTemplates,
    cardStates: filteredCardStates,
  })
}
