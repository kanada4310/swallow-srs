import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/api/auth'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { user, error: authError } = await requireAuth(supabase)
    if (authError) return authError

    const body = await request.json()
    const { cardId, reviewLogId, previousState } = body

    if (!cardId || !reviewLogId) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    // Delete the review log
    await supabase
      .from('review_logs')
      .delete()
      .eq('id', reviewLogId)
      .eq('user_id', user.id)

    // Restore or delete card_state
    if (previousState) {
      // Restore to previous state
      const { error: upsertError } = await supabase
        .from('card_states')
        .upsert({
          user_id: user.id,
          card_id: cardId,
          due: previousState.due,
          interval: previousState.interval,
          ease_factor: previousState.ease_factor,
          repetitions: previousState.repetitions,
          state: previousState.state,
          learning_step: previousState.learning_step,
          lapses: previousState.lapses ?? 0,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,card_id',
        })

      if (upsertError) {
        console.error('Error restoring card state:', upsertError)
        return NextResponse.json({ error: 'Failed to restore card state' }, { status: 500 })
      }
    } else {
      // Card was new - delete the created state
      await supabase
        .from('card_states')
        .delete()
        .eq('user_id', user.id)
        .eq('card_id', cardId)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in undo API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
