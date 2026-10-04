const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { useTempDataDir, startApp, cleanup, call } = require('./helpers')

// Phase V4b: die Demo-Partner bekommen Ansprechperson und Bannerfotos (seed/demo-partners.js, seed/demo-partner-area.js
// BANNER) - eigene Kopien vorhandener Seed-Bilder, beim Ersetzen der Demo ohne Waisen. APP_ENV=staging: Demo-Partner
// sind dort ohne ?demo=1 sichtbar (wie test/demoPartnerArea.test.js).
const dataDir = useTempDataDir('demo-partner-banner', { APP_ENV: 'staging' })

test('Demo-Partner: Ansprechperson und Bannerfotos, Ersetzen ohne Waisen', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const { uploadDir } = require('../config')
  const { replaceDemoPack } = require('../lib/demoPack')
  const { BANNER } = require('../seed/demo-partner-area')

  const bannerRows = () =>
    db.prepare('SELECT p.slug, b.position, b.alt, b.foto_url, b.is_demo FROM partner_banner b JOIN partners p ON p.id = b.partner_id ORDER BY p.slug, b.position').all()

  const result = replaceDemoPack(db, uploadDir)
  assert.deepEqual(result.banner, { 'hundeschule-pfotenglueck': 2, 'hundesalon-wuschelglueck': 1, 'tierheim-sonnenhang': 3 })

  await t.test('Bannerfotos in Seed-Reihenfolge, als Demo markiert, jede Datei eine eigene Kopie', () => {
    const rows = bannerRows()
    assert.equal(rows.length, BANNER.length)
    assert.ok(rows.every((row) => row.is_demo === 1))
    const pfoten = rows.filter((row) => row.slug === 'hundeschule-pfotenglueck')
    assert.deepEqual(pfoten.map((row) => row.position), [1, 2])
    assert.deepEqual(pfoten.map((row) => row.alt), ['Welpen toben über die Trainingswiese', 'Berner Sennenhund beim Wassertraining am See'])
    const files = rows.map((row) => path.basename(row.foto_url))
    assert.equal(new Set(files).size, files.length)
    for (const file of files) assert.ok(fs.existsSync(path.join(uploadDir, file)), file)
    const einblickFiles = db.prepare('SELECT foto_url FROM partner_einblicke').all().map((row) => path.basename(row.foto_url))
    assert.ok(files.every((file) => !einblickFiles.includes(file)), 'keine Datei mit einem Einblick geteilt')
  })

  await t.test('Portal der Demo: zwei Bannerfotos und die Ansprechperson, Fotos über /public-media erreichbar', async () => {
    const portal = await call(base, '/api/public/partners/hundeschule-pfotenglueck')
    assert.equal(portal.status, 200)
    assert.equal(portal.data.ansprechperson, 'Anna Berg')
    assert.equal(portal.data.banner.length, 2)
    for (const banner of portal.data.banner) {
      assert.match(banner.fotoUrl, /^\/public-media\/[0-9a-f-]{36}\.jpg$/)
      assert.equal((await fetch(`${base}${banner.fotoUrl}`)).status, 200)
    }
    // Feedback-Runde: Pfotenglück zeigt seine zwei Fotos halb/halb, das Tierheim drei.
    assert.equal(portal.data.bannerLayout, 'halb')
    const sonnenhang = await call(base, '/api/public/partners/tierheim-sonnenhang')
    assert.equal(sonnenhang.data.bannerLayout, 'drei')
    assert.equal(sonnenhang.data.banner.length, 3)
    const deichland = await call(base, '/api/public/partners/tierschutzverein-deichland')
    assert.deepEqual(deichland.data.banner, [])
    assert.equal(deichland.data.ansprechperson, null)
  })

  await t.test('erneut ersetzen: dieselbe Anzahl, die alten Dateien sind weg', () => {
    const oldFiles = bannerRows().map((row) => path.join(uploadDir, path.basename(row.foto_url)))
    replaceDemoPack(db, uploadDir)
    replaceDemoPack(db, uploadDir)
    assert.equal(bannerRows().length, BANNER.length)
    for (const file of oldFiles) assert.equal(fs.existsSync(file), false, `${path.basename(file)} entfernt`)
    const orphans = db.prepare('SELECT COUNT(*) AS n FROM partner_banner WHERE partner_id NOT IN (SELECT id FROM partners)').get().n
    assert.equal(orphans, 0)
  })
})
