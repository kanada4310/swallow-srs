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

    // If no deckId at all, search all decks the user can access (owned + assigned)
    if (searchDeckIds.length === 0) {
      const [{ data: userDecks }, { data: directAssignments }, { data: classMembers }] = await Promise.all([
        supabase.from('decks').select('id').eq('owner_id', user.id),
        supabase.from('deck_assignments').select('deck_id').eq('user_id', user.id),
        supabase.from('class_members').select('class_id').eq('user_id', user.id),
      ])

      const deckIdSet = new Set<string>()
      for (const d of userDecks || []) deckIdSet.add(d.id)
      for (const a of directAssignments || []) deckIdSet.add(a.deck_id)

      // Get decks assigned via class membership
      const classIds = (classMembers || []).map(cm => cm.class_id)
      if (classIds.length > 0) {
        const { data: classAssignments } = await supabase
          .from('deck_assignments')
          .select('deck_id')
          .in('class_id', classIds)
        for (const a of classAssignments || []) deckIdSet.add(a.deck_id)
      }

      searchDeckIds = Array.from(deckIdSet)
      if (searchDeckIds.length === 0) {
        return NextResponse.json({ notes: [], total: 0 })
      }

      // Expand to include all subdeck IDs
      const descendantPromises = searchDeckIds.map(did =>
        supabase.rpc('get_descendant_deck_ids', { p_deck_id: did })
      )
      const descendantResults = await Promise.all(descendantPromises)
      for (const result of descendantResults) {
        if (result.data) {
          for (const row of result.data) {
            const subId = typeof row === 'string' ? row : (row as { id?: string }).id || String(row)
            deckIdSet.add(subId)
          }
        }
      }
      searchDeckIds = Array.from(deckIdSet)
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

    // Search notes: try RPC with p_deck_ids first, then direct query fallback
    let rpcRows: unknown[] | null = null
    let rpcError: { message: string } | null = null
    const searchQuery = q.trim()

    if (searchDeckIds.length === 1) {
      // Single deck: use p_deck_id (works with both old and new RPC)
      const result = await supabase.rpc('search_notes', {
        p_deck_id: searchDeckIds[0],
        p_query: searchQuery,
        p_note_type_id: noteTypeId || null,
        p_tag: tag || null,
        p_sort_order: order,
        p_offset: offset,
        p_limit: limit,
      } as Record<string, unknown>)

      if (result.error && result.error.message?.includes('p_tag')) {
        // Old RPC without p_tag
        const fallback = await supabase.rpc('search_notes', {
          p_deck_id: searchDeckIds[0],
          p_query: searchQuery,
          p_note_type_id: noteTypeId || null,
          p_sort_order: order,
          p_offset: offset,
          p_limit: limit,
        } as Record<string, unknown>)
        rpcRows = fallback.data
        rpcError = fallback.error
      } else {
        rpcRows = result.data
        rpcError = result.error
      }
    } else {
      // Multiple decks: try p_deck_ids first
      const rpcResult = await supabase.rpc('search_notes', {
        p_deck_id: null,
        p_deck_ids: searchDeckIds,
        p_query: searchQuery,
        p_note_type_id: noteTypeId || null,
        p_tag: tag || null,
        p_sort_order: order,
        p_offset: offset,
        p_limit: limit,
      })

      if (!rpcResult.error) {
        rpcRows = rpcResult.data
        rpcError = null
      } else {
        // p_deck_ids failed (function overloading issue)
        // Fallback: call old RPC per-deck and merge results
        console.warn('search_notes with p_deck_ids failed, using per-deck fallback:', rpcResult.error.message)

        const perDeckResults = await Promise.all(
          searchDeckIds.map(did =>
            supabase.rpc('search_notes', {
              p_deck_id: did,
              p_query: searchQuery,
              p_note_type_id: noteTypeId || null,
              p_sort_order: order,
              p_offset: 0,
              p_limit: 1000,
            } as Record<string, unknown>)
          )
        )

        // Merge all results
        type RpcRow = { id: string; deck_id?: string; field_values: Record<string, string>; note_type_id: string; generated_content: unknown; tags?: string[]; created_at: string; total_count: number }
        let allRows: RpcRow[] = []
        for (const result of perDeckResults) {
          if (result.data) {
            allRows.push(...(result.data as RpcRow[]))
          }
        }

        // Apply tag filter (old RPC doesn't support p_tag)
        if (tag) {
          allRows = allRows.filter(r => r.tags && r.tags.includes(tag))
        }

        // Sort merged results
        allRows.sort((a, b) => {
          const ta = new Date(a.created_at).getTime()
          const tb = new Date(b.created_at).getTime()
          return order === 'asc' ? ta - tb : tb - ta
        })

        // Apply pagination on merged results
        const totalCount = allRows.length
        const paginatedRows = allRows.slice(offset, offset + limit)
        rpcRows = paginatedRows.map(r => ({ ...r, total_count: totalCount }))
        rpcError = null
      }
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
