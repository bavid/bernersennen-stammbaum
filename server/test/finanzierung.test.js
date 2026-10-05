const test = require('node:test')
const { before } = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, getCookie } = require('./helpers')

// Phase F: „So finanzieren wir uns“ - der Admin pflegt Spenden-Hinweis, aktuelles Ziel und Zahlen je Quartal
// (lib/finanzierung.js, routes/adminFinanzierung.js); die öffentliche Seite liest GET /api/finanzierung ohne Login
// (routes/finanzierung.js, cachebar). t.test() bleibt auf einer Ebene.
const ADMIN_TEST_PASSWORD = 'admin-test-finanzierung-1'
const dataDir = useTempDataDir('finanzierung', { LOGIN_RATE_LIMIT: '300' })

before(async () => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
})

const QUARTAL = Object.freeze({
  jahr: 2026,
  quartal: 1,
  einnahmenSpendenCents: 12050,
  einnahmenPartnerCents: 0,
  kostenCents: 8900,
  spendenWeitergegebenCents: 3000,
  notiz: '  Erstes Quartal, Server und Domain  '
})

function expectError(fn, feld, pattern) {
  assert.throws(fn, (err) => {
    assert.equal(err.status, 400)
    if (feld) assert.equal(err.feld, feld)
    if (pattern) assert.match(err.message, pattern)
    return true
  })
}

test('lib/finanzierung: Prüfung von Spenden-Hinweis, Ziel und Quartal', async () => {
  const { validateSpendenHinweis, validateZiel, validateQuartal, LIMITS } = require('../lib/finanzierung')

  assert.deepEqual(LIMITS, { hinweisText: 400, zielTitel: 80, empfaenger: 120, notiz: 200, jahrMin: 2024, jahrMax: 2100 })

  // Spenden-Hinweis: reiner Text, Link nur http(s); leer = kein Hinweis.
  assert.deepEqual(validateSpendenHinweis({ text: '  Spendenkonto: Familie auf Pfoten \n Verwendungszweck: Server ', url: '' }), {
    text: 'Spendenkonto: Familie auf Pfoten\nVerwendungszweck: Server',
    url: null
  })
  assert.deepEqual(validateSpendenHinweis({ text: '', url: 'www.example.org/spenden' }), { text: '', url: 'https://www.example.org/spenden' })
  assert.deepEqual(validateSpendenHinweis({ text: '', url: '' }), { text: '', url: null })
  expectError(() => validateSpendenHinweis({ text: 'x'.repeat(401), url: '' }), 'text', /400/)
  expectError(() => validateSpendenHinweis({ text: '<b>Spenden</b>', url: '' }), 'text', /reinen Text/)
  expectError(() => validateSpendenHinweis({ text: '', url: 'javascript:alert(1)' }), 'url', /Adresse/)
  expectError(() => validateSpendenHinweis({ text: '', url: 'ftp://example.org' }), 'url', /Adresse/)
  expectError(() => validateSpendenHinweis({ text: 7, url: '' }), 'text', /Text/)
  expectError(() => validateSpendenHinweis({ text: '', url: '', extra: 1 }), undefined, /Unbekannt/)

  // Ziel: Titel Pflicht, sobald etwas gesetzt ist; Betrag ganze Cent >= 0; Empfänger optional.
  assert.deepEqual(validateZiel({ titel: ' Hundewiese am Deich ', betragCents: 50000, empfaenger: ' Stadt ' }), {
    titel: 'Hundewiese am Deich',
    betragCents: 50000,
    empfaenger: 'Stadt'
  })
  assert.deepEqual(validateZiel({ titel: 'Nur Titel', betragCents: null, empfaenger: '' }), { titel: 'Nur Titel', betragCents: null, empfaenger: null })
  assert.equal(validateZiel({ titel: '', betragCents: null, empfaenger: '' }), null)
  expectError(() => validateZiel({ titel: '', betragCents: 100, empfaenger: '' }), 'titel', /Titel/)
  expectError(() => validateZiel({ titel: 'x'.repeat(81), betragCents: null, empfaenger: '' }), 'titel', /80/)
  expectError(() => validateZiel({ titel: 'Ziel', betragCents: -1, empfaenger: '' }), 'betragCents', /Betrag/)
  expectError(() => validateZiel({ titel: 'Ziel', betragCents: 12.5, empfaenger: '' }), 'betragCents', /Betrag/)
  expectError(() => validateZiel({ titel: 'Ziel', betragCents: null, empfaenger: 'x'.repeat(121) }), 'empfaenger', /120/)

  // Quartal: Jahr 2024-2100, Quartal 1-4, Beträge ganze Cent >= 0, Notiz optional (<= 200).
  assert.deepEqual(validateQuartal(QUARTAL), {
    jahr: 2026,
    quartal: 1,
    einnahmen_spenden_cents: 12050,
    einnahmen_partner_cents: 0,
    kosten_cents: 8900,
    spenden_weitergegeben_cents: 3000,
    notiz: 'Erstes Quartal, Server und Domain'
  })
  assert.equal(validateQuartal({ ...QUARTAL, notiz: '' }).notiz, null)
  assert.equal(validateQuartal({ ...QUARTAL, notiz: undefined }).notiz, null)
  expectError(() => validateQuartal({ ...QUARTAL, jahr: 2023 }), 'jahr', /2024/)
  expectError(() => validateQuartal({ ...QUARTAL, jahr: '2026' }), 'jahr', /Jahr/)
  expectError(() => validateQuartal({ ...QUARTAL, quartal: 5 }), 'quartal', /1 bis 4/)
  expectError(() => validateQuartal({ ...QUARTAL, quartal: 0 }), 'quartal', /1 bis 4/)
  expectError(() => validateQuartal({ ...QUARTAL, kostenCents: -5 }), 'kostenCents', /Betrag/)
  expectError(() => validateQuartal({ ...QUARTAL, einnahmenSpendenCents: 1.5 }), 'einnahmenSpendenCents', /Betrag/)
  expectError(() => validateQuartal({ ...QUARTAL, einnahmenPartnerCents: '100' }), 'einnahmenPartnerCents', /Betrag/)
  expectError(() => validateQuartal({ ...QUARTAL, spendenWeitergegebenCents: 1e10 }), 'spendenWeitergegebenCents', /Betrag/)
  expectError(() => validateQuartal({ ...QUARTAL, notiz: 'x'.repeat(201) }), 'notiz', /200/)
  expectError(() => validateQuartal({ ...QUARTAL, fremd: 1 }), undefined, /Unbekannt/)
  expectError(() => validateQuartal({ jahr: 2026 }), 'quartal', /fehlt/i)
})

test('Finanzierung: öffentliche Antwort, Admin-Pflege, Protokoll', async (t) => {
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

  await t.test('ohne Daten: die öffentliche Antwort ist leer, aber cachebar und ohne Login erreichbar', async () => {
    const res = await get('/api/finanzierung')
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('cache-control'), 'public, max-age=300')
    assert.deepEqual(res.data, { spendenHinweis: null, ziel: null, quartale: [] })
  })

  await t.test('Admin-Routen: ohne Anmeldung 401, jede Antwort no-store', async () => {
    const res = await get('/api/admin/finanzierung')
    assert.equal(res.status, 401)
    assert.equal(res.headers.get('cache-control'), 'no-store')
    const ok = await get('/api/admin/finanzierung', adminCookie)
    assert.equal(ok.status, 200)
    assert.equal(ok.headers.get('cache-control'), 'no-store')
    assert.deepEqual(ok.data, {
      spendenHinweis: { text: '', url: null },
      ziel: { titel: '', betragCents: null, empfaenger: null },
      quartale: []
    })
  })

  await t.test('Spenden-Hinweis speichern: öffentlich sichtbar, einmal im Protokoll, Fehler am Feld', async () => {
    const saved = await put('/api/admin/finanzierung/spenden-hinweis', { text: 'Spendenkonto folgt.', url: 'https://example.org/spenden' }, adminCookie)
    assert.equal(saved.status, 200)
    assert.deepEqual(saved.data.spendenHinweis, { text: 'Spendenkonto folgt.', url: 'https://example.org/spenden' })
    assert.deepEqual(adminLog(), [{ aktion: 'finanzierung-geaendert', ziel: 'einstellung:finanzierung-spenden-hinweis' }])

    // Unverändert speichern: kein zweiter Eintrag.
    await put('/api/admin/finanzierung/spenden-hinweis', { text: 'Spendenkonto folgt.', url: 'https://example.org/spenden' }, adminCookie)
    assert.equal(adminLog().length, 1)

    const bad = await put('/api/admin/finanzierung/spenden-hinweis', { text: '', url: 'mailto:x@example.org' }, adminCookie)
    assert.equal(bad.status, 400)
    assert.equal(bad.data.feld, 'url')

    const pub = await get('/api/finanzierung')
    assert.deepEqual(pub.data.spendenHinweis, { text: 'Spendenkonto folgt.', url: 'https://example.org/spenden' })
  })

  await t.test('Ziel speichern und leeren', async () => {
    const saved = await put('/api/admin/finanzierung/ziel', { titel: 'Hundewiese', betragCents: 50000, empfaenger: 'Stadt' }, adminCookie)
    assert.equal(saved.status, 200)
    assert.deepEqual(saved.data.ziel, { titel: 'Hundewiese', betragCents: 50000, empfaenger: 'Stadt' })
    assert.deepEqual((await get('/api/finanzierung')).data.ziel, { titel: 'Hundewiese', betragCents: 50000, empfaenger: 'Stadt' })
    assert.deepEqual(adminLog().at(-1), { aktion: 'finanzierung-geaendert', ziel: 'einstellung:finanzierung-ziel' })

    const cleared = await put('/api/admin/finanzierung/ziel', { titel: '', betragCents: null, empfaenger: '' }, adminCookie)
    assert.equal(cleared.status, 200)
    assert.deepEqual(cleared.data.ziel, { titel: '', betragCents: null, empfaenger: null })
    assert.equal((await get('/api/finanzierung')).data.ziel, null)
  })

  let firstId
  await t.test('Quartale: anlegen, doppeltes Jahr+Quartal 409, ändern, löschen - neueste zuerst', async () => {
    const created = await post('/api/admin/finanzierung/quartale', QUARTAL, adminCookie)
    assert.equal(created.status, 201)
    firstId = created.data.id
    assert.equal(created.data.notiz, 'Erstes Quartal, Server und Domain')
    assert.deepEqual(adminLog().at(-1), { aktion: 'finanzierung-quartal-angelegt', ziel: `quartal:${firstId}` })

    const duplicate = await post('/api/admin/finanzierung/quartale', QUARTAL, adminCookie)
    assert.equal(duplicate.status, 409)
    assert.match(duplicate.data.error, /gibt es schon/)

    const second = await post('/api/admin/finanzierung/quartale', { ...QUARTAL, quartal: 2, notiz: '' }, adminCookie)
    assert.equal(second.status, 201)

    const invalid = await post('/api/admin/finanzierung/quartale', { ...QUARTAL, quartal: 3, kostenCents: -1 }, adminCookie)
    assert.equal(invalid.status, 400)
    assert.equal(invalid.data.feld, 'kostenCents')

    const updated = await put(`/api/admin/finanzierung/quartale/${firstId}`, { ...QUARTAL, kostenCents: 9000 }, adminCookie)
    assert.equal(updated.status, 200)
    assert.equal(updated.data.kostenCents, 9000)
    assert.deepEqual(adminLog().at(-1), { aktion: 'finanzierung-quartal-geaendert', ziel: `quartal:${firstId}` })

    // Ändern auf ein schon belegtes Quartal -> 409, nichts verloren.
    const clash = await put(`/api/admin/finanzierung/quartale/${firstId}`, { ...QUARTAL, quartal: 2 }, adminCookie)
    assert.equal(clash.status, 409)

    const missing = await put('/api/admin/finanzierung/quartale/999', QUARTAL, adminCookie)
    assert.equal(missing.status, 404)

    const admin = await get('/api/admin/finanzierung', adminCookie)
    assert.deepEqual(
      admin.data.quartale.map((q) => [q.jahr, q.quartal]),
      [
        [2026, 2],
        [2026, 1]
      ]
    )

    const pub = await get('/api/finanzierung')
    assert.deepEqual(pub.data.quartale, [
      { jahr: 2026, quartal: 2, einnahmenSpendenCents: 12050, einnahmenPartnerCents: 0, kostenCents: 8900, spendenWeitergegebenCents: 3000, notiz: null },
      { jahr: 2026, quartal: 1, einnahmenSpendenCents: 12050, einnahmenPartnerCents: 0, kostenCents: 9000, spendenWeitergegebenCents: 3000, notiz: 'Erstes Quartal, Server und Domain' }
    ])
    // Öffentlich ohne Ids und Zeitstempel.
    assert.equal('id' in pub.data.quartale[0], false)

    const removed = await del(`/api/admin/finanzierung/quartale/${second.data.id}`, adminCookie)
    assert.equal(removed.status, 204)
    assert.deepEqual(adminLog().at(-1), { aktion: 'finanzierung-quartal-geloescht', ziel: `quartal:${second.data.id}` })
    assert.equal((await del(`/api/admin/finanzierung/quartale/${second.data.id}`, adminCookie)).status, 404)
    assert.equal((await get('/api/finanzierung')).data.quartale.length, 1)
  })

  await t.test('Schreibzugriffe nur für den Admin', async () => {
    assert.equal((await put('/api/admin/finanzierung/ziel', { titel: 'x', betragCents: null, empfaenger: '' })).status, 401)
    assert.equal((await post('/api/admin/finanzierung/quartale', QUARTAL)).status, 401)
    assert.equal((await del(`/api/admin/finanzierung/quartale/${firstId}`)).status, 401)
    assert.equal((await get('/api/finanzierung')).data.quartale.length, 1)
  })
})
