import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/api/auth'
import { validateDeckSettings } from '@/lib/srs/settings-validation'

// PUT /api/decks/[id] - Update a deck (name, settings, etc.)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: deckId } = await params
    const supabase = await createClient()

    const { user, error: authError } = await requireAuth(supabase)
    if (authError) return authError

    const body = await request.json()
    const { name, settings } = body

    // Get deck and verify ownership
    const { data: deck, error: deckError } = await supabase
      .from('decks')
      .select('id, owner_id')
      .eq('id', deckId)
      .single()

    if (deckError || !deck) {
      return NextResponse.json({ error: 'Deck not found' }, { status: 404 })
    }

    if (deck.owner_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Validate settings if provided
    if (settings) {
      const errors = validateDeckSettings(settings)
      if (errors.length > 0) {
        return NextResponse.json({ error: errors.map(e => e.message).join(', ') }, { status: 400 })
      }
    }

    // Build update object
    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name
    if (settings !== undefined) updateData.settings = settings

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    // Update deck
    const { data: updatedDeck, error: updateError } = await supabase
      .from('decks')
      .update(updateData)
      .eq('id', deckId)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating deck:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ deck: updatedDeck })
  } catch (error) {
    console.error('Error in PUT /api/decks/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

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

    // Check for child decks
    const { count: childCount } = await supabase
      .from('decks')
      .select('id', { count: 'exact', head: true })
      .eq('parent_deck_id', deckId)

    if (childCount && childCount > 0) {
      return NextResponse.json({
        error: `このデッキには${childCount}個のサブデッキがあります。先にサブデッキを削除してください。`,
      }, { status: 400 })
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
