const test = require('node:test')
const { before } = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, getCookie } = require('./helpers')

// Einladungskarten: die Rückseite gestaltet Familie auf Pfoten - Titel, Text, bis zu drei Schritte und die gezeigte
// Adresse als Admin-Einstellung (lib/einladungRueckseite.js, routes/adminEinladungskarte.js; Tabelle settings). Reiner
// Text, geprüft, Änderungen im Admin-Protokoll (nie mit Inhalt). Partner lesen sie mit ihrer Gestaltung, ändern sie nie.
// t.test() bleibt auf einer Ebene.
const ADMIN_TEST_PASSWORD = 'admin-test-einladung-1'
const dataDir = useTempDataDir('einladung-rueckseite', { LOGIN_RATE_LIMIT: '300' })

before(async () => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
})

const VALID = Object.freeze({
  titel: '  Eure Chronik wartet  ',
  text: 'Familie auf Pfoten hält fest, was eure Tiere erleben.',
  schritte: ['1. Code scannen', '2) Code eingeben', '  ', 'Loslegen'],
  adresse: 'https://Beispiel-Chronik.de/v/'
})

function expectError(fn, feld, pattern) {
  assert.throws(fn, (err) => {
    assert.equal(err.status, 400)
    assert.equal(err.feld, feld)
    if (pattern) assert.match(err.message, pattern)
    return true
  })
}

test('lib/einladungRueckseite: Prüfung und Vorgaben', async () => {
  const lib = require('../lib/einladungRueckseite')
  const { VORGABEN, LIMITS, validateRueckseite } = lib

  assert.deepEqual(VORGABEN, {
    titel: 'Eure Tierchronik – geschenkt',
    text: 'Familie auf Pfoten hält fest, was eure Tiere erleben – für euch und eure Familie. Ohne Tracking, ohne Datenhandel.',
    schritte: ['QR-Code scannen oder Adresse öffnen', 'Code eingeben', 'Tiere anlegen und loslegen'],
    adresse: ''
  })
  assert.equal(/werbung/i.test(JSON.stringify(VORGABEN)), false, 'die Plattform hat Anzeigen - kein "ohne Werbung"')
  assert.deepEqual(LIMITS, { titel: 60, text: 240, schritt: 60, schritte: 3, adresse: 60 })

  // Gesäubert: getrimmt, Nummern vor den Schritten weg, leere Schritte weg, Adresse ohne Schema und Schrägstrich am Ende.
  assert.deepEqual(validateRueckseite(VALID), {
    titel: 'Eure Chronik wartet',
    text: 'Familie auf Pfoten hält fest, was eure Tiere erleben.',
    schritte: ['Code scannen', 'Code eingeben', 'Loslegen'],
    adresse: 'beispiel-chronik.de/v'
  })
  assert.deepEqual(validateRueckseite({ ...VALID, schritte: [], adresse: '' }).schritte, [])
  assert.equal(validateRueckseite({ ...VALID, adresse: '' }).adresse, '')
  assert.equal(validateRueckseite({ ...VALID, text: 'Zeile 1\n  Zeile 2' }).text, 'Zeile 1 Zeile 2')

  expectError(() => validateRueckseite({ ...VALID, titel: '   ' }), 'titel', /Titel/)
  expectError(() => validateRueckseite({ ...VALID, titel: 'x'.repeat(61) }), 'titel', /60/)
  assert.equal(validateRueckseite({ ...VALID, titel: 'x'.repeat(60) }).titel.length, 60)
  expectError(() => validateRueckseite({ ...VALID, text: '' }), 'text', /Text/)
  expectError(() => validateRueckseite({ ...VALID, text: 'x'.repeat(241) }), 'text', /240/)
  expectError(() => validateRueckseite({ ...VALID, titel: '<b>Fett</b>' }), 'titel', /reinen Text/)
  expectError(() => validateRueckseite({ ...VALID, schritte: ['a', 'b', 'c', 'd'] }), 'schritte', /drei/)
  expectError(() => validateRueckseite({ ...VALID, schritte: 'Code eingeben' }), 'schritte', /Liste/)
  expectError(() => validateRueckseite({ ...VALID, schritte: ['ok', 'x'.repeat(61)] }), 'schritt2', /60/)
  expectError(() => validateRueckseite({ ...VALID, schritte: ['ok', 7] }), 'schritt2', /Text/)
  for (const adresse of ['javascript:alert(1)', 'localhost/v', 'beispiel chronik.de', 'beispiel-chronik.de/v?code=1', '192.168.0.1/v', `${'a'.repeat(58)}.de`]) {
    expectError(() => validateRueckseite({ ...VALID, adresse }), 'adresse', /Adresse/)
  }
  assert.throws(() => validateRueckseite({ ...VALID, farbe: '#ff0000' }), (err) => err.status === 400 && /Unbekannt/.test(err.message))
  assert.throws(() => validateRueckseite({ titel: 'Nur Titel' }), (err) => err.status === 400 && /fehlt/.test(err.message))
  assert.throws(() => validateRueckseite(null), (err) => err.status === 400)
  // Steuer-, Bidi- und unsichtbare Zeichen fliegen raus.
  assert.equal(validateRueckseite({ ...VALID, titel: 'Eure\u202E Chronik\u200B' }).titel, 'Eure Chronik')
})

test('Admin: Einstellung "Einladungskarte – Rückseite" lesen, ändern, protokollieren; Partner lesen sie mit', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const config = require('../config')
  const { replaceDemoPack } = require('../lib/demoPack')
  const { VORGABEN } = require('../lib/einladungRueckseite')
  replaceDemoPack(db, config.uploadDir)

  const login = await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: ADMIN_TEST_PASSWORD } })
  const adminCookie = getCookie(login.res)
  const get = (cookie) => call(base, '/api/admin/einladungskarte', { cookie })
  const put = (body, cookie) => call(base, '/api/admin/einladungskarte', { method: 'PUT', body, cookie })
  const logRows = () => db.prepare("SELECT aktion, ziel FROM admin_log WHERE aktion = 'einladungskarte-geaendert' ORDER BY id").all()

  await t.test('ohne Admin-Sitzung: 401, nichts zu sehen', async () => {
    assert.equal((await get()).status, 401)
    assert.equal((await put(VALID, null)).status, 401)
  })

  await t.test('GET: ohne Eintrag die Vorgaben, no-store', async () => {
    const res = await get(adminCookie)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('cache-control'), 'no-store')
    assert.deepEqual(res.data, { rueckseite: VORGABEN, vorgaben: VORGABEN })
  })

  await t.test('PUT: gesäubert gespeichert, ein Protokolleintrag ohne Inhalt; dieselben Werte noch einmal -> kein neuer', async () => {
    const res = await put(VALID, adminCookie)
    assert.equal(res.status, 200)
    assert.deepEqual(res.data.rueckseite, {
      titel: 'Eure Chronik wartet',
      text: 'Familie auf Pfoten hält fest, was eure Tiere erleben.',
      schritte: ['Code scannen', 'Code eingeben', 'Loslegen'],
      adresse: 'beispiel-chronik.de/v'
    })
    assert.deepEqual((await get(adminCookie)).data.rueckseite, res.data.rueckseite)
    assert.deepEqual(logRows(), [{ aktion: 'einladungskarte-geaendert', ziel: 'einstellung:einladungskarte' }])
    assert.equal((await put(VALID, adminCookie)).status, 200)
    assert.equal(logRows().length, 1)
  })

  await t.test('PUT ungültig: 400 mit Feld, nichts geändert, kein Protokolleintrag', async () => {
    const res = await put({ ...VALID, adresse: 'javascript:alert(1)' }, adminCookie)
    assert.equal(res.status, 400)
    assert.equal(res.data.feld, 'adresse')
    assert.equal((await get(adminCookie)).data.rueckseite.adresse, 'beispiel-chronik.de/v')
    assert.equal(logRows().length, 1)
  })

  await t.test('kaputter Eintrag in settings: die Vorgaben gelten, statt die Seite scheitern zu lassen', async () => {
    const warn = t.mock.method(console, 'warn', () => {})
    db.prepare("UPDATE settings SET value = '{kaputt' WHERE key = 'einladung_rueckseite'").run()
    assert.deepEqual((await get(adminCookie)).data.rueckseite, VORGABEN)
    assert.equal(warn.mock.callCount(), 1)
    assert.equal((await put(VALID, adminCookie)).status, 200)
  })

  await t.test('Partner lesen die Rückseite mit ihrer Gestaltung - ändern können sie sie nicht', async () => {
    const partner = await call(base, '/api/demo', { method: 'POST', body: { as: 'partner' } })
    const cookie = getCookie(partner.res)
    const state = await call(base, '/api/partner-area/visitenkarte', { cookie })
    assert.equal(state.status, 200)
    assert.equal(state.data.rueckseite.titel, 'Eure Chronik wartet')
    assert.equal((await put(VALID, cookie)).status, 401)
  })
})
