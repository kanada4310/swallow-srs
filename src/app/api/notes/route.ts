import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/api/auth'
import { CLOZE_NOTE_TYPE_ID } from '@/lib/constants'
import { countClozeDeletions } from '@/lib/srs/cloze'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { user, error: authError } = await requireAuth(supabase)
    if (authError) return authError

    const body = await request.json()
    const { deckId, noteTypeId, fieldValues, sourceInfo, tags } = body

    // Validate required fields
    if (!deckId || !noteTypeId || !fieldValues) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
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
      return NextResponse.json({ error: 'Only deck owners can add notes' }, { status: 403 })
    }

    // Get note type and its templates
    const { data: noteType } = await supabase
      .from('note_types')
      .select('id, name, fields')
      .eq('id', noteTypeId)
      .single()

    if (!noteType) {
      return NextResponse.json({ error: 'Note type not found' }, { status: 404 })
    }

    const { data: templates } = await supabase
      .from('card_templates')
      .select('id, ordinal')
      .eq('note_type_id', noteTypeId)
      .order('ordinal')

    if (!templates || templates.length === 0) {
      return NextResponse.json({ error: 'No templates found for note type' }, { status: 500 })
    }

    // Create note (tags column may not exist if migration 008 hasn't been run)
    const insertPayload: Record<string, unknown> = {
      deck_id: deckId,
      note_type_id: noteTypeId,
      field_values: fieldValues,
      source_info: sourceInfo || null,
    }
    if (Array.isArray(tags) && tags.length > 0) {
      insertPayload.tags = tags
    }

    let { data: note, error: noteError } = await supabase
      .from('notes')
      .insert(insertPayload)
      .select()
      .single()

    // Fallback: if tags column doesn't exist, retry without it
    if (noteError && noteError.code === 'PGRST204' && insertPayload.tags) {
      delete insertPayload.tags
      const retry = await supabase
        .from('notes')
        .insert(insertPayload)
        .select()
        .single()
      note = retry.data
      noteError = retry.error
    }

    if (noteError) {
      console.error('Error creating note:', noteError)
      return NextResponse.json({ error: 'Failed to create note' }, { status: 500 })
    }

    // Create cards based on note type
    const cardsToCreate: Array<{ note_id: string; deck_id: string; template_index: number }> = []

    if (noteTypeId === CLOZE_NOTE_TYPE_ID) {
      // For Cloze notes, create one card per cloze deletion number
      const textField = fieldValues['Text'] || ''
      const clozeNumbers = countClozeDeletions(textField)

      if (clozeNumbers.length === 0) {
        // If no cloze deletions found, create at least one card
        cardsToCreate.push({
          note_id: note.id,
          deck_id: deckId,
          template_index: 0,
        })
      } else {
        // Create one card per cloze number
        for (const num of clozeNumbers) {
          cardsToCreate.push({
            note_id: note.id,
            deck_id: deckId,
            template_index: num - 1, // 0-indexed
          })
        }
      }
    } else {
      // For Basic and other note types, create one card per template
      for (const template of templates) {
        cardsToCreate.push({
          note_id: note.id,
          deck_id: deckId,
          template_index: template.ordinal,
        })
      }
    }

    // Insert cards
    const { data: cards, error: cardsError } = await supabase
      .from('cards')
      .insert(cardsToCreate)
      .select()

    if (cardsError) {
      console.error('Error creating cards:', cardsError)
      // Try to clean up the note
      await supabase.from('notes').delete().eq('id', note.id)
      return NextResponse.json({ error: 'Failed to create cards' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      note,
      cards,
      cardCount: cards?.length || 0,
    })
  } catch (error) {
    console.error('Error in note creation API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
