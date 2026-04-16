/**
 * GET /api/admin/due-cards-summary
 *
 * billing システムがLINE通知を送信するためのデータ提供API。
 * 期限切れカードがある全生徒のサマリーを返す。
 *
 * 認証: SRS_AUTH_SECRET を Bearer トークンとして検証
 *
 * レスポンス:
 * {
 *   students: [
 *     {
 *       lineUserId: "U...",
 *       name: "田中太郎",
 *       dueCount: 42,           // 実際の期限切れ枚数（上限なし）
 *       frontText: "apple",
 *       deckName: "英単語ターゲット1900",
 *       deckId: "uuid"          // 代表カードが属するデッキの ID（深いリンク用）
 *     }
 *   ]
 * }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { extractFrontText } from '@/lib/push/extract-text'

interface DueCardStudent {
  lineUserId: string
  name: string
  dueCount: number
  frontText: string
  deckName: string
  deckId: string | null
}

export async function GET(request: NextRequest) {
  try {
    // Verify auth secret (same pattern as billing-sync)
    const authHeader = request.headers.get('authorization')
    const authSecret = process.env.SRS_AUTH_SECRET

    if (!authSecret || authHeader !== `Bearer ${authSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const supabase = createSupabaseClient(supabaseUrl, serviceRoleKey)

    // Get all users who have line_user_id in auth metadata
    const { data: { users: allUsers } } = await supabase.auth.admin.listUsers({ perPage: 1000 })

    const lineUsers = allUsers.filter(u => u.user_metadata?.line_user_id)

    if (lineUsers.length === 0) {
      return NextResponse.json({ students: [] })
    }

    const now = new Date().toISOString()
    const result: DueCardStudent[] = []

    for (const user of lineUsers) {
      const userId = user.id
      const lineUserId = user.user_metadata.line_user_id as string

      // Exact count of due cards
      const { count: totalDue } = await supabase
        .from('card_states')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .neq('state', 'suspended')
        .lte('due', now)

      if (!totalDue || totalDue === 0) continue

      // Sample up to 10 due cards for picking a preview
      const { data: sampleCards } = await supabase
        .from('card_states')
        .select('card_id')
        .eq('user_id', userId)
        .neq('state', 'suspended')
        .lte('due', now)
        .limit(10)

      if (!sampleCards || sampleCards.length === 0) continue

      const randomCard = sampleCards[Math.floor(Math.random() * sampleCards.length)]

      // Get card -> note -> field_values and deck info
      const { data: cardData } = await supabase
        .from('cards')
        .select('id, deck_id, note_id')
        .eq('id', randomCard.card_id)
        .single()

      let frontText = '復習カードがあります'
      let deckName = ''
      let deckId: string | null = null

      if (cardData) {
        deckId = cardData.deck_id

        const { data: noteData } = await supabase
          .from('notes')
          .select('field_values')
          .eq('id', cardData.note_id)
          .single()

        frontText = extractFrontText(noteData?.field_values as Record<string, string> | null)

        const { data: deckData } = await supabase
          .from('decks')
          .select('name')
          .eq('id', cardData.deck_id)
          .single()

        deckName = deckData?.name || ''
      }

      // Get profile name
      const { data: profile } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', userId)
        .single()

      result.push({
        lineUserId,
        name: profile?.name || user.user_metadata?.name || '',
        dueCount: totalDue,
        frontText,
        deckName,
        deckId,
      })
    }

    return NextResponse.json({ students: result })
  } catch (error) {
    console.error('Error in due-cards-summary:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
