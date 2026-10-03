const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { useTempDataDir, startApp, cleanup, call, createHousehold, getCookie } = require('./helpers')

// Phase 3 Task 3: Demo-Inhalte für "Entdecken" (seed/demo-discover.js, lib/demoPack.js) - Demo-
// Empfehlungen, demo_*-Einstellungen und ein Demo-Spendenbericht, die replaceDemoPack mit ersetzt, ohne
// echte Empfehlungen/Einstellungen/Berichte anzufassen (docs/superpowers/plans/2026-09-29-phase-3-entdecken.md).
// t.test() bleibt auf einer Ebene.
const dataDir = useTempDataDir('demo-discover')

const REAL_GOFUNDME_URL = 'https://example.org/echte-spendenseite'
const REAL_TEXT = 'Echter Unterstützen-Text.'
const DEMO_GOFUNDME_URL = 'https://example.org/familie-auf-pfoten-spenden'
const DEMO_TITLES = [
  'Futterhof Deichland – Probierpaket',
  'Futterspende fürs Tierheim',
  'Knusperkorn Sensitive',
  'Patenschaft für Senioren-Hunde',
  'Welpenkurs im Frühjahr'
]
// Futtertexte ohne Gesundheitsversprechen (Plan, Regeln: "Rechtliches") - grobe Stamm-Liste für die Demo.
const HEALTH_PROMISE_RE = /heil|verhinder|gesund|krank|immun|verdauung|allergi|vorbeug|beugt|stärkt|schützt|linder/i

test('Demo-Inhalte für "Entdecken": angelegt, ersetzbar, strikt getrennt von echten Daten', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const { uploadDir, partnerMediaDir } = require('../config')
  const { replaceDemoPack } = require('../lib/demoPack')

  const discover = (cookie) => call(base, '/api/discover', { method: 'POST', body: {}, cookie })
  // Die Demo-Empfehlungen aus seed/demo-discover.js - die Beiträge der Demo-Partner (erstellt_von_partner = 1,
  // Phase P2 Task 9) prüft test/demoPartnerContent.test.js.
  const demoPromotions = () => db.prepare('SELECT * FROM promotions WHERE is_demo = 1 AND erstellt_von_partner = 0 ORDER BY titel').all()
  const demoSettings = () =>
    Object.fromEntries(
      db
        .prepare("SELECT key, value FROM settings WHERE substr(key, 1, 5) = 'demo_' ORDER BY key")
        .all()
        .map((row) => [row.key, row.value])
    )

  // --- Echte Daten, die ein Demo-Wechsel nie anfassen darf ------------------------------------------
  const realPromotionId = db
    .prepare(
      `INSERT INTO promotions (bereich, kennzeichnung, titel, text, url, is_demo)
       VALUES ('futter', 'Anzeige', 'Echte Anzeige', 'Echter Text', 'https://example.org/echt', 0)`
    )
    .run().lastInsertRowid
  const upsertSetting = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  )
  upsertSetting.run('gofundme_url', REAL_GOFUNDME_URL)
  upsertSetting.run('unterstuetzen_text', REAL_TEXT)
  const realReportId = db
    .prepare(
      `INSERT INTO donation_reports (zeitraum, eingang_cents, kosten_cents, weitergeleitet_cents, empfaenger, is_demo)
       VALUES ('2026 Q2', 5000, 1000, 4000, 'Echtes Tierheim', 0)`
    )
    .run().lastInsertRowid
  db.prepare("INSERT INTO link_clicks (target_type, target_id, tag, anzahl) VALUES ('promotion', ?, '2026-09-01', 7)").run(realPromotionId)

  const snapshotReal = () => ({
    promotion: db.prepare('SELECT * FROM promotions WHERE id = ?').get(realPromotionId),
    settings: db.prepare("SELECT key, value FROM settings WHERE key IN ('gofundme_url', 'unterstuetzen_text') ORDER BY key").all(),
    report: db.prepare('SELECT * FROM donation_reports WHERE id = ?').get(realReportId),
    clicks: db.prepare("SELECT * FROM link_clicks WHERE target_type = 'promotion' AND target_id = ?").all(realPromotionId)
  })
  const realBefore = snapshotReal()

  const first = replaceDemoPack(db, uploadDir)
  const household = await createHousehold(base, 'Familie Entdecken Echt')
  const demoLogin = await call(base, '/api/demo', { method: 'POST' })
  const demoCookie = getCookie(demoLogin.res)

  await t.test('nach dem Anlegen: fünf Demo-Empfehlungen (jeder Bereich) mit Kennzeichnung, Link und Partner-Verknüpfung', () => {
    const rows = demoPromotions()
    assert.deepEqual(rows.map((r) => r.titel), DEMO_TITLES)
    assert.deepEqual(first.promotionIds.slice().sort((a, b) => a - b), rows.map((r) => r.id).sort((a, b) => a - b))

    const byTitle = Object.fromEntries(rows.map((r) => [r.titel, r]))
    const pfotenglueck = db.prepare("SELECT id FROM partners WHERE slug = 'hundeschule-pfotenglueck' AND is_demo = 1").get()
    assert.ok(pfotenglueck, 'Demo-Partner Pfotenglück existiert')

    const knusperkorn = byTitle['Knusperkorn Sensitive']
    assert.equal(knusperkorn.bereich, 'futter')
    assert.equal(knusperkorn.kennzeichnung, 'Empfehlung')
    assert.equal(knusperkorn.empfohlen_von, 'Hundeschule Pfotenglück')
    assert.equal(knusperkorn.url, 'https://example.org/knusperkorn')
    assert.ok(knusperkorn.text && knusperkorn.text.length > 20, 'sachlicher Text vorhanden')

    const probierpaket = byTitle['Futterhof Deichland – Probierpaket']
    assert.equal(probierpaket.bereich, 'futter')
    assert.equal(probierpaket.kennzeichnung, 'Anzeige')
    assert.equal(probierpaket.url, 'https://example.org/futterhof-deichland')

    const welpenkurs = byTitle['Welpenkurs im Frühjahr']
    assert.equal(welpenkurs.bereich, 'hundeschule')
    assert.equal(welpenkurs.kennzeichnung, 'Partner')
    assert.equal(welpenkurs.partner_id, pfotenglueck.id, 'mit dem Demo-Partner Pfotenglück verknüpft')
    assert.equal(welpenkurs.url, 'https://example.org/pfotenglueck-welpenkurs')
    assert.ok(welpenkurs.bild_file, 'Welpenkurs zeigt auch das Bild-Feature')
    assert.ok(fs.existsSync(path.join(partnerMediaDir, welpenkurs.bild_file)), 'Bilddatei liegt im partner-media-Ordner')

    const sonnenhang = db.prepare("SELECT id FROM partners WHERE slug = 'tierheim-sonnenhang' AND is_demo = 1").get()
    assert.ok(sonnenhang, 'Demo-Tierheim Sonnenhang existiert')
    const patenschaft = byTitle['Patenschaft für Senioren-Hunde']
    assert.equal(patenschaft.bereich, 'begleiter')
    assert.equal(patenschaft.kennzeichnung, 'Partner')
    assert.equal(patenschaft.partner_id, sonnenhang.id, 'mit dem Demo-Tierheim Sonnenhang verknüpft')
    assert.equal(patenschaft.url, 'https://example.org/patenschaft')
    assert.ok(patenschaft.text && patenschaft.text.length > 20, 'sachlicher Text vorhanden')

    const futterspende = byTitle['Futterspende fürs Tierheim']
    assert.equal(futterspende.bereich, 'unterstuetzen')
    assert.equal(futterspende.kennzeichnung, 'Empfehlung')
    assert.equal(futterspende.empfohlen_von, 'Familie auf Pfoten')
    assert.equal(futterspende.url, 'https://example.org/futterspende')
    assert.ok(futterspende.text && futterspende.text.length > 20, 'sachlicher Text vorhanden')

    assert.deepEqual([...new Set(rows.map((r) => r.bereich))].sort(), ['begleiter', 'futter', 'hundeschule', 'unterstuetzen'], 'die Demo zeigt jeden Bereich')

    for (const row of rows) {
      assert.equal(row.aktiv, 1)
      assert.equal(row.start, null, 'kein Zeitfenster')
      assert.equal(row.ende, null, 'kein Zeitfenster')
      assert.doesNotMatch(row.text || '', HEALTH_PROMISE_RE, `${row.titel}: keine Gesundheitsversprechen`)
    }
  })

  await t.test('nach dem Anlegen: Demo-Einstellungen unter eigenen Schlüsseln, ein Demo-Spendenbericht', () => {
    const settings = demoSettings()
    assert.deepEqual(Object.keys(settings), ['demo_gofundme_url', 'demo_unterstuetzen_text'])
    assert.equal(settings.demo_gofundme_url, DEMO_GOFUNDME_URL)
    assert.ok(settings.demo_unterstuetzen_text.length > 20, 'kurzer freundlicher Text')

    const reports = db.prepare('SELECT * FROM donation_reports WHERE is_demo = 1').all()
    assert.equal(reports.length, 1)
    assert.equal(reports[0].zeitraum, '2026 Q3')
    assert.equal(reports[0].eingang_cents, 125000)
    assert.equal(reports[0].kosten_cents, 18000)
    assert.equal(reports[0].weitergeleitet_cents, 100000)
    assert.equal(reports[0].empfaenger, 'Tierheim Sonnenhang')

    assert.deepEqual(snapshotReal(), realBefore, 'echte Empfehlung, Einstellungen, Bericht und Klicks unverändert')
  })

  await t.test('Demo-Sitzung: POST /api/discover zeigt die Demo-Empfehlungen, den Demo-GoFundMe-Link und den Demo-Bericht', async () => {
    assert.equal(demoLogin.status, 200)
    assert.equal(demoLogin.data.isDemo, true)
    const res = await discover(demoCookie)
    assert.equal(res.status, 200)

    assert.deepEqual(res.data.futter.map((p) => p.titel).sort(), ['Futterhof Deichland – Probierpaket', 'Knusperkorn Sensitive'])
    const knusperkorn = res.data.futter.find((p) => p.titel === 'Knusperkorn Sensitive')
    assert.equal(knusperkorn.kennzeichnung, 'Empfehlung')
    assert.equal(knusperkorn.empfohlenVon, 'Hundeschule Pfotenglück')
    assert.equal(knusperkorn.clickUrl, `/r/promotion/${knusperkorn.id}`)

    // Phase V1: eine Karte je Partner - die freigegebenen Beiträge der Demo-Hundeschule (seed/demo-partner-area.js
    // POSTS) stehen in ihrer gewählten Reihenfolge auf ihrer Karte. Die verknüpfte "Welpenkurs im Frühjahr" hat
    // Pfotenglück aus der Karte genommen (KARTEN nurPortal) - sie bleibt auf dem Portal, samt Bild.
    assert.ok(!res.data.hundeschulen.some((e) => e.kind === 'promotion'), 'keine Anzeige als eigene Karte')
    const pfotenglueckCard = res.data.hundeschulen.find((e) => e.kind === 'partner' && e.slug === 'hundeschule-pfotenglueck')
    assert.deepEqual(pfotenglueckCard.anzeigen.map((p) => p.titel), ['Welpenkurs ab Oktober', 'Einzeltraining am Abend'])
    const portal = await call(base, '/api/public/partners/hundeschule-pfotenglueck/posts')
    assert.match(portal.data.find((p) => p.titel === 'Welpenkurs im Frühjahr').bildUrl, /^\/partner-media\//)

    assert.deepEqual(res.data.begleiter.promotions, [], 'die Patenschaft steht auf der Karte des Tierheims')
    const sonnenhangCard = res.data.begleiter.partner.find((e) => e.slug === 'tierheim-sonnenhang')
    assert.deepEqual(sonnenhangCard.anzeigen.map((p) => p.titel), ['Patenschaft für Senioren-Hunde'])
    const patenschaft = sonnenhangCard.anzeigen[0]
    assert.equal(patenschaft.kennzeichnung, 'Partner')
    assert.equal(patenschaft.clickUrl, `/r/promotion/${patenschaft.id}`)

    // Phase V4a: dazu der Pfoten-Flohmarkt des Tierheims (seed/demo-partner-area.js POSTS, mit mehreren Terminen).
    assert.deepEqual(res.data.unterstuetzen.promotions.map((p) => p.titel), ['Futterspende fürs Tierheim', 'Pfoten-Flohmarkt'])
    const futterspende = res.data.unterstuetzen.promotions[0]
    assert.equal(futterspende.kennzeichnung, 'Empfehlung')
    assert.equal(futterspende.empfohlenVon, 'Familie auf Pfoten')
    assert.equal(futterspende.clickUrl, `/r/promotion/${futterspende.id}`)

    assert.equal(res.data.unterstuetzen.gofundmeUrl, DEMO_GOFUNDME_URL)
    assert.equal(res.data.unterstuetzen.gofundmeClickUrl, '/r/gofundme/1')
    assert.equal(res.data.unterstuetzen.text, demoSettings().demo_unterstuetzen_text)
    assert.deepEqual(res.data.unterstuetzen.bericht, {
      zeitraum: '2026 Q3',
      eingangCents: 125000,
      kostenCents: 18000,
      weitergeleitetCents: 100000,
      empfaenger: 'Tierheim Sonnenhang',
      nachweisUrl: 'https://example.org/familie-auf-pfoten-spendenbericht-2026-q3'
    })

    const redirect = await fetch(`${base}/r/gofundme/1`, { redirect: 'manual' })
    assert.equal(redirect.status, 302)
    assert.equal(redirect.headers.get('location'), DEMO_GOFUNDME_URL)
  })

  await t.test('echte Sitzung: keine Demo-Empfehlungen, kein Demo-Bericht, echte Einstellungen', async () => {
    const res = await discover(household.cookie)
    assert.equal(res.status, 200)

    const promotionTitles = [
      ...res.data.futter,
      ...res.data.hundeschulen.filter((e) => e.kind === 'promotion'),
      ...res.data.begleiter.promotions,
      ...res.data.unterstuetzen.promotions
    ].map((p) => p.titel)
    assert.deepEqual(promotionTitles, ['Echte Anzeige'])
    for (const title of DEMO_TITLES) assert.ok(!promotionTitles.includes(title), `${title} bleibt der Demo vorbehalten`)

    assert.equal(res.data.unterstuetzen.gofundmeUrl, REAL_GOFUNDME_URL)
    assert.equal(res.data.unterstuetzen.gofundmeClickUrl, '/r/gofundme/0')
    assert.equal(res.data.unterstuetzen.text, REAL_TEXT)
    assert.equal(res.data.unterstuetzen.bericht.zeitraum, '2026 Q2')
    assert.equal(res.data.unterstuetzen.bericht.empfaenger, 'Echtes Tierheim')
  })

  await t.test('zweites Ersetzen: keine Duplikate, keine verwaisten Klicks/Verweise/Bilder, echte Daten unberührt', async () => {
    // Klicks auf Demo-Empfehlung und Demo-Partner-Website - die hängen an Ids, die das Ersetzen löscht.
    const oldPromotions = demoPromotions()
    const oldPromotionIds = oldPromotions.map((r) => r.id)
    const oldImages = oldPromotions.map((r) => r.bild_file).filter(Boolean)
    const oldPfotenglueck = db.prepare("SELECT id FROM partners WHERE slug = 'hundeschule-pfotenglueck' AND is_demo = 1").get()
    assert.equal((await fetch(`${base}/r/promotion/${oldPromotionIds[0]}`, { redirect: 'manual' })).status, 302)
    assert.equal((await fetch(`${base}/r/partner-website/${oldPfotenglueck.id}`, { redirect: 'manual' })).status, 302)
    assert.ok(db.prepare("SELECT COUNT(*) AS n FROM link_clicks WHERE target_type = 'promotion' AND target_id = ?").get(oldPromotionIds[0]).n > 0)

    const second = replaceDemoPack(db, uploadDir)

    const rows = demoPromotions()
    assert.deepEqual(rows.map((r) => r.titel), DEMO_TITLES, 'wieder genau fünf Demo-Empfehlungen, keine Duplikate')
    assert.deepEqual(second.promotionIds.slice().sort((a, b) => a - b), rows.map((r) => r.id).sort((a, b) => a - b))
    assert.equal(
      db.prepare(`SELECT COUNT(*) AS n FROM promotions WHERE id IN (${oldPromotionIds.map(() => '?').join(', ')})`).get(...oldPromotionIds).n,
      0,
      'alte Demo-Empfehlungen sind weg'
    )
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM donation_reports WHERE is_demo = 1').get().n, 1, 'genau ein Demo-Bericht')
    assert.deepEqual(Object.keys(demoSettings()), ['demo_gofundme_url', 'demo_unterstuetzen_text'])

    const newPfotenglueck = db.prepare("SELECT id FROM partners WHERE slug = 'hundeschule-pfotenglueck' AND is_demo = 1").get()
    assert.equal(rows.find((r) => r.titel === 'Welpenkurs im Frühjahr').partner_id, newPfotenglueck.id, 'zeigt auf den NEUEN Demo-Partner')
    const newSonnenhang = db.prepare("SELECT id FROM partners WHERE slug = 'tierheim-sonnenhang' AND is_demo = 1").get()
    assert.equal(rows.find((r) => r.titel === 'Patenschaft für Senioren-Hunde').partner_id, newSonnenhang.id, 'zeigt auf das NEUE Demo-Tierheim')

    const orphanPromotionClicks = db
      .prepare("SELECT COUNT(*) AS n FROM link_clicks WHERE target_type = 'promotion' AND target_id NOT IN (SELECT id FROM promotions)")
      .get().n
    assert.equal(orphanPromotionClicks, 0, 'keine Klicks auf gelöschte Empfehlungen')
    const orphanPartnerClicks = db
      .prepare(
        `SELECT COUNT(*) AS n FROM link_clicks
         WHERE target_type IN ('partner-website', 'partner-spende') AND target_id NOT IN (SELECT id FROM partners)`
      )
      .get().n
    assert.equal(orphanPartnerClicks, 0, 'keine Klicks auf gelöschte Demo-Partner')
    const orphanPartnerRefs = db
      .prepare('SELECT COUNT(*) AS n FROM promotions WHERE partner_id IS NOT NULL AND partner_id NOT IN (SELECT id FROM partners)')
      .get().n
    assert.equal(orphanPartnerRefs, 0, 'keine Empfehlung zeigt auf einen gelöschten Partner')

    for (const file of oldImages) assert.equal(fs.existsSync(path.join(partnerMediaDir, file)), false, `altes Bild ${file} ist weg`)
    const liveImages = rows.map((r) => r.bild_file).filter(Boolean)
    assert.deepEqual(fs.readdirSync(partnerMediaDir).sort(), liveImages.sort(), 'keine verwaisten Bilddateien')

    assert.deepEqual(snapshotReal(), realBefore, 'echte Empfehlung, Einstellungen, Bericht und Klicks unverändert')
  })

  await t.test('echte Empfehlung, die auf einen alten Demo-Partner zeigt, verliert nur diesen Verweis', () => {
    const demoPartnerId = db.prepare("SELECT id FROM partners WHERE slug = 'tierheim-sonnenhang' AND is_demo = 1").get().id
    const linkedId = db
      .prepare(
        `INSERT INTO promotions (partner_id, bereich, kennzeichnung, titel, is_demo)
         VALUES (?, 'hundeschule', 'Partner', 'Echt, aber mit Demo-Partner', 0)`
      )
      .run(demoPartnerId).lastInsertRowid

    replaceDemoPack(db, uploadDir)

    const row = db.prepare('SELECT * FROM promotions WHERE id = ?').get(linkedId)
    assert.ok(row, 'die echte Empfehlung selbst bleibt bestehen')
    assert.equal(row.is_demo, 0)
    assert.equal(row.titel, 'Echt, aber mit Demo-Partner')
    assert.equal(row.partner_id, null, 'der Verweis auf den gelöschten Demo-Partner wird genullt')
  })

  // Gesamter Demo- und Echt-Zustand, den ein gescheitertes replaceDemoPack unverändert lassen muss.
  const snapshotAll = () => ({
    demoFamilies: db.prepare('SELECT id, name, art FROM families WHERE is_demo = 1 ORDER BY id').all(),
    demoPartners: db.prepare('SELECT * FROM partners WHERE is_demo = 1 ORDER BY id').all(),
    demoPromotions: db.prepare('SELECT * FROM promotions WHERE is_demo = 1 ORDER BY id').all(),
    demoSettings: demoSettings(),
    demoReports: db.prepare('SELECT * FROM donation_reports WHERE is_demo = 1 ORDER BY id').all(),
    realPromotions: db.prepare('SELECT * FROM promotions WHERE is_demo = 0 ORDER BY id').all(),
    real: snapshotReal(),
    mediaFiles: fs.readdirSync(partnerMediaDir).sort(),
    uploadFiles: fs.readdirSync(uploadDir).sort()
  })
  const seed = require('../seed/demo-discover')

  await t.test('Rollback: scheitert eine Demo-Empfehlung (unbekannter Partner-Slug), bleibt die bisherige Demo samt echten Daten vollständig erhalten', () => {
    const before = snapshotAll()
    assert.equal(before.demoPromotions.length, 12, 'Ausgangslage: eine vollständige Demo (5 Empfehlungen, 7 Beiträge der Demo-Partner)')

    seed.DEMO_PROMOTIONS.push({
      bereich: 'hundeschule',
      kennzeichnung: 'Partner',
      partnerSlug: 'gibt-es-nicht',
      titel: 'Kaputte Demo-Empfehlung'
    })
    try {
      assert.throws(() => replaceDemoPack(db, uploadDir), /Demo-Partner "gibt-es-nicht" fehlt/)
    } finally {
      seed.DEMO_PROMOTIONS.pop()
    }

    assert.deepEqual(snapshotAll(), before, 'Demo-Familien, -Partner, -Empfehlungen, -Einstellungen, -Bericht, Bilder und echte Daten unverändert')
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM promotions WHERE titel = 'Kaputte Demo-Empfehlung'").get().n, 0)
  })

  await t.test('ungültiger Demo-Spendenbericht scheitert laut (dieselbe Prüfung wie im Admin) und ändert nichts', () => {
    const before = snapshotAll()
    const original = seed.DEMO_DONATION_REPORT.eingangCents
    seed.DEMO_DONATION_REPORT.eingangCents = -1
    try {
      assert.throws(() => replaceDemoPack(db, uploadDir), /Der Eingang muss eine ganze Zahl/)
    } finally {
      seed.DEMO_DONATION_REPORT.eingangCents = original
    }
    assert.deepEqual(snapshotAll(), before, 'nichts wurde halb ersetzt')
  })
})
