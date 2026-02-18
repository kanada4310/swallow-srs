import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/api/auth'
import { sendPushNotification } from '@/lib/push/server'

export async function POST() {
  try {
    const supabase = await createClient()
    const { user, error: authError } = await requireAuth(supabase)
    if (authError) return authError

    // Get user's push subscriptions
    const { data: subscriptions, error } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', user.id)

    if (error) {
      console.error('Error fetching subscriptions:', error)
      return NextResponse.json({ error: 'Failed to fetch subscriptions' }, { status: 500 })
    }

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json({ error: 'No push subscriptions found' }, { status: 404 })
    }

    // Send test notification to all user's devices
    const results = await Promise.all(
      subscriptions.map((sub) =>
        sendPushNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          {
            title: 'つばめSRS テスト通知',
            body: 'プッシュ通知が正しく設定されました！',
            url: '/settings',
          }
        )
      )
    )

    const successCount = results.filter((r) => r.success).length

    // Clean up expired subscriptions (410 Gone)
    for (let i = 0; i < results.length; i++) {
      if (results[i].statusCode === 410) {
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('user_id', user.id)
          .eq('endpoint', subscriptions[i].endpoint)
      }
    }

    return NextResponse.json({
      success: successCount > 0,
      sent: successCount,
      total: subscriptions.length,
    })
  } catch (error) {
    console.error('Error in push test POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
