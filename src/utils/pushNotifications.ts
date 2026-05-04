import { getAuthToken, getSessionId } from '../api/client'
import { getBaseUrl } from '../api/config'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}

async function getSwRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    return await navigator.serviceWorker.ready
  } catch {
    return null
  }
}

export async function registerServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  } catch {
    // SW registration failed — notifications will only work while tab is open
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied'
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'
  return Notification.requestPermission()
}

export async function subscribeToPushNotifications(): Promise<void> {
  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined
  if (!vapidKey) return

  const reg = await getSwRegistration()
  if (!reg) return

  try {
    const existing = await reg.pushManager.getSubscription()
    const sub = existing ?? await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    })

    const baseUrl = (() => {
      try { return getBaseUrl() } catch { return '' }
    })()
    const endpoint = `${baseUrl}/push/subscribe`

    const token = getAuthToken()
    const sessionId = getSessionId()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (sessionId) headers['X-Session-Id'] = sessionId

    await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(sub.toJSON()),
    }).catch(() => {
      // Server may not support push yet — subscription stored locally for when it does
    })
  } catch {
    // Browser may block push without HTTPS or user denied
  }
}

export async function setupPushNotifications(): Promise<void> {
  const permission = await requestNotificationPermission()
  if (permission !== 'granted') return
  await subscribeToPushNotifications()
}

export function cancelCallNotification(): void {
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.ready
    .then((reg) => reg.active?.postMessage({ type: 'CANCEL_CALL_NOTIFICATION' }))
    .catch(() => {})
}
