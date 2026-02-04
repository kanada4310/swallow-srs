import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { CLOZE_NOTE_TYPE_ID } from '@/lib/constants'

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

interface ImportNote {
  fieldValues: Record<string, string>
  sourceInfo?: {
    book?: string
    unit?: number
    number?: number
  }
}

interface ImportRequest {
  deckId: string
  noteTypeId: string
  notes: ImportNote[]
}

interface ImportResult {
  success: boolean
  totalNotes: number
  createdNotes: number
  createdCards: number
  errors: Array<{
    row: number
    message: string
  }>
}

export async function POST(request: NextRequest): Promise<NextResponse<ImportResult | { error: string }>> {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: ImportRequest = await request.json()
    const { deckId, noteTypeId, notes } = body

    // Validate required fields
    if (!deckId || !noteTypeId || !notes || !Array.isArray(notes)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (notes.length === 0) {
      return NextResponse.json({ error: 'No notes to import' }, { status: 400 })
    }

    if (notes.length > 10000) {
      return NextResponse.json({ error: 'Maximum 10000 notes per import' }, { status: 400 })
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

    // Validate required fields in note type
    interface NoteTypeField {
      name: string
      ord: number
    }
    const requiredFields = (noteType.fields as NoteTypeField[])
      .filter(f => f.ord === 0)
      .map(f => f.name)

    // Process notes in batches
    const BATCH_SIZE = 100
    const errors: Array<{ row: number; message: string }> = []
    let createdNotes = 0
    let createdCards = 0

    for (let batchStart = 0; batchStart < notes.length; batchStart += BATCH_SIZE) {
      const batch = notes.slice(batchStart, batchStart + BATCH_SIZE)
      const notesToInsert: Array<{
        deck_id: string
        note_type_id: string
        field_values: Record<string, string>
        source_info: unknown
      }> = []
      const batchRowNumbers: number[] = []

      // Validate each note in batch
      for (let i = 0; i < batch.length; i++) {
        const note = batch[i]
        const rowNumber = batchStart + i + 1 // 1-indexed

        // Check required fields
        const missingFields = requiredFields.filter(
          field => !note.fieldValues[field]?.trim()
        )

        if (missingFields.length > 0) {
          errors.push({
            row: rowNumber,
            message: `必須フィールドが空です: ${missingFields.join(', ')}`,
          })
          continue
        }

        notesToInsert.push({
          deck_id: deckId,
          note_type_id: noteTypeId,
          field_values: note.fieldValues,
          source_info: note.sourceInfo || null,
        })
        batchRowNumbers.push(rowNumber)
      }

      if (notesToInsert.length === 0) continue

      // Insert notes
      const { data: insertedNotes, error: notesError } = await supabase
        .from('notes')
        .insert(notesToInsert)
        .select('id, field_values')

      if (notesError) {
        console.error('Error creating notes:', notesError)
        // Mark all notes in this batch as failed
        for (const rowNumber of batchRowNumbers) {
          errors.push({
            row: rowNumber,
            message: 'データベースエラー',
          })
        }
        continue
      }

      if (!insertedNotes || insertedNotes.length === 0) continue

      createdNotes += insertedNotes.length

      // Create cards for each note
      const cardsToInsert: Array<{
        note_id: string
        deck_id: string
        template_index: number
      }> = []

      for (const note of insertedNotes) {
        if (noteTypeId === CLOZE_NOTE_TYPE_ID) {
          // For Cloze notes, create one card per cloze deletion number
          const fieldValues = note.field_values as Record<string, string>
          const textField = fieldValues['Text'] || ''
          const clozeNumbers = countClozeDeletions(textField)

          if (clozeNumbers.length === 0) {
            cardsToInsert.push({
              note_id: note.id,
              deck_id: deckId,
              template_index: 0,
            })
          } else {
            for (const num of clozeNumbers) {
              cardsToInsert.push({
                note_id: note.id,
                deck_id: deckId,
                template_index: num - 1,
              })
            }
          }
        } else {
          // For Basic and other note types, create one card per template
          for (const template of templates) {
            cardsToInsert.push({
              note_id: note.id,
              deck_id: deckId,
              template_index: template.ordinal,
            })
          }
        }
      }

      // Insert cards
      const { data: insertedCards, error: cardsError } = await supabase
        .from('cards')
        .insert(cardsToInsert)
        .select('id')

      if (cardsError) {
        console.error('Error creating cards:', cardsError)
        // Note: Cards failed but notes were created
        // In production, you might want to rollback notes here
      }

      createdCards += insertedCards?.length || 0
    }

    return NextResponse.json({
      success: errors.length === 0,
      totalNotes: notes.length,
      createdNotes,
      createdCards,
      errors,
    })
  } catch (error) {
    console.error('Error in note import API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
