// Service Worker der App (src/sw/sw.js -> dist/sw.js, gebaut von build/swPlugin.js): hier das Anmelden aus main.jsx und
// die Logik hinter „Neue Version verfügbar · Neu laden“ (hooks/useServiceWorkerUpdate.js, components/PwaUpdate.jsx).
// Nur im Produktions-Build - in der Entwicklung (vite dev) gibt es kein dist/sw.js, und ein Cache stünde dem
// Nachladen beim Entwickeln nur im Weg.
export const SW_URL = '/sw.js'
export const SKIP_WAITING_MESSAGE = Object.freeze({ type: 'SKIP_WAITING' })

export function canRegisterServiceWorker({ prod = import.meta.env.PROD, nav = navigator } = {}) {
  return Boolean(prod) && 'serviceWorker' in nav
}

// Meldet einen Worker, der fertig installiert ist und auf das Übernehmen wartet (onWaiting(worker)) - sofort, wenn er
// schon wartet, sonst sobald eine gefundene neue Version fertig ist. Beim allerersten Installieren (noch steuert kein
// Worker die Seite) gibt es nichts zu melden: die Seite läuft ja schon in der aktuellen Version.
export function watchForWaitingWorker(registration, nav, onWaiting) {
  if (!registration) return
  if (registration.waiting && nav.serviceWorker?.controller) onWaiting(registration.waiting)
  registration.addEventListener('updatefound', () => {
    const worker = registration.installing
    if (!worker) return
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && nav.serviceWorker?.controller) onWaiting(worker)
    })
  })
}

// „Neu laden“: der wartende Worker übernimmt (skipWaiting im Worker), und sobald er die Seite steuert, lädt sie einmal
// neu - so landet die neue Version ohne Hänger. Nie ohne Klick (der Worker selbst ruft skipWaiting nicht von allein).
export function applyWaitingWorker(waiting, win = window) {
  if (!waiting) return
  let reloaded = false
  win.navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return
    reloaded = true
    win.location.reload()
  })
  waiting.postMessage(SKIP_WAITING_MESSAGE)
}

// Anmelden - gibt die Registrierung zurück oder null (nicht möglich oder fehlgeschlagen; ein Fehler hier darf die App
// nie stören, der Worker ist Komfort).
export async function registerServiceWorker({ nav = navigator, onWaiting = () => {} } = {}) {
  if (!canRegisterServiceWorker({ nav })) return null
  try {
    const registration = await nav.serviceWorker.register(SW_URL)
    watchForWaitingWorker(registration, nav, onWaiting)
    return registration
  } catch (err) {
    console.warn('Service Worker konnte nicht angemeldet werden', err)
    return null
  }
}
