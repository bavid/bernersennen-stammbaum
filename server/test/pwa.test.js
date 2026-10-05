const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { useTempDataDir, startApp, cleanup } = require('./helpers')

// Als App aufs Handy (PWA): der Server liefert Manifest, Service Worker und Offline-Seite aus client/dist so, dass der
// Browser sie installieren darf - die Content-Security-Policy (app.js securityHeaders) erlaubt Worker und Manifest von
// hier, das Manifest hat seinen Typ und bleibt cachebar, der Worker selbst kommt immer frisch (no-cache), damit eine
// neue Version nicht eine Stunde im Cache hängt.
const dataDir = useTempDataDir('pwa')
const clientDist = path.join(dataDir, 'dist')
fs.mkdirSync(clientDist)
fs.writeFileSync(path.join(clientDist, 'index.html'), '<!doctype html><title>Chronik</title>')
fs.writeFileSync(path.join(clientDist, 'manifest.webmanifest'), JSON.stringify({ name: 'Familie auf Pfoten', start_url: '/start' }))
fs.writeFileSync(path.join(clientDist, 'sw.js'), '// service worker\nself.addEventListener("fetch", () => {})')
fs.writeFileSync(path.join(clientDist, 'sw-assets.json'), JSON.stringify({ version: 'abc', files: ['/index.html'] }))
fs.writeFileSync(path.join(clientDist, 'offline.html'), '<!doctype html><title>Gerade offline</title>')
process.env.CLIENT_DIST = clientDist

test('PWA: Manifest, Service Worker und Content-Security-Policy', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))

  await t.test('die CSP erlaubt Service Worker, Skripte und Manifest nur von hier', async () => {
    const res = await fetch(`${base}/start`)
    const csp = res.headers.get('content-security-policy')
    assert.match(csp, /(^|;)\s*worker-src 'self'(;|$)/)
    assert.match(csp, /(^|;)\s*manifest-src 'self'(;|$)/)
    assert.match(csp, /(^|;)\s*script-src 'self'(;|$)/)
    assert.doesNotMatch(csp, /unsafe-eval/)
  })

  await t.test('manifest.webmanifest: eigener Typ, cachebar (kein no-store), nicht der SPA-Fallback', async () => {
    const res = await fetch(`${base}/manifest.webmanifest`)
    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type'), /^application\/manifest\+json/)
    const cacheControl = res.headers.get('cache-control') || ''
    assert.doesNotMatch(cacheControl, /no-store/)
    assert.match(cacheControl, /max-age=\d+/)
    assert.equal((await res.json()).name, 'Familie auf Pfoten')
  })

  await t.test('sw.js und seine Dateiliste kommen immer frisch (no-cache) und als Datei', async () => {
    for (const file of ['/sw.js', '/sw-assets.json']) {
      const res = await fetch(`${base}${file}`)
      assert.equal(res.status, 200, file)
      assert.match(res.headers.get('cache-control'), /no-cache/, file)
      assert.doesNotMatch(await res.text(), /<title>Chronik/, `${file} darf nicht die index.html sein`)
    }
    const sw = await fetch(`${base}/sw.js`)
    assert.match(sw.headers.get('content-type'), /javascript/)
  })

  await t.test('offline.html liegt als Datei bereit, die App-Seiten (SPA-Fallback) bleiben wie bisher', async () => {
    const offline = await fetch(`${base}/offline.html`)
    assert.equal(offline.status, 200)
    assert.match(await offline.text(), /Gerade offline/)

    const spa = await fetch(`${base}/einstellungen?bereich=app`)
    assert.equal(spa.status, 200)
    assert.match(await spa.text(), /Chronik/)
    assert.match(spa.headers.get('cache-control'), /no-cache/)
  })
})
