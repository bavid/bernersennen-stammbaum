import { urlBase64ToUint8Array } from './push.js'

// Der Browser-Teil von „Benachrichtigungen aufs Handy“ (Einstellungen › App): Erlaubnis fragen, Abo beim Service Worker
// anlegen oder kündigen. Die Erlaubnis wird NUR auf Tippen gefragt (subscribePush aus dem Schalter), nie beim Laden.
// Als Objekt gebündelt, damit components/settings/app/PushSchalter.jsx es in Tests gegen eine Attrappe tauschen kann.
async function registration(nav) {
  return (await nav.serviceWorker?.getRegistration?.()) || null
}

export async function currentSubscription(nav = navigator) {
  const reg = await registration(nav)
  return (await reg?.pushManager?.getSubscription()) || null
}

export function currentPermission(win = window) {
  return win.Notification?.permission || 'default'
}

// -> { permission, subscription | null } - ohne Erlaubnis kein Abo; ohne aktiven Worker (z. B. gerade erst installiert)
// wartet serviceWorker.ready.
export async function subscribePush(publicKey, { nav = navigator, win = window } = {}) {
  const permission = await win.Notification.requestPermission()
  if (permission !== 'granted') return { permission, subscription: null }
  const reg = await nav.serviceWorker.ready
  const subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) })
  return { permission, subscription }
}

// Kündigt das Abo im Browser; gibt den Endpunkt zurück (für DELETE /api/push/abo) oder null.
export async function unsubscribePush(nav = navigator) {
  const subscription = await currentSubscription(nav)
  if (!subscription) return null
  await subscription.unsubscribe()
  return subscription.endpoint
}

export const pushClient = Object.freeze({ currentSubscription, currentPermission, subscribePush, unsubscribePush })
