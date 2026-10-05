// Routing des Service Workers (src/sw/sw.js): entscheidet je Anfrage, was mit ihr geschieht. Reine Funktion ohne
// Browser-Objekte, damit sie hier testbar bleibt (swRoutes.test.js) und der Service Worker sie beim Bauen einbindet
// (build/swPlugin.js bündelt sw.js samt dieser Datei zu dist/sw.js).
//
// Grundsatz (Datenschutz): alles mit Nutzerdaten - die API, Fotos (/uploads, /public-media, /partner-media), Rahmen-Fotos,
// Klick-Weiterleitungen - geht IMMER nur ans Netz und landet nie in einem Cache. Gecacht wird nur die App selbst:
// die gehashten Bündel-Dateien, Schriften, Sticker, Symbole und die Offline-Seite.
export const ROUTES = Object.freeze({
  // nicht anfassen - der Browser holt sie wie ohne Service Worker
  networkOnly: 'network-only',
  // gehashte Dateien: aus dem Cache, sonst laden und merken (sie ändern sich nie)
  cacheFirst: 'cache-first',
  // kleine feste Dateien: aus dem Cache antworten, im Hintergrund frisch holen (stale-while-revalidate)
  swr: 'swr',
  // Seitenaufrufe der App: zuerst das Netz, ohne Netz die Offline-Seite
  navigation: 'navigation'
})

const NETWORK_ONLY_PREFIXES = ['/api/', '/uploads/', '/public-media/', '/partner-media/', '/rahmen-foto/', '/r/', '/admin']
const NETWORK_ONLY_EXACT = new Set(['/api', '/health', '/sw.js', '/sw-assets.json', '/robots.txt', '/sitemap.xml'])
// Bilderrahmen auf einem anderen Gerät (App.jsx RAHMEN_PATH): Groß-/Kleinschreibung und Schrägstrich am Ende egal
const RAHMEN_PATH = '/rahmen'
const ASSETS_PREFIX = '/assets/'
const SWR_PREFIXES = ['/schriften/', '/stickers/', '/icons/']
const SWR_EXACT = new Set(['/favicon.svg', '/darstellung-init.js', '/manifest.webmanifest', '/offline.html'])

function parseUrl(url) {
  if (url instanceof URL) return url
  try {
    return new URL(url)
  } catch {
    return null
  }
}

function isRahmenPage(pathname) {
  return pathname.replace(/\/+$/, '').toLowerCase() === RAHMEN_PATH
}

function isNetworkOnlyPath(pathname) {
  return (
    NETWORK_ONLY_EXACT.has(pathname) ||
    NETWORK_ONLY_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    isRahmenPage(pathname)
  )
}

// url: String oder URL der Anfrage; method/mode wie Request.method/Request.mode; origin: self.location.origin.
export function routeFor(url, { method = 'GET', mode = 'no-cors', origin = '' } = {}) {
  const parsed = parseUrl(url)
  if (!parsed || method !== 'GET' || parsed.origin !== origin) return ROUTES.networkOnly
  const { pathname } = parsed
  if (isNetworkOnlyPath(pathname)) return ROUTES.networkOnly
  if (mode === 'navigate') return ROUTES.navigation
  if (pathname.startsWith(ASSETS_PREFIX)) return ROUTES.cacheFirst
  if (SWR_EXACT.has(pathname) || SWR_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return ROUTES.swr
  return ROUTES.networkOnly
}
