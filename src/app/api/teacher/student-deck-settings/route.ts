import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireTeacher } from '@/lib/api/auth'
import { validateDeckSettings } from '@/lib/srs/settings-validation'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * 講師が生徒のデッキ別学習設定（user_deck_settings）を読み書きする API。
 * RLS は 023_teacher_student_deck_settings.sql（is_student_of_teacher）で許可。
 *
 * 重要: 学習時のマージキーは「ルートデッキID」（getStudyCardsOffline が
 * `${userId}:${rootDeckId}` しか読まない）ため、deckId は必ずサーバー側で
 * ルートに解決してから読み書きする。
 */

/** 対象生徒が自分の担当（own class or billing 連携クラス）か検証 */
async function verifyStudentRelation(
  supabase: SupabaseClient,
  teacherId: string,
  studentId: string
): Promise<boolean> {
  const { data: classes } = await supabase
    .from('classes')
    .select('id, class_members(user_id)')
    .or(`teacher_id.eq.${teacherId},billing_template_id.not.is.null`)
  interface ClassWithMembers {
    id: string
    class_members: { user_id: string }[]
  }
  const memberIds = ((classes as ClassWithMembers[]) || []).flatMap(
    c => (c.class_members || []).map(m => m.user_id)
  )
  return memberIds.includes(studentId)
}

/** parent_deck_id をたどってルートデッキを取得（最大深度3） */
async function resolveRootDeck(
  supabase: SupabaseClient,
  deckId: string
): Promise<{ id: string; name: string; settings: Record<string, unknown> } | null> {
  let currentId = deckId
  for (let depth = 0; depth < 4; depth++) {
    const { data: deck } = await supabase
      .from('decks')
      .select('id, name, parent_deck_id, settings')
      .eq('id', currentId)
      .single()
    if (!deck) return null
    if (!deck.parent_deck_id) {
      return { id: deck.id, name: deck.name, settings: deck.settings || {} }
    }
    currentId = deck.parent_deck_id
  }
  return null
}

// GET /api/teacher/student-deck-settings?userId=xxx&deckId=yyy
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { user, error: authError } = await requireTeacher(supabase)
    if (authError) return authError

    const searchParams = request.nextUrl.searchParams
    const userId = searchParams.get('userId')
    const deckId = searchParams.get('deckId')
    if (!userId || !deckId) {
      return NextResponse.json({ error: 'userId and deckId are required' }, { status: 400 })
    }

    if (!(await verifyStudentRelation(supabase, user.id, userId))) {
      return NextResponse.json({ error: 'Student not found in your classes' }, { status: 403 })
    }

    const rootDeck = await resolveRootDeck(supabase, deckId)
    if (!rootDeck) {
      return NextResponse.json({ error: 'Deck not found' }, { status: 404 })
    }

    const { data: override } = await supabase
      .from('user_deck_settings')
      .select('settings, updated_at')
      .eq('user_id', userId)
      .eq('deck_id', rootDeck.id)
      .maybeSingle()

    return NextResponse.json({
      rootDeckId: rootDeck.id,
      deckName: rootDeck.name,
      deckSettings: rootDeck.settings,
      override: override?.settings ?? null,
      merged: { ...rootDeck.settings, ...(override?.settings || {}) },
    })
  } catch (error) {
    console.error('Error in student-deck-settings GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/teacher/student-deck-settings  { userId, deckId, settings }
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { user, error: authError } = await requireTeacher(supabase)
    if (authError) return authError

    const body = await request.json()
    const { userId, deckId, settings } = body
    if (!userId || !deckId || !settings) {
      return NextResponse.json({ error: 'userId, deckId and settings are required' }, { status: 400 })
    }

    if (!(await verifyStudentRelation(supabase, user.id, userId))) {
      return NextResponse.json({ error: 'Student not found in your classes' }, { status: 403 })
    }

    const errors = validateDeckSettings(settings)
    if (errors.length > 0) {
      return NextResponse.json({ error: errors.map(e => e.message).join(', ') }, { status: 400 })
    }

    const rootDeck = await resolveRootDeck(supabase, deckId)
    if (!rootDeck) {
      return NextResponse.json({ error: 'Deck not found' }, { status: 404 })
    }

    const { error: upsertError } = await supabase
      .from('user_deck_settings')
      .upsert({
        user_id: userId,
        deck_id: rootDeck.id,
        settings,
      })

    if (upsertError) {
      console.error('Error saving student deck settings:', upsertError)
      return NextResponse.json({ error: upsertError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, rootDeckId: rootDeck.id })
  } catch (error) {
    console.error('Error in student-deck-settings PUT:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/teacher/student-deck-settings?userId=xxx&deckId=yyy （既定に戻す）
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { user, error: authError } = await requireTeacher(supabase)
    if (authError) return authError

    const searchParams = request.nextUrl.searchParams
    const userId = searchParams.get('userId')
    const deckId = searchParams.get('deckId')
    if (!userId || !deckId) {
      return NextResponse.json({ error: 'userId and deckId are required' }, { status: 400 })
    }

    if (!(await verifyStudentRelation(supabase, user.id, userId))) {
      return NextResponse.json({ error: 'Student not found in your classes' }, { status: 403 })
    }

    const rootDeck = await resolveRootDeck(supabase, deckId)
    if (!rootDeck) {
      return NextResponse.json({ error: 'Deck not found' }, { status: 404 })
    }

    const { error: deleteError } = await supabase
      .from('user_deck_settings')
      .delete()
      .eq('user_id', userId)
      .eq('deck_id', rootDeck.id)

    if (deleteError) {
      console.error('Error deleting student deck settings:', deleteError)
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, rootDeckId: rootDeck.id })
  } catch (error) {
    console.error('Error in student-deck-settings DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
