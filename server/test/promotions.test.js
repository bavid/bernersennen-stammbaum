const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, createFamily, getCookie } = require('./helpers')

const ADMIN_TEST_PASSWORD = 'admin-test-promotions-1'
const dataDir = useTempDataDir('promotions')

// PNG-Signatur (8 Bytes) + etwas Nutzlast, damit detectImageExt sie erkennt - wie in partners.test.js.
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]) // Signatur + IEND
const JPG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 1, 2, 0xff, 0xd9]) // SOI, APP0, EOI
const SVG_BYTES = Buffer.from('<svg onload="alert(1)"></svg>')

function samplePromotion(overrides = {}) {
  return {
    bereich: 'futter',
    kennzeichnung: 'Anzeige',
    titel: 'Futterhof Deichland – Probierpaket',
    ...overrides
  }
}

async function uploadImage(base, cookie, id, buffer, filename, mimeType) {
  const form = new FormData()
  form.append('file', new Blob([buffer], { type: mimeType }), filename)
  const res = await fetch(`${base}/api/admin/promotions/${id}/image`, { method: 'POST', headers: { Cookie: cookie }, body: form })
  const text = await res.text()
  return { status: res.status, data: text ? JSON.parse(text) : null }
}

test('Empfehlungen/Anzeigen, Einstellungen, Spendenberichte: Admin-Pflege für "Entdecken"', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))

  const login = await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: ADMIN_TEST_PASSWORD } })
  const adminCookie = getCookie(login.res)

  const post = (urlPath, body, cookie = adminCookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const put = (urlPath, body, cookie = adminCookie) => call(base, urlPath, { method: 'PUT', body, cookie })
  const get = (urlPath, cookie = adminCookie) => call(base, urlPath, { cookie })
  const del = (urlPath, cookie = adminCookie) => call(base, urlPath, { method: 'DELETE', cookie })

  await t.test('Anlegen: Titel/Bereich/Kennzeichnung Pflicht, unbekannte Werte -> 400', async () => {
    assert.equal((await post('/api/admin/promotions', samplePromotion({ titel: '' }))).status, 400)
    assert.equal((await post('/api/admin/promotions', samplePromotion({ bereich: 'unbekannt' }))).status, 400)
    assert.equal((await post('/api/admin/promotions', samplePromotion({ kennzeichnung: 'Werbung' }))).status, 400)
    assert.equal((await post('/api/admin/promotions', samplePromotion({ titel: 'x'.repeat(121) }))).status, 400)
  })

  await t.test('Anlegen: Empfehlung ohne "empfohlen von" -> 400, mit "empfohlen von" -> 201', async () => {
    const missing = await post('/api/admin/promotions', samplePromotion({ kennzeichnung: 'Empfehlung', titel: 'Knusperkorn Sensitive' }))
    assert.equal(missing.status, 400)

    const ok = await post(
      '/api/admin/promotions',
      samplePromotion({ kennzeichnung: 'Empfehlung', titel: 'Knusperkorn Sensitive', empfohlenVon: 'Hundeschule Pfotenglück' })
    )
    assert.equal(ok.status, 201)
    assert.equal(ok.data.empfohlen_von, 'Hundeschule Pfotenglück')
    assert.equal(ok.data.bildUrl, null)
  })

  await t.test('Anlegen: Zucht-Text in Titel, Text oder "empfohlen von" -> 400 (breederGuard)', async () => {
    assert.equal((await post('/api/admin/promotions', samplePromotion({ titel: 'Hundezucht Musterhof' }))).status, 400)
    assert.equal((await post('/api/admin/promotions', samplePromotion({ text: 'Welpen abzugeben, bar zahlbar' }))).status, 400)
    const breederEmpfehlung = await post(
      '/api/admin/promotions',
      samplePromotion({ kennzeichnung: 'Empfehlung', empfohlenVon: 'Hundezüchter Nebenan' })
    )
    assert.equal(breederEmpfehlung.status, 400)
  })

  await t.test('Anlegen: URL nur http(s), wird normalisiert', async () => {
    assert.equal((await post('/api/admin/promotions', samplePromotion({ url: 'javascript:alert(1)' }))).status, 400)
    assert.equal((await post('/api/admin/promotions', samplePromotion({ url: 'ftp://example.org' }))).status, 400)
    const ok = await post('/api/admin/promotions', samplePromotion({ url: 'www.example.org' }))
    assert.equal(ok.status, 201)
    assert.equal(ok.data.url, 'https://www.example.org/')
  })

  await t.test('Anlegen: Zeitraum - ungültiges/verkehrtes Datum -> 400, gültiger Zeitraum -> 201', async () => {
    assert.equal((await post('/api/admin/promotions', samplePromotion({ start: 'nicht-iso' }))).status, 400)
    assert.equal((await post('/api/admin/promotions', samplePromotion({ start: '2026-06-01', ende: '2026-05-01' }))).status, 400)
    const ok = await post('/api/admin/promotions', samplePromotion({ start: '2026-05-01', ende: '2026-06-01' }))
    assert.equal(ok.status, 201)
    assert.equal(ok.data.start, '2026-05-01')
    assert.equal(ok.data.ende, '2026-06-01')
  })

  await t.test('Anlegen: Tierart nur hund/katze/anderes, partner_id muss existieren', async () => {
    assert.equal((await post('/api/admin/promotions', samplePromotion({ tierart: 'pferd' }))).status, 400)
    assert.equal((await post('/api/admin/promotions', samplePromotion({ partnerId: 999999 }))).status, 400)

    const partner = await post('/api/admin/partners', { name: 'Hundeschule Pfotenglück', typ: 'hundeschule', plz: '10115' })
    assert.equal(partner.status, 201)

    const ok = await post('/api/admin/promotions', samplePromotion({ tierart: 'hund', partnerId: partner.data.id }))
    assert.equal(ok.status, 201)
    assert.equal(ok.data.tierart, 'hund')
    assert.equal(ok.data.partner_id, partner.data.id)
  })

  let promotionId
  await t.test('CRUD: anlegen, Liste, ändern (inkl. aktiv), löschen', async () => {
    const created = await post('/api/admin/promotions', samplePromotion({ titel: 'Zu ändern' }))
    assert.equal(created.status, 201)
    assert.equal(created.data.aktiv, 1)
    promotionId = created.data.id

    const list = await get('/api/admin/promotions')
    assert.equal(list.status, 200)
    assert.ok(list.data.some((p) => p.id === promotionId))

    const updated = await put(`/api/admin/promotions/${promotionId}`, samplePromotion({ titel: 'Geändert', aktiv: false }))
    assert.equal(updated.status, 200)
    assert.equal(updated.data.titel, 'Geändert')
    assert.equal(updated.data.aktiv, 0)

    const missing = await put('/api/admin/promotions/999999', samplePromotion())
    assert.equal(missing.status, 404)

    const deleted = await del(`/api/admin/promotions/${promotionId}`)
    assert.equal(deleted.status, 204)
    assert.equal((await del(`/api/admin/promotions/${promotionId}`)).status, 404)
  })

  let imagePromotionId
  await t.test('Bild: PNG/JPG hochladen und öffentlich abrufen, altes Bild verschwindet; SVG und gefälschte Bytes -> 400', async () => {
    const created = await post('/api/admin/promotions', samplePromotion({ titel: 'Mit Bild' }))
    imagePromotionId = created.data.id

    const png = await uploadImage(base, adminCookie, imagePromotionId, PNG_BYTES, 'bild.png', 'image/png')
    assert.equal(png.status, 201)
    assert.match(png.data.bildUrl, /^\/partner-media\/[0-9a-f-]{36}\.png$/)

    const publicFetch = await fetch(`${base}${png.data.bildUrl}`)
    assert.equal(publicFetch.status, 200)

    const jpg = await uploadImage(base, adminCookie, imagePromotionId, JPG_BYTES, 'bild.jpg', 'image/jpeg')
    assert.equal(jpg.status, 201)
    // altes Bild wurde ersetzt: die alte Datei ist nicht mehr abrufbar
    assert.equal((await fetch(`${base}${png.data.bildUrl}`)).status, 404)

    assert.equal((await uploadImage(base, adminCookie, imagePromotionId, SVG_BYTES, 'bild.svg', 'image/svg+xml')).status, 400)
    // Bytes lügen: Content-Type sagt PNG, tatsächlich sind es SVG-Bytes -> Magic-Byte-Prüfung schlägt an
    assert.equal((await uploadImage(base, adminCookie, imagePromotionId, SVG_BYTES, 'bild.png', 'image/png')).status, 400)
    assert.equal((await uploadImage(base, adminCookie, 999999, PNG_BYTES, 'bild.png', 'image/png')).status, 404)

    const row = (await get('/api/admin/promotions')).data.find((p) => p.id === imagePromotionId)
    assert.match(row.bildUrl, /^\/partner-media\/[0-9a-f-]{36}\.jpg$/)
  })

  // Phase 3 Task 5: Klickzahlen in der Admin-Liste - clicks7 = die letzten 7 Tage inklusive heute
  // (tag >= date('now', '-6 days'), UTC wie routes/redirect.js), clicksTotal = alle Tage. Nur
  // target_type 'promotion' zählt; eine Empfehlung ohne Klicks bekommt 0/0.
  await t.test('Liste: clicks7 (letzte 7 Tage inkl. heute) und clicksTotal je Empfehlung aus link_clicks', async () => {
    const db = require('../db')
    const clicked = await post('/api/admin/promotions', samplePromotion({ titel: 'Mit Klicks' }))
    const quiet = await post('/api/admin/promotions', samplePromotion({ titel: 'Ohne Klicks' }))
    assert.equal(clicked.status, 201)
    assert.equal(quiet.status, 201)

    const insertClicks = db.prepare(
      "INSERT INTO link_clicks (target_type, target_id, tag, anzahl) VALUES (?, ?, date('now', ?), ?)"
    )
    insertClicks.run('promotion', clicked.data.id, '+0 days', 4)
    insertClicks.run('promotion', clicked.data.id, '-3 days', 2)
    insertClicks.run('promotion', clicked.data.id, '-6 days', 1)
    insertClicks.run('promotion', clicked.data.id, '-7 days', 8)
    insertClicks.run('promotion', clicked.data.id, '-10 days', 5)
    // Andere Zieltypen mit derselben Id zählen nicht mit.
    insertClicks.run('partner-website', clicked.data.id, '+0 days', 100)
    insertClicks.run('partner-spende', quiet.data.id, '+0 days', 100)

    const list = await get('/api/admin/promotions')
    assert.equal(list.status, 200)
    const clickedRow = list.data.find((p) => p.id === clicked.data.id)
    const quietRow = list.data.find((p) => p.id === quiet.data.id)

    assert.equal(clickedRow.clicks7, 4 + 2 + 1)
    assert.equal(clickedRow.clicksTotal, 4 + 2 + 1 + 8 + 5)
    assert.equal(quietRow.clicks7, 0)
    assert.equal(quietRow.clicksTotal, 0)
    assert.ok(list.data.every((p) => Number.isInteger(p.clicks7) && Number.isInteger(p.clicksTotal)))
  })

  await t.test('Löschen durch den Admin entfernt auch die Klicks der Empfehlung, sonst keine', async () => {
    const db = require('../db')
    const doomed = await post('/api/admin/promotions', samplePromotion({ titel: 'Wird gelöscht' }))
    const kept = await post('/api/admin/promotions', samplePromotion({ titel: 'Bleibt' }))
    const insertClicks = db.prepare(
      "INSERT INTO link_clicks (target_type, target_id, tag, anzahl) VALUES (?, ?, date('now', ?), ?)"
    )
    insertClicks.run('promotion', doomed.data.id, '+0 days', 3)
    insertClicks.run('promotion', doomed.data.id, '-9 days', 2)
    insertClicks.run('promotion', kept.data.id, '+0 days', 4)
    // Andere Zieltypen mit derselben Id bleiben unberührt.
    insertClicks.run('partner-website', doomed.data.id, '+0 days', 6)

    assert.equal((await del(`/api/admin/promotions/${doomed.data.id}`)).status, 204)

    const clicksOf = (type, id) => db.prepare('SELECT COUNT(*) AS n FROM link_clicks WHERE target_type = ? AND target_id = ?').get(type, id).n
    assert.equal(clicksOf('promotion', doomed.data.id), 0)
    assert.equal(clicksOf('promotion', kept.data.id), 1)
    assert.equal(clicksOf('partner-website', doomed.data.id), 1)
  })

  await t.test('Einstellungen: nur erlaubte Schlüssel, GoFundMe-URL geprüft, Text begrenzt, Demo-Schlüssel eigenständig', async () => {
    const initial = await get('/api/admin/settings')
    assert.equal(initial.status, 200)
    assert.equal(initial.data.gofundme_url, '')
    assert.equal(initial.data.unterstuetzen_text, '')

    assert.equal((await put('/api/admin/settings', { unbekannt: 'x' })).status, 400)
    assert.equal((await put('/api/admin/settings', { gofundme_url: 'javascript:alert(1)' })).status, 400)
    assert.equal((await put('/api/admin/settings', { unterstuetzen_text: 'x'.repeat(601) })).status, 400)

    const ok = await put('/api/admin/settings', {
      gofundme_url: 'https://example.org/familie-auf-pfoten-spenden',
      unterstuetzen_text: 'Jeder Beitrag hilft den Tierheimen in unserem Netzwerk.'
    })
    assert.equal(ok.status, 200)
    assert.equal(ok.data.gofundme_url, 'https://example.org/familie-auf-pfoten-spenden')
    assert.equal(ok.data.unterstuetzen_text, 'Jeder Beitrag hilft den Tierheimen in unserem Netzwerk.')

    // Demo-Schlüssel (Task 3) sind eigenständig - dürfen die echten Werte nicht überschreiben.
    const demoOk = await put('/api/admin/settings', { demo_gofundme_url: 'https://example.org/demo-spenden' })
    assert.equal(demoOk.status, 200)
    assert.equal(demoOk.data.demo_gofundme_url, 'https://example.org/demo-spenden')
    assert.equal(demoOk.data.gofundme_url, 'https://example.org/familie-auf-pfoten-spenden')

    const cleared = await put('/api/admin/settings', { unterstuetzen_text: '' })
    assert.equal(cleared.status, 200)
    assert.equal(cleared.data.unterstuetzen_text, '')
  })

  let reportId
  await t.test('Spendenberichte: Validierung (Zeitraum, Cent-Beträge, Nachweis-URL) und CRUD', async () => {
    assert.equal((await post('/api/admin/donation-reports', { eingangCents: 100, kostenCents: 0, weitergeleitetCents: 100 })).status, 400)
    assert.equal(
      (await post('/api/admin/donation-reports', { zeitraum: '2026 Q3', eingangCents: -1, kostenCents: 0, weitergeleitetCents: 0 })).status,
      400
    )
    assert.equal(
      (await post('/api/admin/donation-reports', { zeitraum: '2026 Q3', eingangCents: 12.5, kostenCents: 0, weitergeleitetCents: 0 })).status,
      400
    )
    assert.equal(
      (await post('/api/admin/donation-reports', { zeitraum: '2026 Q3', eingangCents: 1e9 + 1, kostenCents: 0, weitergeleitetCents: 0 }))
        .status,
      400
    )
    assert.equal((await post('/api/admin/donation-reports', { zeitraum: 'x'.repeat(41), eingangCents: 0, kostenCents: 0, weitergeleitetCents: 0 })).status, 400)
    assert.equal(
      (
        await post('/api/admin/donation-reports', {
          zeitraum: '2026 Q3',
          eingangCents: 125000,
          kostenCents: 18000,
          weitergeleitetCents: 100000,
          nachweisUrl: 'nicht-http'
        })
      ).status,
      400
    )

    const created = await post('/api/admin/donation-reports', {
      zeitraum: '2026 Q3',
      eingangCents: 125000,
      kostenCents: 18000,
      weitergeleitetCents: 100000,
      empfaenger: 'Tierheim Sonnenhang',
      nachweisUrl: 'https://example.org/nachweis-2026-q3'
    })
    assert.equal(created.status, 201)
    assert.equal(created.data.eingang_cents, 125000)
    assert.equal(created.data.empfaenger, 'Tierheim Sonnenhang')
    assert.equal(created.data.nachweis_url, 'https://example.org/nachweis-2026-q3')
    reportId = created.data.id

    const list = await get('/api/admin/donation-reports')
    assert.equal(list.status, 200)
    assert.ok(list.data.some((r) => r.id === reportId))

    const updated = await put(`/api/admin/donation-reports/${reportId}`, {
      zeitraum: '2026 Q3 (korrigiert)',
      eingangCents: 130000,
      kostenCents: 18000,
      weitergeleitetCents: 105000
    })
    assert.equal(updated.status, 200)
    assert.equal(updated.data.zeitraum, '2026 Q3 (korrigiert)')
    assert.equal(updated.data.eingang_cents, 130000)

    assert.equal(
      (await put('/api/admin/donation-reports/999999', { zeitraum: 'x', eingangCents: 0, kostenCents: 0, weitergeleitetCents: 0 })).status,
      404
    )

    const deleted = await del(`/api/admin/donation-reports/${reportId}`)
    assert.equal(deleted.status, 204)
    assert.equal((await del(`/api/admin/donation-reports/${reportId}`)).status, 404)
  })

  await t.test('kein Zugriff ohne Admin', async () => {
    const family = await createFamily(base, 'Familie Kein Marketing-Zugriff', 'kein-marketing-admin-1')
    assert.equal((await get('/api/admin/promotions', family.cookie)).status, 401)
    assert.equal((await post('/api/admin/promotions', samplePromotion(), family.cookie)).status, 401)
    assert.equal((await put(`/api/admin/promotions/${imagePromotionId}`, samplePromotion(), family.cookie)).status, 401)
    assert.equal((await del(`/api/admin/promotions/${imagePromotionId}`, family.cookie)).status, 401)
    assert.equal((await uploadImage(base, family.cookie, imagePromotionId, PNG_BYTES, 'x.png', 'image/png')).status, 401)
    assert.equal((await get('/api/admin/settings', family.cookie)).status, 401)
    assert.equal((await put('/api/admin/settings', {}, family.cookie)).status, 401)
    assert.equal((await get('/api/admin/donation-reports', family.cookie)).status, 401)
    assert.equal((await post('/api/admin/donation-reports', {}, family.cookie)).status, 401)
    assert.equal((await post('/api/admin/promotions', samplePromotion(), null)).status, 401)
  })
})
