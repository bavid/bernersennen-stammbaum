import { describe, expect, test } from 'vitest'
import { ROUTES, routeFor } from './swRoutes.js'

const ORIGIN = 'https://pfoten.example'
const at = (path, options = {}) => routeFor(`${ORIGIN}${path}`, { origin: ORIGIN, ...options })

describe('routeFor: was der Service Worker mit einer Anfrage macht', () => {
  test('API, Fotos und alles mit Nutzerdaten gehen immer nur ans Netz - nie in den Cache', () => {
    for (const path of [
      '/api/me',
      '/api/timeline?dog=3',
      '/uploads/abc.jpg',
      '/public-media/abc.jpg',
      '/partner-media/logo.png',
      '/rahmen-foto/xyz',
      '/r/partner/12',
      '/health'
    ]) {
      expect(at(path), path).toBe(ROUTES.networkOnly)
    }
  })

  test('Admin und Bilderrahmen-Gerät (/rahmen) bleiben ganz ohne Service Worker - auch als Seitenaufruf', () => {
    for (const path of ['/admin', '/admin/', '/admin/gutscheine/3/druck', '/admin-ansicht/7', '/rahmen', '/rahmen/', '/Rahmen']) {
      expect(at(path, { mode: 'navigate' }), path).toBe(ROUTES.networkOnly)
    }
  })

  test('der Service Worker selbst, seine Dateiliste, robots und sitemap kommen frisch vom Server', () => {
    for (const path of ['/sw.js', '/sw-assets.json', '/robots.txt', '/sitemap.xml']) {
      expect(at(path), path).toBe(ROUTES.networkOnly)
    }
  })

  test('nur GET und nur die eigene Herkunft', () => {
    expect(at('/assets/index-abc123.js', { method: 'POST' })).toBe(ROUTES.networkOnly)
    expect(routeFor('https://fremd.example/assets/index-abc123.js', { origin: ORIGIN })).toBe(ROUTES.networkOnly)
  })

  test('gehashte Bündel-Dateien unter /assets: aus dem Cache, einmal geladen ändern sie sich nie', () => {
    expect(at('/assets/index-DdNWT19k.css')).toBe(ROUTES.cacheFirst)
    expect(at('/assets/AdminPage-BqP-Q0yp.js')).toBe(ROUTES.cacheFirst)
    expect(at('/assets/figtree-latin-wght-normal-D_ZTVpCC.woff2')).toBe(ROUTES.cacheFirst)
  })

  test('Schriften, Sticker, Symbole und die kleinen festen Dateien der Hülle: erst aus dem Cache, im Hintergrund frisch', () => {
    for (const path of [
      '/schriften/LIZENZEN.txt',
      '/stickers/herz.svg',
      '/icons/icon-192.png',
      '/favicon.svg',
      '/darstellung-init.js',
      '/manifest.webmanifest',
      '/offline.html'
    ]) {
      expect(at(path), path).toBe(ROUTES.swr)
    }
  })

  test('Seitenaufrufe der App: zuerst das Netz, ohne Netz die Offline-Seite', () => {
    for (const path of ['/', '/start', '/tiere/4', '/v', '/p/pfotenglueck', '/einstellungen?bereich=app']) {
      expect(at(path, { mode: 'navigate' }), path).toBe(ROUTES.navigation)
    }
    // API-Pfade bleiben auch als Navigation ohne Service Worker (z. B. ein direkt geöffnetes JSON)
    expect(at('/api/me', { mode: 'navigate' })).toBe(ROUTES.networkOnly)
  })

  test('unbekannte sonstige Anfragen (z. B. ein Bild von einer App-Route) gehen ans Netz', () => {
    expect(at('/irgendwas.png')).toBe(ROUTES.networkOnly)
  })

  test('nimmt auch ein URL-Objekt und eine unvollständige Adresse ohne Fehler', () => {
    expect(routeFor(new URL(`${ORIGIN}/assets/a-1.js`), { origin: ORIGIN })).toBe(ROUTES.cacheFirst)
    expect(routeFor('nicht-eine-url', { origin: ORIGIN })).toBe(ROUTES.networkOnly)
  })
})
