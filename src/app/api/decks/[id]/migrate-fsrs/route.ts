import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/api/auth'
import { migrateScheduleToFSRS } from '@/lib/srs/fsrs-migration'
import type { CardSchedule } from '@/lib/srs/scheduler'

// POST /api/decks/[id]/migrate-fsrs - Migrate all card_states in a deck from SM-2 to FSRS
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: deckId } = await params
    const supabase = await createClient()

    const { user, error: authError } = await requireAuth(supabase)
    if (authError) return authError

    // Get all cards in this deck
    const { data: cards, error: cardsError } = await supabase
      .from('cards')
      .select('id')
      .eq('deck_id', deckId)

    if (cardsError) {
      return NextResponse.json({ error: cardsError.message }, { status: 500 })
    }

    if (!cards || cards.length === 0) {
      return NextResponse.json({ migrated: 0 })
    }

    const cardIds = cards.map(c => c.id)

    // Get card_states for this user's cards in this deck
    const { data: states, error: statesError } = await supabase
      .from('card_states')
      .select('*')
      .eq('user_id', user.id)
      .in('card_id', cardIds)

    if (statesError) {
      return NextResponse.json({ error: statesError.message }, { status: 500 })
    }

    if (!states || states.length === 0) {
      return NextResponse.json({ migrated: 0 })
    }

    // Migrate each card state
    let migrated = 0
    for (const state of states) {
      const schedule: CardSchedule = {
        due: new Date(state.due),
        interval: state.interval,
        easeFactor: state.ease_factor,
        repetitions: state.repetitions,
        state: state.state as CardSchedule['state'],
        learningStep: state.learning_step,
        lapses: state.lapses ?? 0,
        stability: state.stability ?? null,
        difficulty: state.difficulty ?? null,
        elapsed_days: state.elapsed_days ?? 0,
        scheduled_days: state.scheduled_days ?? 0,
        last_review: state.last_review ? new Date(state.last_review) : null,
      }

      const migratedSchedule = migrateScheduleToFSRS(schedule)

      const { error: updateError } = await supabase
        .from('card_states')
        .update({
          stability: migratedSchedule.stability,
          difficulty: migratedSchedule.difficulty,
          elapsed_days: migratedSchedule.elapsed_days,
          scheduled_days: migratedSchedule.scheduled_days,
          last_review: migratedSchedule.last_review?.toISOString() ?? null,
        })
        .eq('user_id', user.id)
        .eq('card_id', state.card_id)

      if (!updateError) {
        migrated++
      }
    }

    return NextResponse.json({ migrated })
  } catch (error) {
    console.error('Error migrating to FSRS:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
