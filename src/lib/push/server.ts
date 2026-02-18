/**
 * Server-side Web Push notification sender
 */
import webpush from 'web-push'

let vapidConfigured = false

function ensureVapidConfigured() {
  if (vapidConfigured) return

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT

  if (!publicKey || !privateKey || !subject) {
    throw new Error('VAPID keys not configured')
  }

  webpush.setVapidDetails(subject, publicKey, privateKey)
  vapidConfigured = true
}

export interface PushTarget {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
}

export interface PushPayload {
  title: string
  body: string
  url?: string
  icon?: string
}

export interface PushResult {
  success: boolean
  statusCode?: number
  error?: string
}

export async function sendPushNotification(
  target: PushTarget,
  payload: PushPayload
): Promise<PushResult> {
  try {
    ensureVapidConfigured()

    const result = await webpush.sendNotification(
      {
        endpoint: target.endpoint,
        keys: target.keys,
      },
      JSON.stringify(payload)
    )

    return { success: true, statusCode: result.statusCode }
  } catch (err: unknown) {
    const error = err as { statusCode?: number; message?: string }
    const statusCode = error.statusCode || 0
    const message = error.message || 'Unknown error'

    return {
      success: false,
      statusCode,
      error: message,
    }
  }
}
