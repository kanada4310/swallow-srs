import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calculateNextReview, Ease, type CardSchedule } from '@/lib/srs/scheduler'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { cardId, ease } = body

    if (!cardId || ease === undefined || ease < 1 || ease > 4) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    // Get current card state
    const { data: currentState } = await supabase
      .from('card_states')
      .select('*')
      .eq('user_id', user.id)
      .eq('card_id', cardId)
      .single()

    const now = new Date()
    let schedule: CardSchedule

    if (currentState) {
      schedule = {
        due: new Date(currentState.due),
        interval: currentState.interval,
        easeFactor: currentState.ease_factor,
        repetitions: currentState.repetitions,
        state: currentState.state as CardSchedule['state'],
        learningStep: currentState.learning_step,
      }
    } else {
      // New card - create initial schedule
      schedule = {
        due: now,
        interval: 0,
        easeFactor: 2.5,
        repetitions: 0,
        state: 'new',
        learningStep: 0,
      }
    }

    // Calculate next review
    const newSchedule = calculateNextReview(schedule, ease as Ease, now)

    // Upsert card state
    const { error: upsertError } = await supabase
      .from('card_states')
      .upsert({
        user_id: user.id,
        card_id: cardId,
        due: newSchedule.due.toISOString(),
        interval: newSchedule.interval,
        ease_factor: newSchedule.easeFactor,
        repetitions: newSchedule.repetitions,
        state: newSchedule.state,
        learning_step: newSchedule.learningStep,
        updated_at: now.toISOString(),
      }, {
        onConflict: 'user_id,card_id',
      })

    if (upsertError) {
      console.error('Error upserting card state:', upsertError)
      return NextResponse.json({ error: 'Failed to update card state' }, { status: 500 })
    }

    // Log the review
    const { error: logError } = await supabase
      .from('review_logs')
      .insert({
        user_id: user.id,
        card_id: cardId,
        ease: ease,
        interval: newSchedule.interval,
        last_interval: schedule.interval,
        reviewed_at: now.toISOString(),
      })

    if (logError) {
      console.error('Error logging review:', logError)
      // Don't fail the request, just log the error
    }

    return NextResponse.json({
      success: true,
      nextDue: newSchedule.due.toISOString(),
      interval: newSchedule.interval,
      state: newSchedule.state,
    })
  } catch (error) {
    console.error('Error in answer API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
