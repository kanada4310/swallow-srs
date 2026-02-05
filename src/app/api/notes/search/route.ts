import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/api/auth'

// GET /api/notes/search?deckId=X&q=検索語&noteTypeId=Y&sort=created_at&order=desc&offset=0&limit=50
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { user, error: authError } = await requireAuth(supabase)
    if (authError) return authError

    const { searchParams } = new URL(request.url)
    const deckId = searchParams.get('deckId')
    const q = searchParams.get('q') || ''
    const noteTypeId = searchParams.get('noteTypeId') || ''
    const order = searchParams.get('order') || 'desc'
    const offset = parseInt(searchParams.get('offset') || '0', 10)
    const limit = parseInt(searchParams.get('limit') || '50', 10)

    if (!deckId) {
      return NextResponse.json({ error: 'deckId is required' }, { status: 400 })
    }

    // Verify deck access (owner or assigned)
    const { data: deck } = await supabase
      .from('decks')
      .select('id, owner_id')
      .eq('id', deckId)
      .single()

    if (!deck) {
      return NextResponse.json({ error: 'Deck not found' }, { status: 404 })
    }

    // Check ownership or assignment
    if (deck.owner_id !== user.id) {
      const { data: assignment } = await supabase
        .from('deck_assignments')
        .select('id')
        .eq('deck_id', deckId)
        .eq('user_id', user.id)
        .maybeSingle()

      if (!assignment) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    }

    // Call RPC function for JSONB text search
    const { data: rpcRows, error: rpcError } = await supabase.rpc('search_notes', {
      p_deck_id: deckId,
      p_query: q.trim(),
      p_note_type_id: noteTypeId || null,
      p_sort_order: order,
      p_offset: offset,
      p_limit: limit,
    })

    if (rpcError) {
      console.error('Error searching notes:', rpcError)
      return NextResponse.json({ error: rpcError.message }, { status: 500 })
    }

    const rows = (rpcRows || []) as Array<{
      id: string
      field_values: Record<string, string>
      note_type_id: string
      generated_content: unknown
      created_at: string
      total_count: number
    }>

    const total = rows.length > 0 ? rows[0].total_count : 0

    // Get cards for these notes
    const noteIds = rows.map(r => r.id)
    let cardsMap: Record<string, Array<{ id: string }>> = {}

    if (noteIds.length > 0) {
      const { data: cards } = await supabase
        .from('cards')
        .select('id, note_id')
        .in('note_id', noteIds)

      if (cards) {
        for (const card of cards) {
          if (!cardsMap[card.note_id]) {
            cardsMap[card.note_id] = []
          }
          cardsMap[card.note_id].push({ id: card.id })
        }
      }
    }

    // Compose response matching the Note shape
    const notes = rows.map(row => ({
      id: row.id,
      field_values: row.field_values,
      note_type_id: row.note_type_id,
      generated_content: row.generated_content,
      created_at: row.created_at,
      cards: cardsMap[row.id] || [],
    }))

    return NextResponse.json({
      notes,
      total: Number(total),
    })
  } catch (error) {
    console.error('Error in GET /api/notes/search:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
