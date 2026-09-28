const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, createFamily, getCookie } = require('./helpers')

const ADMIN_TEST_PASSWORD = 'admin-test-partner-1'
const dataDir = useTempDataDir('partners')

// PNG-Signatur (8 Bytes) + etwas Nutzlast, damit detectImageExt sie erkennt.
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])
const JPG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])
const SVG_BYTES = Buffer.from('<svg onload="alert(1)"></svg>')

function samplePartner(overrides = {}) {
  return {
    name: 'Tierheim Sonnenhang',
    typ: 'tierheim',
    plz: '10115',
    status: 'aktiv',
    ...overrides
  }
}

async function uploadLogo(base, cookie, id, buffer, filename, mimeType) {
  const form = new FormData()
  form.append('file', new Blob([buffer], { type: mimeType }), filename)
  const res = await fetch(`${base}/api/admin/partners/${id}/logo`, { method: 'POST', headers: { Cookie: cookie }, body: form })
  const text = await res.text()
  return { status: res.status, data: text ? JSON.parse(text) : null }
}

test('Partner: Admin-Pflege, öffentliche Liste/Portal, Logo, Partner-Gutscheine', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))

  const login = await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: ADMIN_TEST_PASSWORD } })
  const adminCookie = getCookie(login.res)

  const post = (urlPath, body, cookie = adminCookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const put = (urlPath, body, cookie = adminCookie) => call(base, urlPath, { method: 'PUT', body, cookie })
  const get = (urlPath, cookie) => call(base, urlPath, { cookie })
  const del = (urlPath, cookie = adminCookie) => call(base, urlPath, { method: 'DELETE', cookie })

  await t.test('Anlegen: Name Pflicht, Typ aus der Liste, unbekannte PLZ -> 400', async () => {
    assert.equal((await post('/api/admin/partners', samplePartner({ name: '' }))).status, 400)
    assert.equal((await post('/api/admin/partners', samplePartner({ typ: 'zuechter' }))).status, 400)
    assert.equal((await post('/api/admin/partners', samplePartner({ plz: '00000' }))).status, 400)
    assert.equal((await post('/api/admin/partners', samplePartner({ plz: 'abcde' }))).status, 400)
  })

  await t.test('Anlegen: PLZ wird zu lat/lon/ort aufgelöst, Slug aus dem Namen mit Umlaut-Transliteration', async () => {
    const created = await post('/api/admin/partners', samplePartner({ name: 'Tierschutzverein Deichland für Vögel', typ: 'vermittlung' }))
    assert.equal(created.status, 201)
    assert.equal(created.data.ort, 'Berlin')
    assert.ok(Number.isFinite(created.data.lat))
    assert.ok(Number.isFinite(created.data.lon))
    // ä/ö/ü/ß -> ae/oe/ue/ss, alles andere zu Bindestrichen
    assert.equal(created.data.slug, 'tierschutzverein-deichland-fuer-voegel')
    assert.equal(created.data.status, 'aktiv')
  })

  await t.test('Anlegen: explizit angegebener Slug wird übernommen, wenn gültig', async () => {
    const created = await post('/api/admin/partners', samplePartner({ name: 'Hundeschule Pfotenglück', typ: 'hundeschule', slug: 'pfotenglueck' }))
    assert.equal(created.status, 201)
    assert.equal(created.data.slug, 'pfotenglueck')
  })

  await t.test('Anlegen: doppelter Slug -> 409', async () => {
    const dup = await post('/api/admin/partners', samplePartner({ name: 'Anderer Name', slug: 'pfotenglueck' }))
    assert.equal(dup.status, 409)
  })

  await t.test('Anlegen: URLs nur http(s), E-Mail und Telefon geprüft', async () => {
    assert.equal((await post('/api/admin/partners', samplePartner({ website: 'javascript:alert(1)' }))).status, 400)
    assert.equal((await post('/api/admin/partners', samplePartner({ website: 'ftp://example.org' }))).status, 400)
    assert.equal((await post('/api/admin/partners', samplePartner({ kontaktEmail: 'keine-email' }))).status, 400)
    assert.equal((await post('/api/admin/partners', samplePartner({ kontaktTelefon: 'ruf mich an' }))).status, 400)

    const ok = await post(
      '/api/admin/partners',
      samplePartner({ name: 'Mit Kontakt', website: 'https://example.org', kontaktEmail: 'kontakt@example.org', kontaktTelefon: '+49 30 1234567' })
    )
    assert.equal(ok.status, 201)
    assert.equal(ok.data.website, 'https://example.org')
    assert.equal(ok.data.kontakt_email, 'kontakt@example.org')
  })

  await t.test('Anlegen: portal_text nur reiner Text (kein HTML), höchstens 2000 Zeichen', async () => {
    const withHtml = await post('/api/admin/partners', samplePartner({ name: 'HTML-Text', portalText: 'Hallo <b>Welt</b>' }))
    assert.equal(withHtml.status, 400)

    const tooLong = await post('/api/admin/partners', samplePartner({ name: 'Zu lang', portalText: 'x'.repeat(2001) }))
    assert.equal(tooLong.status, 400)

    const ok = await post('/api/admin/partners', samplePartner({ name: 'Guter Text', portalText: 'Willkommen bei uns!' }))
    assert.equal(ok.status, 201)
    assert.equal(ok.data.portal_text, 'Willkommen bei uns!')
  })

  await t.test('Anlegen: zu helle Farbe -> 400, ausreichender Kontrast wird übernommen', async () => {
    // #fffaf2 (== --on-rust selbst) hat Kontrast 1:1 gegen sich - viel zu hell.
    const tooLight = await post('/api/admin/partners', samplePartner({ name: 'Zu hell', farbe: '#fffaf2' }))
    assert.equal(tooLight.status, 400)
    assert.match(tooLight.data.error, /zu hell/i)

    const okColor = await post('/api/admin/partners', samplePartner({ name: 'Guter Kontrast', farbe: '#2f6b3f' }))
    assert.equal(okColor.status, 201)
    assert.equal(okColor.data.farbe, '#2f6b3f')

    const badFormat = await post('/api/admin/partners', samplePartner({ name: 'Falsches Format', farbe: 'green' }))
    assert.equal(badFormat.status, 400)
  })

  await t.test('Anlegen: Zucht-Texte werden abgelehnt (breederGuard über name/portal_titel/portal_text)', async () => {
    assert.equal((await post('/api/admin/partners', samplePartner({ name: 'Hundezucht Musterhof' }))).status, 400)
    assert.equal((await post('/api/admin/partners', samplePartner({ name: 'Ok', portalTitel: 'Willkommen bei unserem Zwinger' }))).status, 400)
    assert.equal((await post('/api/admin/partners', samplePartner({ name: 'Ok2', portalText: 'Welpen abzugeben, bar zahlbar' }))).status, 400)
    // "Aufzucht" bleibt erlaubt (Follow-up aus Task 1)
    const aufzucht = await post('/api/admin/partners', samplePartner({ name: 'Pflegestelle Aufzucht', portalText: 'Handaufzucht elternloser Welpen' }))
    assert.equal(aufzucht.status, 201)
  })

  let sonnenhangId
  await t.test('Ändern: Slug/Status bleiben erhalten, wenn sie im Update fehlen; Status kann auch wechseln', async () => {
    const created = await post('/api/admin/partners', samplePartner({ name: 'Tierheim Update-Test', status: 'entwurf' }))
    sonnenhangId = created.data.id
    assert.equal(created.data.status, 'entwurf')

    // Update ohne slug/status-Feld: beides bleibt unverändert (kein stillschweigendes Zurücksetzen
    // auf 'entwurf', kein neu erzeugter Slug aus dem unveränderten Namen).
    const { name, typ, plz } = samplePartner({ name: 'Tierheim Update-Test' })
    const untouched = await put(`/api/admin/partners/${created.data.id}`, { name, typ, plz })
    assert.equal(untouched.status, 200)
    assert.equal(untouched.data.slug, created.data.slug)
    assert.equal(untouched.data.status, 'entwurf')

    const updated = await put(`/api/admin/partners/${created.data.id}`, samplePartner({ name: 'Tierheim Update-Test', status: 'aktiv' }))
    assert.equal(updated.status, 200)
    assert.equal(updated.data.slug, created.data.slug)
    assert.equal(updated.data.status, 'aktiv')

    const missing = await put('/api/admin/partners/999999', samplePartner())
    assert.equal(missing.status, 404)
  })

  await t.test('Liste (Admin) zeigt alle Status', async () => {
    const list = await get('/api/admin/partners', adminCookie)
    assert.equal(list.status, 200)
    assert.ok(list.data.some((p) => p.name === 'Tierheim Update-Test'))
  })

  await t.test('Logo: PNG hochladen und öffentlich abrufen, JPG ebenso; SVG -> 400', async () => {
    const png = await uploadLogo(base, adminCookie, sonnenhangId, PNG_BYTES, 'logo.png', 'image/png')
    assert.equal(png.status, 201)
    assert.match(png.data.logoUrl, /^\/partner-media\/[0-9a-f-]{36}\.png$/)

    const publicFetch = await fetch(`${base}${png.data.logoUrl}`)
    assert.equal(publicFetch.status, 200)
    assert.equal(publicFetch.headers.get('x-content-type-options'), 'nosniff')

    const jpg = await uploadLogo(base, adminCookie, sonnenhangId, JPG_BYTES, 'logo.jpg', 'image/jpeg')
    assert.equal(jpg.status, 201)
    // altes Logo wurde ersetzt: die alte Datei ist nicht mehr abrufbar
    const oldGone = await fetch(`${base}${png.data.logoUrl}`)
    assert.equal(oldGone.status, 404)

    const svg = await uploadLogo(base, adminCookie, sonnenhangId, SVG_BYTES, 'logo.svg', 'image/svg+xml')
    assert.equal(svg.status, 400)

    // Bytes lügen: Content-Type sagt PNG, tatsächlich sind es SVG-Bytes -> Magic-Byte-Prüfung schlägt an
    const spoofed = await uploadLogo(base, adminCookie, sonnenhangId, SVG_BYTES, 'logo.png', 'image/png')
    assert.equal(spoofed.status, 400)

    const missingPartner = await uploadLogo(base, adminCookie, 999999, PNG_BYTES, 'logo.png', 'image/png')
    assert.equal(missingPartner.status, 404)
  })

  await t.test('Öffentliche Liste: nur aktive Partner, nach Name sortiert', async () => {
    const list = await get('/api/public/partners')
    assert.equal(list.status, 200)
    assert.ok(list.data.every((p) => p.badge === 'partner' || p.badge === 'geprueft'))
    assert.ok(!list.data.some((p) => p.name === 'Zu hell' || p.name === 'Falsches Format'))
    const names = list.data.map((p) => p.name)
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, 'de')))
    // keine internen Felder
    assert.ok(!('quelle' in list.data[0]))
    assert.ok(!('osm_ref' in list.data[0]))
  })

  await t.test('Öffentliches Portal: aktiver Partner zeigt Portal-Felder, Entwurf/Pausiert ohne Admin -> 404', async () => {
    const okPortal = await get('/api/public/partners/pfotenglueck')
    assert.equal(okPortal.status, 200)
    assert.equal(okPortal.data.name, 'Hundeschule Pfotenglück')
    assert.equal(okPortal.data.preview, undefined)

    const draftId = (await post('/api/admin/partners', samplePartner({ name: 'Entwurf-Partner', slug: 'entwurf-partner', status: 'entwurf' }))).data
      .id
    const hiddenDraft = await get('/api/public/partners/entwurf-partner')
    assert.equal(hiddenDraft.status, 404)

    const previewDraft = await get('/api/public/partners/entwurf-partner', adminCookie)
    assert.equal(previewDraft.status, 200)
    assert.equal(previewDraft.data.preview, true)

    const unknown = await get('/api/public/partners/unbekannter-partner')
    assert.equal(unknown.status, 404)

    // aufräumen, damit spätere "kein Zugriff ohne Admin"-Zählungen nicht durch Test-Reste verwirrt werden
    await del(`/api/admin/partners/${draftId}`)
  })

  await t.test('Umkreissuche: Reihenfolge und Entfernung stimmen, ungültiger Radius -> 400, unbekannte PLZ -> 400', async () => {
    // 20095 Hamburg: ca. 253 km von 10115 Berlin entfernt - taucht bei keinem gültigen Radius (<=100) auf.
    await post('/api/admin/partners', samplePartner({ name: 'Hundeschule Nord', typ: 'hundeschule', plz: '20095', slug: 'hundeschule-nord' }))
    // 14467 Potsdam: ca. 26 km von 10115 Berlin entfernt - liegt zwischen den Radien 10 und 50.
    await post('/api/admin/partners', samplePartner({ name: 'Tierheim Potsdam', plz: '14467', slug: 'tierheim-potsdam' }))

    const badRadius = await get('/api/public/partners?plz=10115&radius=7')
    assert.equal(badRadius.status, 400)

    const badPlz = await get('/api/public/partners?plz=00000&radius=10')
    assert.equal(badPlz.status, 400)

    // Enger Radius: Potsdam (26 km) und Hamburg (253 km) bleiben draußen, die Berlin-Partner (0 km) nicht.
    const tight = await get('/api/public/partners?plz=10115&radius=10')
    assert.equal(tight.status, 200)
    assert.ok(tight.data.length >= 2, 'mehrere Berlin-Partner aus vorherigen Tests sollten da sein')
    assert.ok(tight.data.every((p) => p.distanceKm === 0))
    assert.ok(!tight.data.some((p) => p.slug === 'tierheim-potsdam' || p.slug === 'hundeschule-nord'))

    // Weiter Radius: Potsdam kommt dazu (nach den 0-km-Treffern einsortiert), Hamburg bleibt draußen.
    const wide = await get('/api/public/partners?plz=10115&radius=50')
    assert.equal(wide.status, 200)
    assert.ok(!wide.data.some((p) => p.slug === 'hundeschule-nord'))
    for (let i = 1; i < wide.data.length; i += 1) {
      assert.ok(wide.data[i - 1].distanceKm <= wide.data[i].distanceKm)
    }
    const potsdam = wide.data.find((p) => p.slug === 'tierheim-potsdam')
    assert.ok(potsdam)
    assert.ok(potsdam.distanceKm > 20 && potsdam.distanceKm < 30)
    assert.equal(potsdam, wide.data[wide.data.length - 1], 'Potsdam ist am weitesten entfernt, muss zuletzt kommen')

    // In Hamburg gesucht: nur Hundeschule Nord (0 km), Berlin/Potsdam liegen zu weit weg.
    const nearHamburg = await get('/api/public/partners?plz=20095&radius=100')
    assert.equal(nearHamburg.status, 200)
    assert.equal(nearHamburg.data.length, 1)
    assert.equal(nearHamburg.data[0].slug, 'hundeschule-nord')
    assert.equal(nearHamburg.data[0].distanceKm, 0)
  })

  await t.test('Löschen: nur im Entwurf möglich, sonst 409', async () => {
    const draft = await post('/api/admin/partners', samplePartner({ name: 'Zu löschen', slug: 'zu-loeschen', status: 'entwurf' }))
    const deleted = await del(`/api/admin/partners/${draft.data.id}`)
    assert.equal(deleted.status, 204)
    assert.equal((await get(`/api/public/partners/zu-loeschen`)).status, 404)

    const active = await post('/api/admin/partners', samplePartner({ name: 'Aktiv, nicht löschbar', slug: 'aktiv-nicht-loeschbar' }))
    const blocked = await del(`/api/admin/partners/${active.data.id}`)
    assert.equal(blocked.status, 409)

    const missing = await del('/api/admin/partners/999999')
    assert.equal(missing.status, 404)
  })

  let partnerForVouchers
  await t.test('Partner-Gutscheinstapel: partnerId -> kind partner, Liste zeigt Partnernamen', async () => {
    partnerForVouchers = await post('/api/admin/partners', samplePartner({ name: 'Tierheim Gutschein-Partner', slug: 'tierheim-gutschein-partner' }))

    const badPartner = await post('/api/admin/voucher-batches', { label: 'Ungültiger Partner', size: 1, partnerId: 999999 })
    assert.equal(badPartner.status, 400)

    const created = await post('/api/admin/voucher-batches', { label: 'Partner-Gutscheine', size: 3, partnerId: partnerForVouchers.data.id })
    assert.equal(created.status, 201)
    assert.equal(created.data.codes.length, 3)

    const list = await get('/api/admin/voucher-batches', adminCookie)
    const batch = list.data.find((b) => b.label === 'Partner-Gutscheine')
    assert.equal(batch.kind, 'partner')
    assert.equal(batch.partner_name, 'Tierheim Gutschein-Partner')

    // Admin-Stapel ohne partnerId bleiben unverändert kind='admin', ohne Partnernamen
    const adminBatch = await post('/api/admin/voucher-batches', { label: 'Normaler Admin-Stapel', size: 1 })
    assert.equal(adminBatch.status, 201)
    const adminBatchListed = (await get('/api/admin/voucher-batches', adminCookie)).data.find((b) => b.label === 'Normaler Admin-Stapel')
    assert.equal(adminBatchListed.kind, 'admin')
    assert.equal(adminBatchListed.partner_name, null)

    // Einlösen eines Partner-Gutscheins setzt families.partner_id
    const redeemed = await post('/api/vouchers/redeem', { code: created.data.codes[0], name: 'Zuhause über Partner' }, undefined)
    assert.equal(redeemed.status, 201)
    const db = require('../db')
    const family = db.prepare('SELECT partner_id FROM families WHERE id = ?').get(redeemed.data.id)
    assert.equal(family.partner_id, partnerForVouchers.data.id)
  })

  await t.test('kein Zugriff ohne Admin', async () => {
    const family = await createFamily(base, 'Familie Kein Partner-Zugriff', 'kein-partner-admin-1')
    assert.equal((await get('/api/admin/partners', family.cookie)).status, 401)
    assert.equal((await post('/api/admin/partners', samplePartner(), family.cookie)).status, 401)
    assert.equal((await put(`/api/admin/partners/${sonnenhangId}`, samplePartner(), family.cookie)).status, 401)
    assert.equal((await del(`/api/admin/partners/${sonnenhangId}`, family.cookie)).status, 401)
    assert.equal((await uploadLogo(base, family.cookie, sonnenhangId, PNG_BYTES, 'x.png', 'image/png')).status, 401)
    assert.equal((await post('/api/admin/partners', samplePartner(), null)).status, 401)
  })

  // Das Verstecken in Produktion selbst braucht einen eigenen Prozess mit APP_ENV=production von
  // Anfang an (appEnv wird beim ersten require('../config') fest eingelesen) - siehe
  // test/partnersDemoProd.test.js. Hier nur der Normalfall: in der Testumgebung (appEnv 'dev',
  // kein APP_ENV=production) ist ein Demo-Partner ganz ohne ?demo=1 schon sichtbar.
  await t.test('Demo-Partner: appEnv dev zeigt sie auch ohne ?demo=1, echte Partner immer', async () => {
    const config = require('../config')
    assert.notEqual(config.appEnv, 'production')
    const db = require('../db')
    db.prepare(
      `INSERT INTO partners (slug, name, typ, status, plz, ort, lat, lon, is_demo)
       VALUES ('demo-tierheim', 'Demo-Tierheim', 'tierheim', 'aktiv', '10115', 'Berlin', 52.532, 13.385, 1)`
    ).run()

    const list = await get('/api/public/partners')
    assert.ok(list.data.some((p) => p.slug === 'demo-tierheim'))
    assert.ok(list.data.some((p) => p.name === 'Tierheim Gutschein-Partner'))

    const portal = await get('/api/public/partners/demo-tierheim')
    assert.equal(portal.status, 200)
  })
})
