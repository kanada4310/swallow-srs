import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireTeacher } from '@/lib/api/auth'
import { generateCSV, NoteForExport } from '@/lib/csv/exporter'
import type { FieldDefinition } from '@/types/database'

export async function POST() {
  try {
    const supabase = await createClient()

    const { user, error: authError } = await requireTeacher(supabase)
    if (authError) return authError

    // Fetch all accessible deck IDs (same logic as notes/page.tsx)
    const [{ data: ownDecks }, { data: directAssignments }, { data: classMembers }] = await Promise.all([
      supabase.from('decks').select('id').eq('owner_id', user.id),
      supabase.from('deck_assignments').select('deck_id').eq('user_id', user.id),
      supabase.from('class_members').select('class_id').eq('user_id', user.id),
    ])

    const deckIdSet = new Set<string>()
    for (const d of ownDecks || []) deckIdSet.add(d.id)

    const assignedDeckIds: string[] = []
    for (const a of directAssignments || []) {
      if (!deckIdSet.has(a.deck_id)) assignedDeckIds.push(a.deck_id)
    }

    const classIds = (classMembers || []).map(cm => cm.class_id)
    if (classIds.length > 0) {
      const { data: classAssignments } = await supabase
        .from('deck_assignments')
        .select('deck_id')
        .in('class_id', classIds)
      for (const a of classAssignments || []) {
        if (!deckIdSet.has(a.deck_id)) assignedDeckIds.push(a.deck_id)
      }
    }

    for (const id of assignedDeckIds) deckIdSet.add(id)

    // Also include subdecks
    const parentIds = Array.from(deckIdSet)
    if (parentIds.length > 0) {
      const { data: subDecks } = await supabase
        .from('decks')
        .select('id')
        .in('parent_deck_id', parentIds)
      for (const d of subDecks || []) deckIdSet.add(d.id)
    }

    const allDeckIds = Array.from(deckIdSet)
    if (allDeckIds.length === 0) {
      return NextResponse.json({ error: 'エクスポートするノートがありません' }, { status: 400 })
    }

    // Fetch all notes
    const { data: notes, error: notesError } = await supabase
      .from('notes')
      .select('id, field_values, note_type_id')
      .in('deck_id', allDeckIds)
      .order('created_at', { ascending: true })

    if (notesError) {
      console.error('Error fetching notes:', notesError)
      return NextResponse.json({ error: 'ノートの取得に失敗しました' }, { status: 500 })
    }

    if (!notes || notes.length === 0) {
      return NextResponse.json({ error: 'エクスポートするノートがありません' }, { status: 400 })
    }

    // Fetch note types used
    const noteTypeIds = Array.from(new Set(notes.map(n => n.note_type_id)))
    const { data: noteTypes, error: noteTypesError } = await supabase
      .from('note_types')
      .select('id, name, fields')
      .in('id', noteTypeIds)

    if (noteTypesError) {
      console.error('Error fetching note types:', noteTypesError)
      return NextResponse.json({ error: 'ノートタイプの取得に失敗しました' }, { status: 500 })
    }

    // Build note type lookup and collect all field names
    const noteTypeMap: Record<string, { name: string; fields: FieldDefinition[] }> = {}
    const allFieldNames: string[] = []
    const fieldNameSet = new Set<string>()

    for (const nt of noteTypes || []) {
      noteTypeMap[nt.id] = { name: nt.name, fields: nt.fields as FieldDefinition[] }
      for (const field of (nt.fields as FieldDefinition[]).sort((a, b) => a.ord - b.ord)) {
        if (!fieldNameSet.has(field.name)) {
          fieldNameSet.add(field.name)
          allFieldNames.push(field.name)
        }
      }
    }

    // Build export data
    const exportNotes: NoteForExport[] = notes.map(note => ({
      noteTypeName: noteTypeMap[note.note_type_id]?.name || 'Unknown',
      fieldValues: (note.field_values || {}) as Record<string, string>,
    }))

    // Generate CSV
    const csv = generateCSV(exportNotes, allFieldNames)

    // Build filename
    const dateStr = new Date().toISOString().split('T')[0]
    const filename = `ノート検索結果_${dateStr}.csv`
    const encodedFilename = encodeURIComponent(filename).replace(/%20/g, '+')

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`,
      },
    })
  } catch (error) {
    console.error('Error in notes export API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
