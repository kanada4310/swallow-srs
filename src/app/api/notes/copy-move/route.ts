import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/api/auth'
import { CLOZE_NOTE_TYPE_ID } from '@/lib/constants'
import { countClozeDeletions } from '@/lib/srs/cloze'

// POST /api/notes/copy-move - Copy or move notes to another deck
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { user, error: authError } = await requireAuth(supabase)
    if (authError) return authError

    const body = await request.json()
    const { noteIds, targetDeckId, action } = body as {
      noteIds: string[]
      targetDeckId: string
      action: 'copy' | 'move'
    }

    if (!noteIds || !Array.isArray(noteIds) || noteIds.length === 0) {
      return NextResponse.json({ error: 'noteIds is required' }, { status: 400 })
    }

    if (!targetDeckId) {
      return NextResponse.json({ error: 'targetDeckId is required' }, { status: 400 })
    }

    if (action !== 'copy' && action !== 'move') {
      return NextResponse.json({ error: 'action must be "copy" or "move"' }, { status: 400 })
    }

    if (noteIds.length > 500) {
      return NextResponse.json({ error: 'Maximum 500 notes per request' }, { status: 400 })
    }

    // Verify target deck ownership
    const { data: targetDeck } = await supabase
      .from('decks')
      .select('id, owner_id')
      .eq('id', targetDeckId)
      .single()

    if (!targetDeck) {
      return NextResponse.json({ error: 'Target deck not found' }, { status: 404 })
    }

    if (targetDeck.owner_id !== user.id) {
      return NextResponse.json({ error: 'Access denied: you do not own the target deck' }, { status: 403 })
    }

    // Get source notes with their cards
    const { data: sourceNotes } = await supabase
      .from('notes')
      .select('id, deck_id, note_type_id, field_values, generated_content, tags, source_info')
      .in('id', noteIds)

    if (!sourceNotes || sourceNotes.length === 0) {
      return NextResponse.json({ error: 'Notes not found' }, { status: 404 })
    }

    // Verify user owns all source decks
    const sourceDeckIds = Array.from(new Set(sourceNotes.map(n => n.deck_id)))
    const { data: sourceDecks } = await supabase
      .from('decks')
      .select('id, owner_id')
      .in('id', sourceDeckIds)

    for (const deck of sourceDecks || []) {
      if (deck.owner_id !== user.id) {
        return NextResponse.json({ error: 'Access denied: you do not own all source decks' }, { status: 403 })
      }
    }

    // Get card templates for non-cloze note types
    const noteTypeIds = Array.from(new Set(sourceNotes.map(n => n.note_type_id)))
    const { data: templates } = await supabase
      .from('card_templates')
      .select('id, note_type_id')
      .in('note_type_id', noteTypeIds)

    const templateCountByNoteType = new Map<string, number>()
    for (const t of templates || []) {
      templateCountByNoteType.set(
        t.note_type_id,
        (templateCountByNoteType.get(t.note_type_id) || 0) + 1
      )
    }

    if (action === 'move') {
      // Move: update deck_id on notes and their cards
      const noteIdList = sourceNotes.map(n => n.id)

      // Filter out notes already in target deck
      const notesToMove = sourceNotes.filter(n => n.deck_id !== targetDeckId)
      if (notesToMove.length === 0) {
        return NextResponse.json({ success: true, count: 0, message: 'All notes are already in the target deck' })
      }

      const moveNoteIds = notesToMove.map(n => n.id)

      const [noteResult, cardResult] = await Promise.all([
        supabase
          .from('notes')
          .update({ deck_id: targetDeckId })
          .in('id', moveNoteIds),
        supabase
          .from('cards')
          .update({ deck_id: targetDeckId })
          .in('note_id', moveNoteIds),
      ])

      if (noteResult.error) {
        console.error('Error moving notes:', noteResult.error)
        return NextResponse.json({ error: noteResult.error.message }, { status: 500 })
      }

      if (cardResult.error) {
        console.error('Error moving cards:', cardResult.error)
        return NextResponse.json({ error: cardResult.error.message }, { status: 500 })
      }

      return NextResponse.json({ success: true, count: moveNoteIds.length })
    } else {
      // Copy: create new notes + cards
      let copiedCount = 0

      for (const note of sourceNotes) {
        // Create new note in target deck
        const { data: newNote, error: noteError } = await supabase
          .from('notes')
          .insert({
            deck_id: targetDeckId,
            note_type_id: note.note_type_id,
            field_values: note.field_values,
            generated_content: note.generated_content,
            tags: note.tags,
            source_info: note.source_info,
          })
          .select('id')
          .single()

        if (noteError || !newNote) {
          console.error('Error copying note:', noteError)
          continue
        }

        // Create cards for the new note
        const cardsToCreate: Array<{ note_id: string; deck_id: string; template_index: number }> = []

        if (note.note_type_id === CLOZE_NOTE_TYPE_ID) {
          const textField = (note.field_values as Record<string, string>)['Text'] || ''
          const clozeNumbers = countClozeDeletions(textField)
          if (clozeNumbers.length === 0) {
            cardsToCreate.push({ note_id: newNote.id, deck_id: targetDeckId, template_index: 0 })
          } else {
            for (const num of clozeNumbers) {
              cardsToCreate.push({ note_id: newNote.id, deck_id: targetDeckId, template_index: num - 1 })
            }
          }
        } else {
          const templateCount = templateCountByNoteType.get(note.note_type_id) || 1
          for (let i = 0; i < templateCount; i++) {
            cardsToCreate.push({ note_id: newNote.id, deck_id: targetDeckId, template_index: i })
          }
        }

        if (cardsToCreate.length > 0) {
          const { error: cardError } = await supabase
            .from('cards')
            .insert(cardsToCreate)

          if (cardError) {
            console.error('Error creating cards for copied note:', cardError)
          }
        }

        copiedCount++
      }

      return NextResponse.json({ success: true, count: copiedCount })
    }
  } catch (error) {
    console.error('Error in POST /api/notes/copy-move:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
