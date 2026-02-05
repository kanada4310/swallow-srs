import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/api/auth'

// DELETE /api/decks/[id] - Delete a deck and all its contents
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: deckId } = await params
    const supabase = await createClient()

    const { user, error: authError } = await requireAuth(supabase)
    if (authError) return authError

    // Get deck and verify ownership
    const { data: deck, error: deckError } = await supabase
      .from('decks')
      .select('id, name, owner_id')
      .eq('id', deckId)
      .single()

    if (deckError || !deck) {
      return NextResponse.json({ error: 'Deck not found' }, { status: 404 })
    }

    if (deck.owner_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Check for active assignments
    const { count: assignmentCount } = await supabase
      .from('deck_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('deck_id', deckId)

    if (assignmentCount && assignmentCount > 0) {
      return NextResponse.json({
        error: `このデッキは${assignmentCount}件の配布先があります。先に配布を解除してください。`,
      }, { status: 400 })
    }

    // Delete deck (CASCADE handles notes → cards → card_states, review_logs)
    const { error: deleteError } = await supabase
      .from('decks')
      .delete()
      .eq('id', deckId)

    if (deleteError) {
      console.error('Error deleting deck:', deleteError)
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/decks/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
