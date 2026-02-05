import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/api/auth'
import { CLOZE_NOTE_TYPE_ID } from '@/lib/constants'
import { countClozeDeletions } from '@/lib/srs/cloze'

// PUT /api/notes/[id] - Update a note's field_values
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { user, error: authError } = await requireAuth(supabase)
    if (authError) return authError

    const body = await request.json()
    const { field_values } = body

    if (!field_values || typeof field_values !== 'object') {
      return NextResponse.json({ error: 'field_values is required' }, { status: 400 })
    }

    // Get the note with its deck to verify ownership
    const { data: note, error: fetchError } = await supabase
      .from('notes')
      .select('id, deck_id, note_type_id, field_values, decks!inner(owner_id)')
      .eq('id', id)
      .single()

    if (fetchError || !note) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 })
    }

    const deck = note.decks as unknown as { owner_id: string }
    if (deck.owner_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Update the note's field_values
    const { data: updatedNote, error: updateError } = await supabase
      .from('notes')
      .update({ field_values })
      .eq('id', id)
      .select('id, field_values, note_type_id, generated_content, created_at, cards(id)')
      .single()

    if (updateError) {
      console.error('Error updating note:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Handle Cloze card count changes
    let cardsAdded = 0
    let cardsRemoved = 0
    if (note.note_type_id === CLOZE_NOTE_TYPE_ID) {
      const oldText = (note.field_values as Record<string, string>)['Text'] || ''
      const newText = field_values['Text'] || ''
      const oldClozeNums = countClozeDeletions(oldText)
      const newClozeNums = countClozeDeletions(newText)

      const oldSet = new Set(oldClozeNums)
      const newSet = new Set(newClozeNums)

      // Cloze numbers to add (in new but not old)
      const toAdd = newClozeNums.filter(n => !oldSet.has(n))
      // Cloze numbers to remove (in old but not new)
      const toRemove = oldClozeNums.filter(n => !newSet.has(n))

      if (toAdd.length > 0) {
        const cardsToCreate = toAdd.map(num => ({
          note_id: id,
          deck_id: note.deck_id,
          template_index: num - 1,
        }))
        const { error: insertErr } = await supabase
          .from('cards')
          .insert(cardsToCreate)
        if (insertErr) {
          console.error('Error adding cloze cards:', insertErr)
        } else {
          cardsAdded = toAdd.length
        }
      }

      if (toRemove.length > 0) {
        const templateIndexes = toRemove.map(n => n - 1)
        const { error: deleteErr } = await supabase
          .from('cards')
          .delete()
          .eq('note_id', id)
          .in('template_index', templateIndexes)
        if (deleteErr) {
          console.error('Error removing cloze cards:', deleteErr)
        } else {
          cardsRemoved = toRemove.length
        }
      }
    }

    return NextResponse.json({
      success: true,
      note: updatedNote,
      cardsAdded,
      cardsRemoved,
    })
  } catch (error) {
    console.error('Error in PUT /api/notes/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

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
