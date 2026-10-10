const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const { useTempDataDir, startApp, cleanup } = require('./helpers')

// /api/i18n (routes/i18n.js, lib/i18nFiles.js): Manifest und Wörterbücher aus einem gebauten client/dist - hier ein
// temporärer Ordner über CLIENT_DIST.
const distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronik-i18n-dist-'))
const VERSION = 'abc123def456'
const EN = { Anmelden: 'Sign in' }
fs.mkdirSync(path.join(distDir, 'i18n'))
fs.writeFileSync(path.join(distDir, 'i18n', 'manifest.json'), JSON.stringify({ languages: ['de', 'en'], versions: { en: VERSION } }))
fs.writeFileSync(path.join(distDir, 'i18n', 'en.json'), JSON.stringify(EN))
const dataDir = useTempDataDir('i18n', { CLIENT_DIST: distDir })

let app
test.before(async () => {
  app = await startApp()
})
test.after(() => {
  cleanup(dataDir, app.server)
  fs.rmSync(distDir, { recursive: true, force: true })
})

const get = (urlPath, headers = {}) => fetch(`${app.base}${urlPath}`, { headers })

// Status über node:http - fetch schickt selbst „Cache-Control: no-cache“ mit, dann antwortet Express nie mit 304.
function statusOf(urlPath, headers) {
  return new Promise((resolve, reject) => {
    http.get(`${app.base}${urlPath}`, { headers }, (res) => {
      res.resume()
      resolve(res.statusCode)
    }).on('error', reject)
  })
}

test('GET /api/i18n liefert das Manifest, kurz cachebar', async () => {
  const res = await get('/api/i18n')
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('cache-control'), 'public, max-age=300')
  assert.deepEqual(await res.json(), { languages: ['de', 'en'], versions: { en: VERSION } })
})

test('GET /api/i18n/en?v=<Version> liefert die Texte, lange cachebar, ETag = Version', async () => {
  const res = await get(`/api/i18n/en?v=${VERSION}`)
  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-type'), /application\/json/)
  assert.equal(res.headers.get('etag'), `"${VERSION}"`)
  assert.equal(res.headers.get('cache-control'), 'public, max-age=31536000, immutable')
  assert.deepEqual(await res.json(), EN)
})

test('ohne oder mit falschem ?v= nur no-cache; If-None-Match -> 304', async () => {
  for (const url of ['/api/i18n/en', '/api/i18n/en?v=alt']) {
    const res = await get(url)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('cache-control'), 'public, no-cache')
  }
  assert.equal(await statusOf('/api/i18n/en', { 'If-None-Match': `"${VERSION}"` }), 304)
  assert.equal(await statusOf('/api/i18n/en', { 'If-None-Match': '"alt"' }), 200)
})

test('unbekannte, ungültige Sprachen und Deutsch -> 404', async () => {
  for (const lang of ['fr', 'de', 'EN', 'english', '..%2Fmanifest', 'e1']) {
    const res = await get(`/api/i18n/${lang}`)
    assert.equal(res.status, 404, lang)
  }
})

test('lib/i18nFiles: ohne Build null, kaputtes Manifest null, neue Fassung wird gelesen', () => {
  const { createI18nFiles } = require('../lib/i18nFiles')
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'chronik-i18n-empty-'))
  try {
    const files = createI18nFiles(empty)
    assert.equal(files.manifest(), null)
    assert.equal(files.messages('en'), null)
    fs.mkdirSync(path.join(empty, 'i18n'))
    fs.writeFileSync(path.join(empty, 'i18n', 'manifest.json'), '{kaputt')
    assert.equal(files.manifest(), null)
    fs.writeFileSync(path.join(empty, 'i18n', 'manifest.json'), JSON.stringify({ languages: ['en', 'x/'], versions: { en: 'ff00ff00ff00', fr: '<b>' } }))
    assert.deepEqual(files.manifest(), { languages: ['en'], versions: { en: 'ff00ff00ff00' } })
    assert.equal(files.messages('en'), null)
  } finally {
    fs.rmSync(empty, { recursive: true, force: true })
  }
})
