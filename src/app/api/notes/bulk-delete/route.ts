import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/api/auth'

// POST /api/notes/bulk-delete - Delete multiple notes
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { user, error: authError } = await requireAuth(supabase)
    if (authError) return authError

    const body = await request.json()
    const { noteIds, deckId } = body as { noteIds: string[]; deckId: string }

    if (!noteIds || !Array.isArray(noteIds) || noteIds.length === 0) {
      return NextResponse.json({ error: 'noteIds is required' }, { status: 400 })
    }

    if (!deckId) {
      return NextResponse.json({ error: 'deckId is required' }, { status: 400 })
    }

    if (noteIds.length > 500) {
      return NextResponse.json({ error: 'Maximum 500 notes per request' }, { status: 400 })
    }

    // Verify user owns the deck
    const { data: deck, error: deckError } = await supabase
      .from('decks')
      .select('owner_id')
      .eq('id', deckId)
      .single()

    if (deckError || !deck) {
      return NextResponse.json({ error: 'Deck not found' }, { status: 404 })
    }

    if (deck.owner_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Delete notes belonging to this deck (CASCADE handles cards, card_states, review_logs)
    const { error: deleteError, count } = await supabase
      .from('notes')
      .delete({ count: 'exact' })
      .in('id', noteIds)
      .eq('deck_id', deckId)

    if (deleteError) {
      console.error('Error bulk deleting notes:', deleteError)
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, deletedCount: count })
  } catch (error) {
    console.error('Error in POST /api/notes/bulk-delete:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
