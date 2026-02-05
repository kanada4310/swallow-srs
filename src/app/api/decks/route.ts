import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth, requireTeacher } from '@/lib/api/auth'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { user, error } = await requireTeacher(supabase)
    if (error) return error

    const body = await request.json()
    const { name, newCardsPerDay = 20, parentDeckId } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Deck name is required' }, { status: 400 })
    }

    if (typeof newCardsPerDay !== 'number' || newCardsPerDay < 1 || newCardsPerDay > 100) {
      return NextResponse.json({ error: 'Invalid newCardsPerDay value' }, { status: 400 })
    }

    // Validate parent deck if specified
    if (parentDeckId) {
      const { data: parentDeck } = await supabase
        .from('decks')
        .select('id, owner_id, parent_deck_id')
        .eq('id', parentDeckId)
        .single()

      if (!parentDeck) {
        return NextResponse.json({ error: '親デッキが見つかりません' }, { status: 404 })
      }

      if (parentDeck.owner_id !== user.id) {
        return NextResponse.json({ error: '親デッキへのアクセス権がありません' }, { status: 403 })
      }

      // Check depth limit (max 3 levels)
      let depth = 1
      let currentParentId = parentDeck.parent_deck_id
      while (currentParentId && depth < 4) {
        const { data: ancestor } = await supabase
          .from('decks')
          .select('parent_deck_id')
          .eq('id', currentParentId)
          .single()
        if (!ancestor) break
        depth++
        currentParentId = ancestor.parent_deck_id
      }

      if (depth >= 3) {
        return NextResponse.json({ error: 'デッキの階層は最大3段までです' }, { status: 400 })
      }
    }

    // Create deck
    const { data: deck, error: createError } = await supabase
      .from('decks')
      .insert({
        name: name.trim(),
        owner_id: user.id,
        is_distributed: false,
        parent_deck_id: parentDeckId || null,
        settings: { new_cards_per_day: newCardsPerDay },
      })
      .select()
      .single()

    if (createError) {
      console.error('Error creating deck:', createError)
      return NextResponse.json({ error: 'Failed to create deck' }, { status: 500 })
    }

    return NextResponse.json({ success: true, deck })
  } catch (error) {
    console.error('Error in deck creation API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const supabase = await createClient()

    const { user, error: authError } = await requireAuth(supabase)
    if (authError) return authError

    // Get user's own decks
    const { data: decks, error } = await supabase
      .from('decks')
      .select('*')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching decks:', error)
      return NextResponse.json({ error: 'Failed to fetch decks' }, { status: 500 })
    }

    return NextResponse.json({ decks })
  } catch (error) {
    console.error('Error in decks API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
