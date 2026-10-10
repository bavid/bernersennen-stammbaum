const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { useTempDataDir, startApp, cleanup, call } = require('./helpers')

// Demo fürs öffentliche Entdecken (seed/demo-entdecken-partners.js): zwölf erfundene Partner in mehreren Städten, mit
// Logo, einer davon deutschlandweit freigegeben. Auffrischen ist idempotent, räumt alte Logos weg und lässt echte Partner
// unangetastet. APP_ENV=staging: Demo-Partner stehen ohne ?demo=1 in der Liste.
const dataDir = useTempDataDir('demo-entdecken', { APP_ENV: 'staging' })

test('Demo-Partner fürs öffentliche Entdecken', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const { uploadDir, partnerMediaDir } = require('../config')
  const { replaceDemoPack } = require('../lib/demoPack')
  const { DEMO_ENTDECKEN_PARTNERS } = require('../seed/demo-entdecken-partners')
  const slugs = DEMO_ENTDECKEN_PARTNERS.map((p) => p.slug)
  const logos = () => db.prepare(`SELECT slug, logo_file FROM partners WHERE slug IN (${slugs.map(() => '?').join(',')})`).all(...slugs)

  const realId = db
    .prepare("INSERT INTO partners (slug, name, typ, status, is_demo, logo_file) VALUES ('echt-entdecken', 'Echter Salon', 'hundesalon', 'aktiv', 0, NULL)")
    .run().lastInsertRowid

  replaceDemoPack(db, uploadDir)
  const firstLogos = logos()

  await t.test('zwölf Partner: 3 Tierheime, 4 Hundeschulen, 2 Salons, 2 Betreuung, 1 Sonstige - mit Logo-Datei', () => {
    const typen = db.prepare(`SELECT typ, COUNT(*) AS n FROM partners WHERE slug IN (${slugs.map(() => '?').join(',')}) GROUP BY typ`).all(...slugs)
    assert.deepEqual(Object.fromEntries(typen.map((row) => [row.typ, row.n])), { betreuung: 2, hundesalon: 2, hundeschule: 4, sonstige: 1, tierheim: 3 })
    assert.equal(firstLogos.length, 12)
    for (const { logo_file: file } of firstLogos) assert.ok(fs.existsSync(path.join(partnerMediaDir, file)), file)
    const orte = new Set(db.prepare(`SELECT ort FROM partners WHERE slug IN (${slugs.map(() => '?').join(',')})`).all(...slugs).map((r) => r.ort.split(' ')[0]))
    for (const stadt of ['Hamburg', 'Berlin', 'Köln', 'München', 'Leipzig', 'Stuttgart']) assert.ok(orte.has(stadt), stadt)
  })

  await t.test('öffentliches Entdecken zeigt die Demo: Deutschlandweit-Abschnitt und Suche', async () => {
    const res = await call(base, '/api/public/entdecken')
    assert.deepEqual(res.data.deutschlandweit.map((card) => card.slug).sort(), ['hundeschule-pfotenglueck', 'tierschutznetz-weitblick'])
    assert.ok(res.data.gesamt >= 14)
    const physio = await call(base, '/api/public/entdecken?q=physio')
    assert.deepEqual(physio.data.treffer.map((card) => card.slug), ['tierphysio-sanftschritt'])
    assert.match(physio.data.treffer[0].bildUrl, /^\/partner-media\/[0-9a-f-]{36}\.jpg$/)
    const koeln = await call(base, '/api/public/entdecken', { method: 'POST', body: { plz: '50667', radius: 10, typ: 'betreuung' } })
    assert.deepEqual(koeln.data.treffer.map((card) => card.slug), ['tierbetreuung-rheinwiese'])
  })

  await t.test('erneutes Auffrischen: gleiche Anzahl, neue Logos, alte Dateien weg, echter Partner unberührt', () => {
    replaceDemoPack(db, uploadDir)
    const second = logos()
    assert.equal(second.length, 12)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM partners WHERE is_demo = 1').get().n, 16)
    for (const { logo_file: file } of firstLogos) assert.equal(fs.existsSync(path.join(partnerMediaDir, file)), false, file)
    for (const { logo_file: file } of second) assert.ok(fs.existsSync(path.join(partnerMediaDir, file)), file)
    assert.ok(db.prepare('SELECT 1 FROM partners WHERE id = ? AND is_demo = 0').get(realId))
  })
})
