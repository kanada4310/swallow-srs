/**
 * Client-side Web Push subscription helpers
 */

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/')

  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null

  const registration = await navigator.serviceWorker.ready
  return registration.pushManager.getSubscription()
}

export type SubscribeResult =
  | { ok: true; subscription: PushSubscription }
  | { ok: false; reason: 'unsupported' | 'denied' | 'no-vapid-key' | 'subscribe-failed'; message: string }

export async function subscribeToPush(): Promise<SubscribeResult> {
  if (!isPushSupported()) {
    return { ok: false, reason: 'unsupported', message: 'このブラウザはプッシュ通知に対応していません。' }
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return { ok: false, reason: 'denied', message: '通知の許可が拒否されました。ブラウザの設定から通知を許可してください。' }
  }

  const registration = await navigator.serviceWorker.ready
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapidPublicKey) {
    console.error('VAPID public key not configured')
    return { ok: false, reason: 'no-vapid-key', message: 'VAPID公開鍵が設定されていません。管理者に連絡してください。' }
  }

  try {
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
    })
    return { ok: true, subscription }
  } catch (err) {
    console.error('Push subscription failed:', err)
    return { ok: false, reason: 'subscribe-failed', message: `プッシュ購読に失敗しました: ${err instanceof Error ? err.message : '不明なエラー'}` }
  }
}

export async function unsubscribeFromPush(): Promise<boolean> {
  const subscription = await getExistingSubscription()
  if (!subscription) return true
  return subscription.unsubscribe()
}

// Export for testing
export { urlBase64ToUint8Array }
