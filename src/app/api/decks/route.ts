import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth, canManageDeck } from '@/lib/api/auth'
import { validateDeckSettings } from '@/lib/srs/settings-validation'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { user, error } = await requireAuth(supabase)
    if (error) return error

    const body = await request.json()
    const { name, parentDeckId, filterTags } = body

    // Support both legacy (newCardsPerDay) and new (settings) format
    let settings = body.settings || {}
    if (body.newCardsPerDay !== undefined && !body.settings) {
      settings = { new_cards_per_day: body.newCardsPerDay }
    }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Deck name is required' }, { status: 400 })
    }

    // Validate settings
    const validationErrors = validateDeckSettings(settings)
    if (validationErrors.length > 0) {
      return NextResponse.json({
        error: validationErrors.map(e => e.message).join(', '),
      }, { status: 400 })
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

      if (!(await canManageDeck(supabase, user.id, parentDeck.owner_id))) {
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

    // Validate filterTags if provided
    if (filterTags !== undefined) {
      if (!Array.isArray(filterTags) || filterTags.some((t: unknown) => typeof t !== 'string' || !(t as string).trim())) {
        return NextResponse.json({ error: 'filter_tags must be an array of non-empty strings' }, { status: 400 })
      }
      if (!parentDeckId) {
        return NextResponse.json({ error: 'フィルタータグはサブデッキにのみ設定できます' }, { status: 400 })
      }
    }

    // Ensure new_cards_per_day is set (backward compat)
    if (settings.new_cards_per_day === undefined) {
      settings.new_cards_per_day = 20
    }

    // Create deck
    const { data: deck, error: createError } = await supabase
      .from('decks')
      .insert({
        name: name.trim(),
        owner_id: user.id,
        is_distributed: false,
        parent_deck_id: parentDeckId || null,
        filter_tags: filterTags || [],
        settings,
      })
      .select()
      .single()

    if (createError) {
      console.error('Error creating deck:', createError)
      return NextResponse.json({ error: 'Failed to create deck' }, { status: 500 })
    }

    // 配布済み親の下に作ったサブデッキは親の配布を継承する（022_subdeck_assignments）
    // 失敗しても非致命（次回の配布操作 or バックフィル再実行で自己修復）
    if (parentDeckId) {
      try {
        const { data: parentAssignments } = await supabase
          .from('deck_assignments')
          .select('class_id, user_id, source_deck_id')
          .eq('deck_id', parentDeckId)
        if (parentAssignments && parentAssignments.length > 0) {
          const rows = parentAssignments.map(a => ({
            deck_id: deck.id,
            class_id: a.class_id,
            user_id: a.user_id,
            // 親自身が継承している場合は元の配布元を引き継ぐ
            source_deck_id: a.source_deck_id ?? parentDeckId,
          }))
          const { error: inheritError } = await supabase.from('deck_assignments').insert(rows)
          if (inheritError && inheritError.code !== '23505') {
            console.error('Error inheriting parent assignments:', inheritError)
          } else {
            await supabase.from('decks').update({ is_distributed: true }).eq('id', deck.id)
          }
        }
      } catch (e) {
        console.error('Error inheriting parent assignments:', e)
      }
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
