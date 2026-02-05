import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/api/auth'

// POST /api/notes/bulk-tags - Bulk add/remove tags for multiple notes
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { user, error: authError } = await requireAuth(supabase)
    if (authError) return authError

    const body = await request.json()
    const { noteIds, deckId, addTags, removeTags } = body

    if (!Array.isArray(noteIds) || noteIds.length === 0) {
      return NextResponse.json({ error: 'noteIds is required' }, { status: 400 })
    }

    if (!deckId) {
      return NextResponse.json({ error: 'deckId is required' }, { status: 400 })
    }

    const hasAddTags = Array.isArray(addTags) && addTags.length > 0
    const hasRemoveTags = Array.isArray(removeTags) && removeTags.length > 0

    if (!hasAddTags && !hasRemoveTags) {
      return NextResponse.json({ error: 'addTags or removeTags is required' }, { status: 400 })
    }

    // Verify deck ownership
    const { data: deck } = await supabase
      .from('decks')
      .select('id, owner_id')
      .eq('id', deckId)
      .single()

    if (!deck) {
      return NextResponse.json({ error: 'Deck not found' }, { status: 404 })
    }

    if (deck.owner_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Call the RPC function
    const { error: rpcError } = await supabase.rpc('bulk_update_tags', {
      p_note_ids: noteIds,
      p_add_tags: hasAddTags ? addTags : [],
      p_remove_tags: hasRemoveTags ? removeTags : [],
    })

    if (rpcError) {
      console.error('Error in bulk_update_tags:', rpcError)
      return NextResponse.json({ error: rpcError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, count: noteIds.length })
  } catch (error) {
    console.error('Error in POST /api/notes/bulk-tags:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
