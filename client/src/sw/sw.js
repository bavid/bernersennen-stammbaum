// Service Worker von „Familie auf Pfoten“ - wird von build/swPlugin.js samt lib/swRoutes.js zu EINER Datei dist/sw.js
// gebündelt (kein Framework). Angemeldet nur im Produktions-Build (lib/pwa.js, main.jsx).
//
// Was er tut - und was nicht:
// - Die App-Hülle (index.html, das Start-Bündel, die vorgeladene Schrift, Manifest, Symbole, Offline-Seite) kommt beim
//   Installieren in einen versionierten Cache; alte Versionen räumt activate weg.
// - Gehashte Bündel-Dateien (/assets): aus dem Cache. Schriften, Sticker, Symbole: aus dem Cache, im Hintergrund frisch.
// - Seitenaufrufe: zuerst das Netz, ohne Netz die Offline-Seite („Gerade offline – eure Erinnerungen sind sicher auf dem
//   Server.“).
// - NIE im Cache: die API, Fotos und alles mit Nutzerdaten, Admin und das Bilderrahmen-Gerät (lib/swRoutes.js).
// - skipWaiting nur auf Wunsch der Seite („Neu laden“ im Hinweis „Neue Version verfügbar“), nie von allein.
import { ROUTES, routeFor } from '../lib/swRoutes.js'

// __SW_VERSION__ setzt build/swPlugin.js (Hash der Dateiliste): neue Version -> neuer Cache-Name -> neuer Worker.
const VERSION = typeof __SW_VERSION__ === 'string' ? __SW_VERSION__ : 'dev'
const CACHE_PREFIX = 'pfoten-'
const CACHE = `${CACHE_PREFIX}${VERSION}`
const OFFLINE_URL = '/offline.html'
const ASSETS_URL = '/sw-assets.json'

async function shellFiles() {
  try {
    const res = await fetch(ASSETS_URL, { cache: 'no-store' })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data.files) ? data.files : []
  } catch {
    return []
  }
}

async function precache() {
  const cache = await caches.open(CACHE)
  const files = await shellFiles()
  await cache.addAll([...new Set([OFFLINE_URL, ...files])])
}

async function dropOldCaches() {
  const names = await caches.keys()
  await Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE).map((name) => caches.delete(name)))
}

// Nur vollständige, eigene Antworten merken - keine Fehler, keine Teilantworten (206), nichts Undurchsichtiges.
function isCacheable(response) {
  return Boolean(response) && response.ok && response.status === 200 && response.type === 'basic'
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(request)
  if (hit) return hit
  const response = await fetch(request)
  if (isCacheable(response)) await cache.put(request, response.clone())
  return response
}

async function staleWhileRevalidate(event) {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(event.request)
  const refresh = fetch(event.request)
    .then(async (response) => {
      if (isCacheable(response)) await cache.put(event.request, response.clone())
      return response
    })
    .catch(() => hit || Response.error())
  if (!hit) return refresh
  event.waitUntil(refresh.catch(() => {}))
  return hit
}

async function networkFirstPage(request) {
  try {
    return await fetch(request)
  } catch {
    return (await caches.match(OFFLINE_URL)) || Response.error()
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(dropOldCaches().then(() => self.clients.claim()))
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const route = routeFor(request.url, { method: request.method, mode: request.mode, origin: self.location.origin })
  if (route === ROUTES.networkOnly) return
  if (route === ROUTES.navigation) event.respondWith(networkFirstPage(request))
  else if (route === ROUTES.cacheFirst) event.respondWith(cacheFirst(request))
  else if (route === ROUTES.swr) event.respondWith(staleWhileRevalidate(event))
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})
