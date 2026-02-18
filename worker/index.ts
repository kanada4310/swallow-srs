/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope

// Push notification handler
self.addEventListener('push', (event) => {
  if (!event.data) return

  try {
    const payload = event.data.json() as {
      title?: string
      body?: string
      url?: string
      icon?: string
    }

    const title = payload.title || 'つばめSRS'
    const options: NotificationOptions = {
      body: payload.body || '復習の時間です！',
      icon: payload.icon || '/icon-192x192.png',
      badge: '/icon-192x192.png',
      tag: 'tsubame-reminder',
      renotify: true,
      data: {
        url: payload.url || '/study',
      },
    }

    event.waitUntil(self.registration.showNotification(title, options))
  } catch {
    // Fallback for non-JSON payloads
    event.waitUntil(
      self.registration.showNotification('つばめSRS', {
        body: '復習の時間です！',
        icon: '/icon-192x192.png',
        tag: 'tsubame-reminder',
        data: { url: '/study' },
      })
    )
  }
})

// Notification click handler — open or focus the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const url = (event.notification.data?.url as string) || '/study'

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Focus existing tab if found
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.focus()
            if ('navigate' in client) {
              return (client as WindowClient).navigate(url)
            }
            return client
          }
        }
        // Open new tab
        return self.clients.openWindow(url)
      })
  )
})
