import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/api/auth'

// DELETE /api/notes/[id] - Delete a single note
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { user, error: authError } = await requireAuth(supabase)
    if (authError) return authError

    // Get the note with its deck to verify ownership
    const { data: note, error: fetchError } = await supabase
      .from('notes')
      .select('id, deck_id, decks!inner(owner_id)')
      .eq('id', id)
      .single()

    if (fetchError || !note) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 })
    }

    // Check if user owns the deck
    const deck = note.decks as unknown as { owner_id: string }
    if (deck.owner_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Delete note (CASCADE will handle cards, card_states, review_logs)
    const { error: deleteError } = await supabase
      .from('notes')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('Error deleting note:', deleteError)
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/notes/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
