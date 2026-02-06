import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/api/auth'
import { calculateNextReview, checkLeech, resolveDeckSettings, Ease, type CardSchedule } from '@/lib/srs/scheduler'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { user, error: authError } = await requireAuth(supabase)
    if (authError) return authError

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

    // Get deck settings via card -> deck -> settings
    const { data: cardData } = await supabase
      .from('cards')
      .select('deck_id')
      .eq('id', cardId)
      .single()

    let deckSettings = undefined
    if (cardData?.deck_id) {
      const { data: deck } = await supabase
        .from('decks')
        .select('settings')
        .eq('id', cardData.deck_id)
        .single()
      deckSettings = deck?.settings
    }

    const settings = resolveDeckSettings(deckSettings)
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
        lapses: currentState.lapses ?? 0,
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
        lapses: 0,
      }
    }

    // Calculate next review with deck settings
    const newSchedule = calculateNextReview(schedule, ease as Ease, now, deckSettings)

    // Check for leech
    let isLeech = false
    if (ease === Ease.Again && newSchedule.lapses > schedule.lapses) {
      isLeech = checkLeech(newSchedule, settings)
    }

    // If leech and action is suspend, set state to suspended
    const finalState = isLeech && settings.leech_action === 'suspend'
      ? 'suspended'
      : newSchedule.state

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
        state: finalState,
        learning_step: newSchedule.learningStep,
        lapses: newSchedule.lapses,
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

    // If leech and action is tag, add "leech" tag to the note
    if (isLeech && settings.leech_action === 'tag' && cardData?.deck_id) {
      try {
        // Get note_id from card
        const { data: card } = await supabase
          .from('cards')
          .select('note_id')
          .eq('id', cardId)
          .single()

        if (card?.note_id) {
          // Get current tags
          const { data: note } = await supabase
            .from('notes')
            .select('tags')
            .eq('id', card.note_id)
            .single()

          const currentTags: string[] = (note?.tags as string[]) || []
          if (!currentTags.includes('leech')) {
            await supabase
              .from('notes')
              .update({ tags: [...currentTags, 'leech'] })
              .eq('id', card.note_id)
          }
        }
      } catch (tagError) {
        console.error('Error adding leech tag:', tagError)
      }
    }

    return NextResponse.json({
      success: true,
      nextDue: newSchedule.due.toISOString(),
      interval: newSchedule.interval,
      state: finalState,
      isLeech,
      lapses: newSchedule.lapses,
    })
  } catch (error) {
    console.error('Error in answer API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
