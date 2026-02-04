/**
 * POST /api/sync/push - ローカル変更をサーバーにプッシュ
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/api/auth'

interface CardStatePayload {
  user_id: string
  card_id: string
  due: string
  interval: number
  ease_factor: number
  repetitions: number
  state: string
  learning_step: number
  updated_at: string
}

interface ReviewLogPayload {
  id: string
  user_id: string
  card_id: string
  ease: 1 | 2 | 3 | 4
  interval: number
  last_interval: number
  time_ms: number | null
  reviewed_at: string
}

interface PushRequest {
  cardStates?: CardStatePayload[]
  reviewLogs?: ReviewLogPayload[]
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { user, error: authError } = await requireAuth(supabase)
  if (authError) return authError

  let body: PushRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const results = {
    cardStates: { success: 0, failed: 0 },
    reviewLogs: { success: 0, failed: 0 },
  }

  // Process card states
  if (body.cardStates && body.cardStates.length > 0) {
    // Verify all card states belong to the current user
    const validStates = body.cardStates.filter((s) => s.user_id === user.id)

    if (validStates.length > 0) {
      // Upsert card states
      const { error } = await supabase.from('card_states').upsert(
        validStates.map((s) => ({
          user_id: s.user_id,
          card_id: s.card_id,
          due: s.due,
          interval: s.interval,
          ease_factor: s.ease_factor,
          repetitions: s.repetitions,
          state: s.state,
          learning_step: s.learning_step,
          updated_at: s.updated_at,
        })),
        {
          onConflict: 'user_id,card_id',
          ignoreDuplicates: false,
        }
      )

      if (error) {
        console.error('Failed to upsert card states:', error)
        results.cardStates.failed = validStates.length
      } else {
        results.cardStates.success = validStates.length
      }
    }
  }

  // Process review logs
  if (body.reviewLogs && body.reviewLogs.length > 0) {
    // Verify all review logs belong to the current user
    const validLogs = body.reviewLogs.filter((l) => l.user_id === user.id)

    if (validLogs.length > 0) {
      // Insert review logs (append-only)
      const { error } = await supabase.from('review_logs').upsert(
        validLogs.map((l) => ({
          id: l.id,
          user_id: l.user_id,
          card_id: l.card_id,
          ease: l.ease,
          interval: l.interval,
          last_interval: l.last_interval,
          time_ms: l.time_ms,
          reviewed_at: l.reviewed_at,
          synced_at: new Date().toISOString(),
        })),
        {
          onConflict: 'id',
          ignoreDuplicates: true, // Don't update existing logs
        }
      )

      if (error) {
        console.error('Failed to insert review logs:', error)
        results.reviewLogs.failed = validLogs.length
      } else {
        results.reviewLogs.success = validLogs.length
      }
    }
  }

  return NextResponse.json({
    success: true,
    results,
  })
}
