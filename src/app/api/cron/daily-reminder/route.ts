import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { sendPushNotification } from '@/lib/push/server'
import { extractFrontText } from '@/lib/push/extract-text'
import type { PushTarget } from '@/lib/push/server'

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Use service role client to bypass RLS
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const supabase = createSupabaseClient(supabaseUrl, serviceRoleKey)

    // Get all push subscriptions
    const { data: subscriptions, error: subError } = await supabase
      .from('push_subscriptions')
      .select('user_id, endpoint, p256dh, auth')

    if (subError || !subscriptions) {
      console.error('Error fetching subscriptions:', subError)
      return NextResponse.json({ error: 'Failed to fetch subscriptions' }, { status: 500 })
    }

    if (subscriptions.length === 0) {
      return NextResponse.json({ success: true, sent: 0, message: 'No subscriptions' })
    }

    // Get notification settings to filter out disabled users
    const { data: settingsRows } = await supabase
      .from('notification_settings')
      .select('user_id, enabled')

    const disabledUsers = new Set<string>()
    if (settingsRows) {
      for (const row of settingsRows) {
        if (!row.enabled) {
          disabledUsers.add(row.user_id)
        }
      }
    }

    // Group subscriptions by user_id
    const userSubscriptions = new Map<string, Array<{ endpoint: string; p256dh: string; auth: string }>>()
    for (const sub of subscriptions) {
      if (disabledUsers.has(sub.user_id)) continue

      const existing = userSubscriptions.get(sub.user_id)
      if (existing) {
        existing.push({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth })
      } else {
        userSubscriptions.set(sub.user_id, [{ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }])
      }
    }

    const userIds = Array.from(userSubscriptions.keys())
    if (userIds.length === 0) {
      return NextResponse.json({ success: true, sent: 0, message: 'All users disabled' })
    }

    let totalSent = 0
    let totalFailed = 0

    for (const userId of userIds) {
      try {
        // Get due cards for this user (limit 10, pick 1 random)
        const now = new Date().toISOString()
        const { data: dueCards } = await supabase
          .from('card_states')
          .select('card_id')
          .eq('user_id', userId)
          .neq('state', 'suspended')
          .lte('due', now)
          .limit(10)

        if (!dueCards || dueCards.length === 0) {
          // No due cards — log skip and continue
          await supabase.from('notification_logs').insert({
            user_id: userId,
            status: 'skipped',
          })
          continue
        }

        // Pick random card
        const randomCard = dueCards[Math.floor(Math.random() * dueCards.length)]

        // Get card → note → field_values and deck info
        const { data: cardData } = await supabase
          .from('cards')
          .select('id, deck_id, note_id')
          .eq('id', randomCard.card_id)
          .single()

        let frontText = '復習カードがあります'
        let deckName = ''
        let deckId: string | null = null
        const cardId: string | null = randomCard.card_id

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

        const dueCount = dueCards.length >= 10 ? '10+' : String(dueCards.length)
        const title = deckName ? `${deckName}` : 'つばめSRS'
        const body = `「${frontText}」他${dueCount}枚の復習カードがあります`

        // Send to all user's devices
        const userSubs = userSubscriptions.get(userId) || []
        let userSent = false

        for (const sub of userSubs) {
          const target: PushTarget = {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          }

          const result = await sendPushNotification(target, {
            title,
            body,
            url: '/study',
          })

          if (result.success) {
            userSent = true
          } else if (result.statusCode === 410) {
            // Subscription expired — clean up
            await supabase
              .from('push_subscriptions')
              .delete()
              .eq('user_id', userId)
              .eq('endpoint', sub.endpoint)
          }
        }

        // Log result
        await supabase.from('notification_logs').insert({
          user_id: userId,
          card_id: cardId,
          deck_id: deckId,
          status: userSent ? 'sent' : 'failed',
        })

        if (userSent) totalSent++
        else totalFailed++
      } catch (err) {
        console.error(`Error processing user ${userId}:`, err)
        totalFailed++

        await supabase.from('notification_logs').insert({
          user_id: userId,
          status: 'failed',
          error_message: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    }

    return NextResponse.json({
      success: true,
      sent: totalSent,
      failed: totalFailed,
      skipped: userIds.length - totalSent - totalFailed,
    })
  } catch (error) {
    console.error('Error in daily reminder cron:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
