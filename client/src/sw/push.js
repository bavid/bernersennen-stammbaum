// Benachrichtigungen aufs Handy im Service Worker: eine Push-Nachricht des Servers (server/lib/push.js, fester Text ohne
// Namen) wird als Systemmitteilung gezeigt; ein Tippen darauf holt die App nach vorn (oder öffnet sie) auf /start, wo die
// Glocke die Einzelheiten zeigt. Reine Helfer (notificationOptions, safeUrl) sind hier testbar (push.test.js).
const ICON_URL = '/icons/icon-192.png'
const FALLBACK_URL = '/start'

// Nur Pfade dieser App - nie eine fremde Adresse aus einer Nachricht öffnen.
export function safeUrl(url) {
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url : FALLBACK_URL
}

export function notificationOptions(payload) {
  return {
    body: typeof payload.text === 'string' ? payload.text : '',
    icon: ICON_URL,
    badge: ICON_URL,
    // je Ereignis eine Mitteilung - drei Grüße ergeben nicht drei Zeilen, die neue ersetzt die alte
    tag: typeof payload.ereignis === 'string' ? `pfoten-${payload.ereignis}` : 'pfoten',
    renotify: true,
    data: { url: safeUrl(payload.url) }
  }
}

export function parsePayload(event) {
  try {
    const data = event.data ? event.data.json() : null
    return data && typeof data === 'object' && typeof data.titel === 'string' ? data : null
  } catch {
    return null
  }
}

async function focusOrOpen(url) {
  const target = new URL(url, self.location.origin).href
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  const open = windows.find((client) => 'focus' in client)
  if (open) {
    await open.focus()
    if ('navigate' in open) await open.navigate(target).catch(() => {})
    return
  }
  if (self.clients.openWindow) await self.clients.openWindow(target)
}

export function handlePush(event) {
  const payload = parsePayload(event)
  if (!payload) return
  event.waitUntil(self.registration.showNotification(payload.titel, notificationOptions(payload)))
}

export function handleNotificationClick(event) {
  event.notification.close()
  event.waitUntil(focusOrOpen(safeUrl(event.notification.data?.url)))
}
