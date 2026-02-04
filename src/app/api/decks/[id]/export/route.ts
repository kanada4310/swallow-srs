import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateCSV, NoteForExport } from '@/lib/csv/exporter'
import type { FieldDefinition } from '@/types/database'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: deckId } = await params
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check role (teacher or admin only)
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role === 'student') {
      return NextResponse.json({ error: '講師のみエクスポートできます' }, { status: 403 })
    }

    // Verify deck ownership
    const { data: deck, error: deckError } = await supabase
      .from('decks')
      .select('id, name, owner_id')
      .eq('id', deckId)
      .single()

    if (deckError || !deck) {
      return NextResponse.json({ error: 'デッキが見つかりません' }, { status: 404 })
    }

    if (deck.owner_id !== user.id && profile.role !== 'admin') {
      return NextResponse.json({ error: '自分のデッキのみエクスポートできます' }, { status: 403 })
    }

    // Fetch notes with note_type_id
    const { data: notes, error: notesError } = await supabase
      .from('notes')
      .select('id, field_values, note_type_id')
      .eq('deck_id', deckId)
      .order('created_at', { ascending: true })

    if (notesError) {
      console.error('Error fetching notes:', notesError)
      return NextResponse.json({ error: 'ノートの取得に失敗しました' }, { status: 500 })
    }

    if (!notes || notes.length === 0) {
      return NextResponse.json({ error: 'エクスポートするノートがありません' }, { status: 400 })
    }

    // Fetch note types used in this deck
    const noteTypeIds = Array.from(new Set(notes.map((n) => n.note_type_id)))
    const { data: noteTypes, error: noteTypesError } = await supabase
      .from('note_types')
      .select('id, name, fields')
      .in('id', noteTypeIds)

    if (noteTypesError) {
      console.error('Error fetching note types:', noteTypesError)
      return NextResponse.json({ error: 'ノートタイプの取得に失敗しました' }, { status: 500 })
    }

    // Build note type lookup and collect all field names (ordered, union)
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
    const exportNotes: NoteForExport[] = notes.map((note) => ({
      noteTypeName: noteTypeMap[note.note_type_id]?.name || 'Unknown',
      fieldValues: (note.field_values || {}) as Record<string, string>,
    }))

    // Generate CSV
    const csv = generateCSV(exportNotes, allFieldNames)

    // Build filename: {deckName}_{YYYY-MM-DD}.csv
    const dateStr = new Date().toISOString().split('T')[0]
    const filename = `${deck.name}_${dateStr}.csv`
    // RFC 5987 encoding for non-ASCII filenames
    const encodedFilename = encodeURIComponent(filename).replace(/%20/g, '+')

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`,
      },
    })
  } catch (error) {
    console.error('Error in deck export API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
