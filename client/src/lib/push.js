import { detectPlatform, isStandalone } from './install.js'

// Benachrichtigungen aufs Handy (Web Push, Einstellungen › App - components/settings/app/PushSchalter.jsx): reine Regeln,
// hier testbar. Was der Browser kann (pushSupport), wie der Schalter steht (pushStatus) und der VAPID-Schlüssel in der
// Form, die PushManager.subscribe erwartet (urlBase64ToUint8Array).
export const PUSH_STATUS = Object.freeze({ an: 'an', aus: 'aus', blockiert: 'blockiert' })
export const PUSH_SUPPORT = Object.freeze({ ok: 'ok', iosInstall: 'ios-install', unsupported: 'unsupported' })

// iPhone/iPad können Web Push erst ab iOS 16.4 - und nur, wenn die App auf dem Home-Bildschirm liegt (standalone).
export function pushSupport({ nav = navigator, win = window, platform = detectPlatform(), standalone = isStandalone(win) } = {}) {
  const hasApis = 'serviceWorker' in nav && 'PushManager' in win && 'Notification' in win
  if (platform === 'ios' && !standalone) return PUSH_SUPPORT.iosInstall
  return hasApis ? PUSH_SUPPORT.ok : PUSH_SUPPORT.unsupported
}

// permission: Notification.permission ('default' | 'granted' | 'denied'); subscribed: gibt es ein Abo im Browser?
export function pushStatus({ permission, subscribed }) {
  if (permission === 'denied') return PUSH_STATUS.blockiert
  return subscribed && permission === 'granted' ? PUSH_STATUS.an : PUSH_STATUS.aus
}

export function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(normalized)
  return Uint8Array.from(raw, (char) => char.charCodeAt(0))
}
