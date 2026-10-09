const test = require('node:test')
const { before } = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, getCookie } = require('./helpers')

// „Kosten & Reserve“: laufende Kosten als Posten (lib/finanzierungKosten.js, Tabelle finanzierung_kosten), Entnahmen aus
// der Rücklage je Quartal (finanzierung_quartale.reserve_entnahme_cents) und die Spendenrechnung mit der Rücklage
// „Server-Zukunft“ (lib/finanzierungVerteilung.js) in GET /api/finanzierung und GET /api/admin/finanzierung. Admin-CRUD
// unter /api/admin/finanzierung/kosten (routes/adminFinanzierung.js), protokolliert.
const ADMIN_TEST_PASSWORD = 'admin-test-kosten-1'
const dataDir = useTempDataDir('finanzierung-kosten', { LOGIN_RATE_LIMIT: '300' })

before(async () => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
})

const SERVER = Object.freeze({ titel: '  Server  ', betragCents: 2300, intervall: 'monat', ab: '2026-01-01', bis: null, notiz: ' Hetzner ' })

function expectError(fn, feld, pattern) {
  assert.throws(fn, (err) => {
    assert.equal(err.status, 400)
    if (feld) assert.equal(err.feld, feld)
    if (pattern) assert.match(err.message, pattern)
    return true
  })
}

test('lib/finanzierungKosten: Prüfung eines Postens', () => {
  const { validateKosten, KOSTEN_LIMITS } = require('../lib/finanzierungKosten')
  assert.deepEqual(KOSTEN_LIMITS, { titel: 80, notiz: 200 })

  assert.deepEqual(validateKosten(SERVER), { titel: 'Server', betrag_cents: 2300, intervall: 'monat', ab: '2026-01-01', bis: null, notiz: 'Hetzner' })
  assert.deepEqual(validateKosten({ titel: 'Domain', betragCents: 1200, intervall: 'jahr', ab: '2026-03-15', bis: '2027-03-14' }), {
    titel: 'Domain',
    betrag_cents: 1200,
    intervall: 'jahr',
    ab: '2026-03-15',
    bis: '2027-03-14',
    notiz: null
  })

  expectError(() => validateKosten({ ...SERVER, titel: '' }), 'titel', /Titel/)
  expectError(() => validateKosten({ ...SERVER, titel: 'x'.repeat(81) }), 'titel', /80/)
  expectError(() => validateKosten({ ...SERVER, titel: '<b>Server</b>' }), 'titel', /reinen Text/)
  expectError(() => validateKosten({ ...SERVER, betragCents: 0 }), 'betragCents', /Betrag/)
  expectError(() => validateKosten({ ...SERVER, betragCents: 12.5 }), 'betragCents', /Betrag/)
  expectError(() => validateKosten({ ...SERVER, betragCents: undefined }), 'betragCents', /Betrag/)
  expectError(() => validateKosten({ ...SERVER, intervall: 'woche' }), 'intervall', /Monat oder Jahr/)
  expectError(() => validateKosten({ ...SERVER, ab: '2026-13-01' }), 'ab', /Datum/)
  expectError(() => validateKosten({ ...SERVER, ab: undefined }), 'ab', /Datum/)
  expectError(() => validateKosten({ ...SERVER, bis: '2025-12-31' }), 'bis', /nach dem Beginn/)
  expectError(() => validateKosten({ ...SERVER, bis: 'bald' }), 'bis', /Datum/)
  expectError(() => validateKosten({ ...SERVER, notiz: 'x'.repeat(201) }), 'notiz', /200/)
  expectError(() => validateKosten({ ...SERVER, fremd: 1 }), undefined, /Unbekannt/)
  expectError(() => validateKosten(null), undefined, /Objekt/)
})

test('lib/finanzierung: Quartal mit optionaler Entnahme aus der Rücklage', () => {
  const { validateQuartal, verteileUeberschuss } = require('../lib/finanzierung')
  const quartal = { jahr: 2026, quartal: 1, einnahmenSpendenCents: 0, einnahmenPartnerCents: 0, kostenCents: 0, spendenWeitergegebenCents: 0 }
  assert.equal(validateQuartal(quartal).reserve_entnahme_cents, 0)
  assert.equal(validateQuartal({ ...quartal, reserveEntnahmeCents: 2500 }).reserve_entnahme_cents, 2500)
  expectError(() => validateQuartal({ ...quartal, reserveEntnahmeCents: -1 }), 'reserveEntnahmeCents', /Betrag/)
  // Die Verteilungsfunktion ist auch über lib/finanzierung.js erreichbar.
  assert.equal(verteileUeberschuss({ spendenCents: 100000, kostenCents: 10000, kostenProJahrCents: 40000 }).reserveCents, 18000)
})

test('Kosten & Reserve: Admin-CRUD, Protokoll und die Rechnung in beiden Antworten', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')

  const get = (urlPath, cookie) => call(base, urlPath, { cookie })
  const put = (urlPath, body, cookie) => call(base, urlPath, { method: 'PUT', body, cookie })
  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const del = (urlPath, cookie) => call(base, urlPath, { method: 'DELETE', cookie })
  const adminLog = () => db.prepare('SELECT aktion, ziel FROM admin_log ORDER BY id').all()

  const adminLogin = await post('/api/admin/login', { username: 'admin', password: ADMIN_TEST_PASSWORD })
  assert.equal(adminLogin.status, 200)
  const adminCookie = getCookie(adminLogin.res)

  await t.test('ohne Daten: Kosten leer, Saldo 0, Rücklage ohne Jahreskosten', async () => {
    const res = await get('/api/finanzierung')
    assert.equal(res.status, 200)
    assert.deepEqual(res.data.kosten, { proJahrCents: 0, posten: [] })
    assert.equal(res.data.saldoCents, 0)
    assert.deepEqual(res.data.ruecklage, { centsAktuell: 0, jahreGedeckt: null, anteilProzent: 0 })
    assert.deepEqual(res.data.verteilung, [])
    const admin = await get('/api/admin/finanzierung', adminCookie)
    assert.deepEqual(admin.data.kosten, { proJahrCents: 0, posten: [] })
    assert.deepEqual(admin.data.prognose, { kostenBisherCents: 0, spendenBisherCents: 0, saldoCents: 0, restKostenJahrCents: 0, prognoseJahresendeCents: 0 })
  })

  await t.test('Kosten-Routen: ohne Anmeldung 401 und no-store', async () => {
    const res = await post('/api/admin/finanzierung/kosten', SERVER)
    assert.equal(res.status, 401)
    assert.equal(res.headers.get('cache-control'), 'no-store')
    assert.equal((await put('/api/admin/finanzierung/kosten/1', SERVER)).status, 401)
    assert.equal((await del('/api/admin/finanzierung/kosten/1')).status, 401)
  })

  let serverId
  await t.test('Posten anlegen: 201 mit Id, Fehler am Feld, Protokoll ohne Beträge', async () => {
    const bad = await post('/api/admin/finanzierung/kosten', { ...SERVER, betragCents: 0 }, adminCookie)
    assert.equal(bad.status, 400)
    assert.deepEqual(Object.keys(bad.data).sort(), ['error', 'feld'])
    assert.equal(bad.data.feld, 'betragCents')

    const res = await post('/api/admin/finanzierung/kosten', SERVER, adminCookie)
    assert.equal(res.status, 201)
    assert.equal(res.headers.get('cache-control'), 'no-store')
    serverId = res.data.id
    assert.ok(Number.isInteger(serverId))
    assert.deepEqual(res.data, { id: serverId, titel: 'Server', betragCents: 2300, intervall: 'monat', ab: '2026-01-01', bis: null, notiz: 'Hetzner', updatedAt: res.data.updatedAt })
    assert.deepEqual(adminLog(), [{ aktion: 'finanzierung-kosten-angelegt', ziel: `kosten:${serverId}` }])
  })

  await t.test('Posten ändern: PUT, 404 für fremde Id, Protokoll', async () => {
    const res = await put(`/api/admin/finanzierung/kosten/${serverId}`, { ...SERVER, betragCents: 2500, notiz: '' }, adminCookie)
    assert.equal(res.status, 200)
    assert.equal(res.data.betragCents, 2500)
    assert.equal(res.data.notiz, null)
    assert.equal((await put('/api/admin/finanzierung/kosten/999', SERVER, adminCookie)).status, 404)
    assert.equal((await put('/api/admin/finanzierung/kosten/abc', SERVER, adminCookie)).status, 404)
    assert.deepEqual(adminLog().at(-1), { aktion: 'finanzierung-kosten-geaendert', ziel: `kosten:${serverId}` })
  })

  await t.test('die Rechnung: Jahreskosten, Saldo, Rücklage und Verteilung je Quartal - öffentlich ohne Ids und Notizen', async () => {
    const q1 = await post(
      '/api/admin/finanzierung/quartale',
      { jahr: 2026, quartal: 1, einnahmenSpendenCents: 100000, einnahmenPartnerCents: 0, kostenCents: 2500, spendenWeitergegebenCents: 0, reserveEntnahmeCents: 0, notiz: 'Start' },
      adminCookie
    )
    assert.equal(q1.status, 201)
    assert.equal(q1.data.reserveEntnahmeCents, 0)

    const pub = await get('/api/finanzierung')
    assert.equal(pub.status, 200)
    assert.equal(pub.headers.get('cache-control'), 'public, max-age=300')
    // Posten öffentlich: Titel, Betrag, Intervall - keine Id, keine Notiz, keine Daten.
    assert.deepEqual(pub.data.kosten.posten, [{ titel: 'Server', betragCents: 2500, intervall: 'monat' }])
    // 25 €/Monat × 12 + einmalig 25 € im einzigen Quartal × 4 = 400 €
    assert.equal(pub.data.kosten.proJahrCents, 30000 + 10000)
    assert.equal(typeof pub.data.saldoCents, 'number')
    assert.equal(pub.data.verteilung.length, 1)
    const zeile = pub.data.verteilung[0]
    assert.equal(zeile.jahr, 2026)
    assert.equal(zeile.quartal, 1)
    assert.equal(zeile.kostenCents, 2500 + 3 * 2500)
    assert.equal(zeile.anteilProzent, 20)
    assert.equal(zeile.reserveCents, Math.round((100000 - 10000) * 0.2))
    assert.equal(zeile.reserveCents + zeile.gespendetCents, zeile.ueberschussCents)
    assert.deepEqual(Object.keys(pub.data.ruecklage).sort(), ['anteilProzent', 'centsAktuell', 'jahreGedeckt'])
    assert.equal(pub.data.ruecklage.centsAktuell, zeile.reserveCents)
    assert.equal(pub.data.quartale[0].reserveEntnahmeCents, 0)

    const admin = await get('/api/admin/finanzierung', adminCookie)
    assert.deepEqual(admin.data.kosten.posten.map((p) => p.id), [serverId])
    assert.equal(admin.data.kosten.proJahrCents, pub.data.kosten.proJahrCents)
    assert.equal(admin.data.prognose.spendenBisherCents, 100000)
    assert.equal(admin.data.prognose.saldoCents, 100000 - admin.data.prognose.kostenBisherCents)
    assert.deepEqual(admin.data.ruecklage, pub.data.ruecklage)
    assert.deepEqual(admin.data.verteilung, pub.data.verteilung)
  })

  await t.test('Posten löschen: 204, danach 404, Protokoll; die Rechnung ohne Posten', async () => {
    assert.equal((await del(`/api/admin/finanzierung/kosten/${serverId}`, adminCookie)).status, 204)
    assert.equal((await del(`/api/admin/finanzierung/kosten/${serverId}`, adminCookie)).status, 404)
    assert.deepEqual(adminLog().at(-1), { aktion: 'finanzierung-kosten-geloescht', ziel: `kosten:${serverId}` })
    const pub = await get('/api/finanzierung')
    assert.deepEqual(pub.data.kosten, { proJahrCents: 10000, posten: [] })
  })
})
