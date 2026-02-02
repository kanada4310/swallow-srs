import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Note type IDs (system note types)
const CLOZE_NOTE_TYPE_ID = '00000000-0000-0000-0000-000000000002'

// Count cloze deletions in text (e.g., {{c1::answer}} -> 1)
function countClozeDeletions(text: string): number[] {
  const regex = /\{\{c(\d+)::/g
  const numbers = new Set<number>()
  let match
  while ((match = regex.exec(text)) !== null) {
    numbers.add(parseInt(match[1], 10))
  }
  return Array.from(numbers).sort((a, b) => a - b)
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { deckId, noteTypeId, fieldValues, sourceInfo } = body

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

    // Create note
    const { data: note, error: noteError } = await supabase
      .from('notes')
      .insert({
        deck_id: deckId,
        note_type_id: noteTypeId,
        field_values: fieldValues,
        source_info: sourceInfo || null,
      })
      .select()
      .single()

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
