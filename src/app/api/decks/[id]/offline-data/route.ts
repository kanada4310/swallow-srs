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

  // Get notes, cards, card states — paginate (PostgREST caps responses at 1000
  // rows; large decks like 中学英単語(6858) would otherwise be truncated).
  const fetchAllBy = async (table: string, col: string, val: string, orderCol: string) => {
    const PAGE = 1000
    const out: Record<string, unknown>[] = []
    for (let from = 0; ; from += PAGE) {
      const { data } = await supabase.from(table).select('*').eq(col, val)
        .order(orderCol, { ascending: true }).range(from, from + PAGE - 1)
      if (!data || data.length === 0) break
      out.push(...(data as Record<string, unknown>[]))
      if (data.length < PAGE) break
    }
    return out
  }

  const [notes, cards, cardStates] = await Promise.all([
    fetchAllBy('notes', 'deck_id', deckId, 'id'),
    fetchAllBy('cards', 'deck_id', deckId, 'id'),
    fetchAllBy('card_states', 'user_id', user.id, 'card_id'),
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
