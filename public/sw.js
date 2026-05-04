const CACHE_NAME = 'aa2000-portal-v1'

// Push notification from server (browser closed or background)
self.addEventListener('push', (event) => {
  const data = event.data?.json?.() ?? {}
  const title = data.title || 'AA2000 Portal'
  const options = {
    body: data.body || data.message || 'You have a new notification',
    icon: '/logo.avif',
    badge: '/logo.avif',
    tag: data.tag || 'aa2000-notification',
    renotify: true,
    vibrate: [200, 100, 200],
    data: { url: data.url || '/' },
    actions: data.actions || [],
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

// Incoming call push — ring with a dedicated tag so it can be cancelled on answer/reject
self.addEventListener('push', (event) => {
  const data = event.data?.json?.() ?? {}
  if (data.type !== 'incoming_call') return
  const options = {
    body: `${data.callerName || 'Someone'} is calling you`,
    icon: '/logo.avif',
    badge: '/logo.avif',
    tag: 'incoming-call',
    renotify: true,
    requireInteraction: true,
    vibrate: [500, 200, 500, 200, 500],
    data: { url: data.url || '/', type: 'incoming_call', callId: data.callId },
    actions: [
      { action: 'accept', title: 'Accept' },
      { action: 'reject', title: 'Decline' },
    ],
  }
  event.waitUntil(self.registration.showNotification('Incoming Call', options))
})

// Click on notification — focus existing tab or open new one
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) return client.focus()
        }
        return clients.openWindow(url)
      })
  )
})

// Message from main thread (e.g. cancel call notification)
self.addEventListener('message', (event) => {
  if (event.data?.type === 'CANCEL_CALL_NOTIFICATION') {
    self.registration.getNotifications({ tag: 'incoming-call' }).then((notifications) => {
      notifications.forEach((n) => n.close())
    })
  }
})

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})
