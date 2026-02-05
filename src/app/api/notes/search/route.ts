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
    const deckId = searchParams.get('deckId') || ''
    const deckIdsParam = searchParams.get('deckIds') || ''
    const q = searchParams.get('q') || ''
    const noteTypeId = searchParams.get('noteTypeId') || ''
    const tag = searchParams.get('tag') || ''
    const order = searchParams.get('order') || 'desc'
    const offset = parseInt(searchParams.get('offset') || '0', 10)
    const limit = parseInt(searchParams.get('limit') || '50', 10)

    // Determine which deck IDs to search
    let searchDeckIds: string[] = []
    if (deckIdsParam) {
      // Multiple deck IDs (subdeck search)
      searchDeckIds = deckIdsParam.split(',').filter(Boolean)
    } else if (deckId) {
      searchDeckIds = [deckId]
    }

    // If no deckId at all, search all decks owned by user
    if (searchDeckIds.length === 0) {
      const { data: userDecks } = await supabase
        .from('decks')
        .select('id')
        .eq('owner_id', user.id)
      searchDeckIds = (userDecks || []).map(d => d.id)
      if (searchDeckIds.length === 0) {
        return NextResponse.json({ notes: [], total: 0 })
      }
    } else {
      // Verify deck access for first deck (owner or assigned)
      const primaryDeckId = deckId || searchDeckIds[0]
      const { data: deck } = await supabase
        .from('decks')
        .select('id, owner_id')
        .eq('id', primaryDeckId)
        .single()

      if (!deck) {
        return NextResponse.json({ error: 'Deck not found' }, { status: 404 })
      }

      if (deck.owner_id !== user.id) {
        const { data: assignment } = await supabase
          .from('deck_assignments')
          .select('id')
          .eq('deck_id', primaryDeckId)
          .eq('user_id', user.id)
          .maybeSingle()

        if (!assignment) {
          return NextResponse.json({ error: 'Access denied' }, { status: 403 })
        }
      }
    }

    // Call RPC function for JSONB text search
    // Try with p_deck_ids array first; fall back to p_deck_id for single deck
    let rpcRows: unknown[] | null = null
    let rpcError: { message: string } | null = null

    const rpcResult = await supabase.rpc('search_notes', {
      p_deck_id: searchDeckIds.length === 1 ? searchDeckIds[0] : null,
      p_deck_ids: searchDeckIds.length > 1 ? searchDeckIds : null,
      p_query: q.trim(),
      p_note_type_id: noteTypeId || null,
      p_tag: tag || null,
      p_sort_order: order,
      p_offset: offset,
      p_limit: limit,
    })

    if (rpcResult.error && rpcResult.error.message?.includes('p_deck_ids')) {
      // Old RPC doesn't have p_deck_ids - fall back to p_deck_id only
      const fallback = await supabase.rpc('search_notes', {
        p_deck_id: searchDeckIds[0] || null,
        p_query: q.trim(),
        p_note_type_id: noteTypeId || null,
        p_tag: tag || null,
        p_sort_order: order,
        p_offset: offset,
        p_limit: limit,
      } as Record<string, unknown>)
      if (fallback.error && fallback.error.message?.includes('p_tag')) {
        // Even older RPC without p_tag
        const fallback2 = await supabase.rpc('search_notes', {
          p_deck_id: searchDeckIds[0] || null,
          p_query: q.trim(),
          p_note_type_id: noteTypeId || null,
          p_sort_order: order,
          p_offset: offset,
          p_limit: limit,
        } as Record<string, unknown>)
        rpcRows = fallback2.data
        rpcError = fallback2.error
      } else {
        rpcRows = fallback.data
        rpcError = fallback.error
      }
    } else if (rpcResult.error && rpcResult.error.message?.includes('p_tag')) {
      // Has p_deck_ids but not p_tag - shouldn't happen but handle it
      const fallback = await supabase.rpc('search_notes', {
        p_deck_id: searchDeckIds.length === 1 ? searchDeckIds[0] : null,
        p_query: q.trim(),
        p_note_type_id: noteTypeId || null,
        p_sort_order: order,
        p_offset: offset,
        p_limit: limit,
      } as Record<string, unknown>)
      rpcRows = fallback.data
      rpcError = fallback.error
    } else {
      rpcRows = rpcResult.data
      rpcError = rpcResult.error
    }

    if (rpcError) {
      console.error('Error searching notes:', rpcError)
      return NextResponse.json({ error: rpcError.message }, { status: 500 })
    }

    const rows = (rpcRows || []) as Array<{
      id: string
      deck_id?: string
      field_values: Record<string, string>
      note_type_id: string
      generated_content: unknown
      tags?: string[]
      created_at: string
      total_count: number
    }>

    const total = rows.length > 0 ? rows[0].total_count : 0

    // Get cards for these notes
    const noteIds = rows.map(r => r.id)
    const cardsMap: Record<string, Array<{ id: string }>> = {}

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
      deck_id: row.deck_id || null,
      field_values: row.field_values,
      note_type_id: row.note_type_id,
      generated_content: row.generated_content,
      tags: row.tags || [],
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
