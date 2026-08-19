import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth, canManageDeck } from '@/lib/api/auth'
import { validateDeckSettings } from '@/lib/srs/settings-validation'
import { mergePreservingPause, type JsonSettings } from '@/lib/review-pause/logic'

// PUT /api/decks/[id] - Update a deck (name, settings, etc.)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: deckId } = await params
    const supabase = await createClient()

    const { user, error: authError } = await requireAuth(supabase)
    if (authError) return authError

    const body = await request.json()
    const { name, settings, filterTags } = body

    // Get deck and verify ownership
    const { data: deck, error: deckError } = await supabase
      .from('decks')
      .select('id, owner_id, parent_deck_id')
      .eq('id', deckId)
      .single()

    if (deckError || !deck) {
      return NextResponse.json({ error: 'Deck not found' }, { status: 404 })
    }

    // 講師の共同編集対象（または自分のデッキ）なら実デッキを直接編集できる。
    const canManage = await canManageDeck(supabase, user.id, deck.owner_id)

    // 管理権限なし（配布された生徒など）: settings の個人オーバーライドのみ
    if (!canManage) {
      if (name !== undefined) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
      if (settings) {
        const errors = validateDeckSettings(settings)
        if (errors.length > 0) {
          return NextResponse.json({ error: errors.map(e => e.message).join(', ') }, { status: 400 })
        }
        // 個人オーバーライドはルートデッキIDで保存する。
        // 学習時のマージキーが `${userId}:${rootDeckId}` のため（サブデッキIDで保存すると読まれない）
        let rootDeckId = deck.id
        let parentId: string | null = deck.parent_deck_id
        for (let depth = 0; parentId && depth < 4; depth++) {
          const { data: parent } = await supabase
            .from('decks')
            .select('id, parent_deck_id')
            .eq('id', parentId)
            .single()
          if (!parent) break
          rootDeckId = parent.id
          parentId = parent.parent_deck_id
        }
        // 復習通知の停止フラグ（reviewPaused）は学習設定の上書きで消さない
        const { data: existingRow } = await supabase
          .from('user_deck_settings')
          .select('settings')
          .eq('user_id', user.id)
          .eq('deck_id', rootDeckId)
          .maybeSingle()
        const { error: upsertError } = await supabase
          .from('user_deck_settings')
          .upsert({
            user_id: user.id,
            deck_id: rootDeckId,
            settings: mergePreservingPause(settings, (existingRow?.settings ?? null) as JsonSettings | null),
          })
        if (upsertError) {
          console.error('Error saving user deck settings:', upsertError)
          return NextResponse.json({ error: upsertError.message }, { status: 500 })
        }
        return NextResponse.json({ deck: { ...deck, settings }, isUserOverride: true })
      }
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    // Owner: update deck directly
    // Validate settings if provided
    if (settings) {
      const errors = validateDeckSettings(settings)
      if (errors.length > 0) {
        return NextResponse.json({ error: errors.map(e => e.message).join(', ') }, { status: 400 })
      }
    }

    // Validate filterTags if provided
    if (filterTags !== undefined) {
      if (!Array.isArray(filterTags) || filterTags.some((t: unknown) => typeof t !== 'string' || !(t as string).trim())) {
        return NextResponse.json({ error: 'filter_tags must be an array of non-empty strings' }, { status: 400 })
      }
    }

    // Build update object
    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name
    if (settings !== undefined) updateData.settings = settings
    if (filterTags !== undefined) updateData.filter_tags = filterTags

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    // Update deck
    const { data: updatedDeck, error: updateError } = await supabase
      .from('decks')
      .update(updateData)
      .eq('id', deckId)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating deck:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ deck: updatedDeck })
  } catch (error) {
    console.error('Error in PUT /api/decks/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/decks/[id] - Delete a deck and all its contents
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: deckId } = await params
    const supabase = await createClient()

    const { user, error: authError } = await requireAuth(supabase)
    if (authError) return authError

    // Get deck and verify ownership
    const { data: deck, error: deckError } = await supabase
      .from('decks')
      .select('id, name, owner_id')
      .eq('id', deckId)
      .single()

    if (deckError || !deck) {
      return NextResponse.json({ error: 'Deck not found' }, { status: 404 })
    }

    if (!(await canManageDeck(supabase, user.id, deck.owner_id))) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Check for child decks
    const { count: childCount } = await supabase
      .from('decks')
      .select('id', { count: 'exact', head: true })
      .eq('parent_deck_id', deckId)

    if (childCount && childCount > 0) {
      return NextResponse.json({
        error: `このデッキには${childCount}個のサブデッキがあります。先にサブデッキを削除してください。`,
      }, { status: 400 })
    }

    // Check for active assignments
    // 直接配布のみブロック。継承行（source_deck_id 非NULL＝親の配布から自動作成）は
    // デッキ削除時に FK CASCADE で一緒に消えるためブロックしない
    const { count: assignmentCount } = await supabase
      .from('deck_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('deck_id', deckId)
      .is('source_deck_id', null)

    if (assignmentCount && assignmentCount > 0) {
      return NextResponse.json({
        error: `このデッキは${assignmentCount}件の配布先があります。先に配布を解除してください。`,
      }, { status: 400 })
    }

    // Delete deck (CASCADE handles notes → cards → card_states, review_logs)
    const { error: deleteError } = await supabase
      .from('decks')
      .delete()
      .eq('id', deckId)

    if (deleteError) {
      console.error('Error deleting deck:', deleteError)
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/decks/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
