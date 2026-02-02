import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/student/stats - Get student dashboard statistics
export async function GET() {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get today's start (4 AM)
    const today = new Date()
    today.setHours(4, 0, 0, 0)
    if (new Date().getHours() < 4) {
      today.setDate(today.getDate() - 1)
    }

    // Get review cards due now
    const { count: dueCards } = await supabase
      .from('card_states')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('state', 'review')
      .lte('due', new Date().toISOString())

    // Get new cards (cards without card_state for this user)
    // First get all cards in decks assigned to this user
    const { data: assignedDecks } = await supabase
      .from('deck_assignments')
      .select('deck_id')
      .eq('user_id', user.id)

    // Also get decks through class assignments
    const { data: classAssignments } = await supabase
      .from('deck_assignments')
      .select('deck_id, class_id')
      .not('class_id', 'is', null)

    const { data: userClasses } = await supabase
      .from('class_members')
      .select('class_id')
      .eq('user_id', user.id)

    const userClassIds = new Set(userClasses?.map(c => c.class_id) || [])
    const classAssignedDeckIds = classAssignments
      ?.filter(a => a.class_id && userClassIds.has(a.class_id))
      .map(a => a.deck_id) || []

    const directAssignedDeckIds = assignedDecks?.map(d => d.deck_id) || []

    // Also include own decks
    const { data: ownDecks } = await supabase
      .from('decks')
      .select('id')
      .eq('owner_id', user.id)

    const ownDeckIds = ownDecks?.map(d => d.id) || []

    const allDeckIds = Array.from(new Set([...directAssignedDeckIds, ...classAssignedDeckIds, ...ownDeckIds]))

    let newCards = 0
    let learningCards = 0

    if (allDeckIds.length > 0) {
      // Get all cards in accessible decks
      const { data: allCards } = await supabase
        .from('cards')
        .select('id')
        .in('deck_id', allDeckIds)

      const allCardIds = allCards?.map(c => c.id) || []

      // Get card states for this user
      const { data: cardStates } = await supabase
        .from('card_states')
        .select('card_id, state')
        .eq('user_id', user.id)
        .in('card_id', allCardIds)

      const cardStateMap = new Map(cardStates?.map(cs => [cs.card_id, cs.state]) || [])

      // Count new and learning cards
      for (const cardId of allCardIds) {
        const state = cardStateMap.get(cardId)
        if (!state) {
          newCards++
        } else if (state === 'learning' || state === 'relearning') {
          learningCards++
        }
      }
    }

    // Get reviews done today
    const { count: reviewsToday } = await supabase
      .from('review_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('reviewed_at', today.toISOString())

    // Get recent activity (last 7 days)
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)

    const { data: recentReviews } = await supabase
      .from('review_logs')
      .select('reviewed_at, ease')
      .eq('user_id', user.id)
      .gte('reviewed_at', weekAgo.toISOString())
      .order('reviewed_at', { ascending: false })
      .limit(100)

    // Calculate streak (consecutive days with reviews)
    const reviewDates = new Set(
      recentReviews?.map(r => {
        const d = new Date(r.reviewed_at)
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      }) || []
    )

    let streak = 0
    const checkDate = new Date()
    while (streak < 365) {
      const dateStr = `${checkDate.getFullYear()}-${checkDate.getMonth()}-${checkDate.getDate()}`
      if (reviewDates.has(dateStr)) {
        streak++
        checkDate.setDate(checkDate.getDate() - 1)
      } else if (streak === 0 && checkDate.toDateString() === new Date().toDateString()) {
        // Today might not have reviews yet, check yesterday
        checkDate.setDate(checkDate.getDate() - 1)
      } else {
        break
      }
    }

    return NextResponse.json({
      stats: {
        dueCards: dueCards || 0,
        newCards,
        learningCards,
        reviewsToday: reviewsToday || 0,
        streak,
      },
    })
  } catch (error) {
    console.error('Error fetching student stats:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
