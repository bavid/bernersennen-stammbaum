const test = require('node:test')
const { before } = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, getCookie } = require('./helpers')

// Phase N Task 5: globale Hinweise (lib/hinweise.js, routes/hinweise.js öffentlich, routes/adminHinweise.js Admin).
// Zeiten als ISO in UTC; "jetzt" ist in den Lib-Tests fest, in den HTTP-Tests die echte Uhr (Fenster großzügig).
const ADMIN_TEST_PASSWORD = 'admin-test-hinweise-1'
const dataDir = useTempDataDir('hinweise')

const NOW = new Date('2026-10-03T10:00:00.000Z')
const HOUR_MS = 60 * 60 * 1000
const iso = (offsetHours, base = Date.now()) => new Date(base + offsetHours * HOUR_MS).toISOString()

// Der Admin-Zugang (config.adminPasswordHash) wird beim ersten require von config gelesen - also vor allen Tests.
before(async () => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
})

function expectStatus(fn, status, pattern) {
  assert.throws(fn, (err) => {
    assert.equal(err.status, status)
    if (pattern) assert.match(err.message, pattern)
    return true
  })
}

test('lib/hinweise: Prüfung, Status, öffentliche Auswahl und Beispiel-Hinweis', async (t) => {
  const db = require('../db')
  const lib = require('../lib/hinweise')

  await t.test('Anlegen: Standardwerte (info, aktiv, Beginn jetzt, offenes Ende), Text getrimmt', () => {
    const clean = lib.validateHinweis({ titel: '  Neu: Kalender  ', text: ' Zeile 1\r\nZeile 2 ' }, { now: NOW })
    assert.deepEqual(clean, {
      titel: 'Neu: Kalender',
      text: 'Zeile 1\nZeile 2',
      titel_en: null,
      text_en: null,
      stufe: 'info',
      start: NOW.toISOString(),
      ende: null,
      aktiv: 1
    })
  })

  await t.test('Titel Pflicht, höchstens 80 Zeichen, eine Zeile; Text höchstens 1000 Zeichen', () => {
    expectStatus(() => lib.validateHinweis({}, { now: NOW }), 400, /Titel/)
    expectStatus(() => lib.validateHinweis({ titel: '   ' }, { now: NOW }), 400, /Titel/)
    expectStatus(() => lib.validateHinweis({ titel: 'x'.repeat(81) }, { now: NOW }), 400, /80/)
    assert.equal(lib.validateHinweis({ titel: 'x'.repeat(80) }, { now: NOW }).titel.length, 80)
    // Steuerzeichen (auch ein Zeilenumbruch) fliegen aus dem Titel, Bidi-Zeichen aus beiden Feldern.
    assert.equal(lib.validateHinweis({ titel: 'Wartung\nheute‮' }, { now: NOW }).titel, 'Wartungheute')
    expectStatus(() => lib.validateHinweis({ titel: 'T', text: 'y'.repeat(1001) }, { now: NOW }), 400, /1000/)
    assert.equal(lib.validateHinweis({ titel: 'T', text: '' }, { now: NOW }).text, null)
    expectStatus(() => lib.validateHinweis({ titel: 42 }, { now: NOW }), 400)
  })

  await t.test('kein HTML in Titel und Text', () => {
    expectStatus(() => lib.validateHinweis({ titel: '<b>Wartung</b>' }, { now: NOW }), 400, /HTML/)
    expectStatus(() => lib.validateHinweis({ titel: 'Wartung', text: 'a <script>' }, { now: NOW }), 400, /HTML/)
  })

  await t.test('Stufe nur info, wartung, wichtig; aktiv nur als Boolean; unbekannte Felder abgelehnt', () => {
    for (const stufe of ['info', 'wartung', 'wichtig']) {
      assert.equal(lib.validateHinweis({ titel: 'T', stufe }, { now: NOW }).stufe, stufe)
    }
    expectStatus(() => lib.validateHinweis({ titel: 'T', stufe: 'alarm' }, { now: NOW }), 400, /Stufe/)
    assert.equal(lib.validateHinweis({ titel: 'T', aktiv: false }, { now: NOW }).aktiv, 0)
    expectStatus(() => lib.validateHinweis({ titel: 'T', aktiv: 'ja' }, { now: NOW }), 400)
    expectStatus(() => lib.validateHinweis({ titel: 'T', farbe: 'rot' }, { now: NOW }), 400, /farbe/)
    expectStatus(() => lib.validateHinweis([], { now: NOW }), 400)
  })

  await t.test('Zeiten: ISO mit Zeitzone, gespeichert in UTC; Ende nach dem Beginn; leeres Ende = offen', () => {
    const clean = lib.validateHinweis(
      { titel: 'T', start: '2026-10-05T22:00+02:00', ende: '2026-10-06T01:30:00+02:00' },
      { now: NOW }
    )
    assert.equal(clean.start, '2026-10-05T20:00:00.000Z')
    assert.equal(clean.ende, '2026-10-05T23:30:00.000Z')
    assert.equal(lib.validateHinweis({ titel: 'T', ende: '' }, { now: NOW }).ende, null)
    assert.equal(lib.validateHinweis({ titel: 'T', ende: null }, { now: NOW }).ende, null)
    expectStatus(() => lib.validateHinweis({ titel: 'T', start: '2026-10-05T22:00' }, { now: NOW }), 400, /Beginn/)
    expectStatus(() => lib.validateHinweis({ titel: 'T', start: '2026-02-30T10:00Z' }, { now: NOW }), 400, /Beginn/)
    expectStatus(() => lib.validateHinweis({ titel: 'T', start: '' }, { now: NOW }), 400, /Beginn/)
    expectStatus(() => lib.validateHinweis({ titel: 'T', ende: 'morgen' }, { now: NOW }), 400, /Ende/)
    expectStatus(() => lib.validateHinweis({ titel: 'T', start: '1999-12-31T10:00Z' }, { now: NOW }), 400, /Beginn/)
    expectStatus(
      () => lib.validateHinweis({ titel: 'T', start: '2026-10-05T10:00Z', ende: '2026-10-05T10:00Z' }, { now: NOW }),
      400,
      /Ende muss nach dem Beginn/
    )
    const err = (() => {
      try {
        lib.validateHinweis({ titel: 'T', start: '2026-10-05T10:00Z', ende: '2026-10-05T09:00Z' }, { now: NOW })
      } catch (caught) {
        return caught
      }
    })()
    assert.equal(err.feld, 'ende')
  })

  await t.test('Ändern: fehlende Felder bleiben, das Ende wird gegen den bestehenden Beginn geprüft', () => {
    const existing = { titel: 'Alt', text: 'Text', titel_en: 'Old', text_en: null, stufe: 'wartung', start: '2026-10-05T20:00:00.000Z', ende: null, aktiv: 1 }
    assert.deepEqual(lib.validateHinweis({ aktiv: false }, { now: NOW, existing }), { ...existing, aktiv: 0 })
    expectStatus(() => lib.validateHinweis({ ende: '2026-10-05T19:00Z' }, { now: NOW, existing }), 400, /Ende/)
    expectStatus(() => lib.validateHinweis({ titel: '' }, { now: NOW, existing }), 400, /Titel/)
    assert.equal(lib.validateHinweis({ text: null }, { now: NOW, existing }).text, null)
    expectStatus(() => lib.validateHinweis({}, { now: NOW, existing }), 400, /Nichts zu ändern/)
    // Ein unbekannter Feldname kommt höchstens gekürzt in die Meldung zurück.
    expectStatus(() => lib.validateHinweis({ ['x'.repeat(500)]: 1 }, { now: NOW, existing }), 400, /^Unbekanntes Feld: x{40}$/)
  })

  await t.test('Status: aus, geplant, aktiv, abgelaufen', () => {
    const base = { aktiv: 1, start: '2026-10-03T09:00:00.000Z', ende: '2026-10-03T11:00:00.000Z' }
    assert.equal(lib.hinweisStatus(base, NOW), 'aktiv')
    assert.equal(lib.hinweisStatus({ ...base, aktiv: 0 }, NOW), 'aus')
    assert.equal(lib.hinweisStatus({ ...base, start: '2026-10-03T10:00:00.001Z' }, NOW), 'geplant')
    assert.equal(lib.hinweisStatus({ ...base, ende: '2026-10-03T09:59:59.999Z' }, NOW), 'abgelaufen')
    assert.equal(lib.hinweisStatus({ ...base, ende: null }, NOW), 'aktiv')
    // Grenzen zählen mit: start <= jetzt <= ende
    assert.equal(lib.hinweisStatus({ ...base, start: NOW.toISOString(), ende: NOW.toISOString() }, NOW), 'aktiv')
  })

  await t.test('öffentlich: nur aktive im Zeitraum, neueste zuerst, höchstens fünf, nur Titel/Text/Stufe', () => {
    db.exec('DELETE FROM hinweise')
    const now = NOW.getTime()
    const add = (titel, startH, endeH, { aktiv = 1, isDemo = 0 } = {}) =>
      lib.createHinweis(
        { titel, text: null, stufe: 'info', start: iso(startH, now), ende: endeH === null ? null : iso(endeH, now), aktiv },
        { isDemo: Boolean(isDemo) }
      )
    add('vorbei', -5, -1)
    add('geplant', 1, 3)
    add('aus', -5, 5, { aktiv: 0 })
    for (let i = 1; i <= 6; i += 1) add(`laeuft ${i}`, -10 + i, null)
    const list = lib.listPublicHinweise({ now: NOW, includeDemo: true })
    assert.deepEqual(
      list.map((h) => h.titel),
      ['laeuft 6', 'laeuft 5', 'laeuft 4', 'laeuft 3', 'laeuft 2']
    )
    assert.deepEqual(Object.keys(list[0]).sort(), ['id', 'stufe', 'text', 'textEn', 'titel', 'titelEn'])
  })

  await t.test('Englisch optional: Titel und Text geprüft wie Deutsch, englischer Text nur mit englischem Titel', () => {
    const clean = lib.validateHinweis({ titel: 'Neu', titelEn: '  New  ', textEn: 'Line' }, { now: NOW })
    assert.equal(clean.titel_en, 'New')
    assert.equal(clean.text_en, 'Line')
    expectStatus(() => lib.validateHinweis({ titel: 'Neu', textEn: 'Line' }, { now: NOW }), 400, /englischer Titel/)
    expectStatus(() => lib.validateHinweis({ titel: 'Neu', titelEn: '<b>x</b>' }, { now: NOW }), 400, /HTML/)
    expectStatus(() => lib.validateHinweis({ titel: 'Neu', titelEn: 'x'.repeat(81) }, { now: NOW }), 400, /80/)
    db.exec('DELETE FROM hinweise')
    lib.replaceDemoHinweise({ appEnv: 'dev', now: NOW })
    const [demo] = lib.listPublicHinweise({ now: NOW, includeDemo: true })
    assert.equal(demo.titelEn, 'Welcome to the preview')
    assert.match(demo.textEn, /notices from the team/)
  })

  await t.test('öffentlich ohne Demo: Beispiel-Hinweise erscheinen in Produktion nie', () => {
    db.exec('DELETE FROM hinweise')
    lib.createHinweis({ titel: 'Beispiel', text: null, stufe: 'info', start: iso(-1, NOW.getTime()), ende: null, aktiv: 1 }, { isDemo: true })
    assert.equal(lib.listPublicHinweise({ now: NOW, includeDemo: true }).length, 1)
    assert.equal(lib.listPublicHinweise({ now: NOW, includeDemo: false }).length, 0)
  })

  await t.test('Beispiel-Hinweis: ersetzt nur Beispiel-Zeilen und verweigert Produktion', () => {
    db.exec('DELETE FROM hinweise')
    const echt = lib.createHinweis({ titel: 'Echt', text: null, stufe: 'wichtig', start: NOW.toISOString(), ende: null, aktiv: 1 })
    lib.replaceDemoHinweise({ appEnv: 'staging', now: NOW })
    lib.replaceDemoHinweise({ appEnv: 'dev', now: NOW })
    const rows = db.prepare('SELECT titel, is_demo, stufe, aktiv FROM hinweise ORDER BY id').all()
    assert.deepEqual(
      rows.map((row) => ({ ...row })),
      [
        { titel: 'Echt', is_demo: 0, stufe: 'wichtig', aktiv: 1 },
        { titel: 'Willkommen auf der Vorschau', is_demo: 1, stufe: 'info', aktiv: 1 }
      ]
    )
    assert.ok(echt.id)
    assert.throws(() => lib.replaceDemoHinweise({ appEnv: 'production', now: NOW }), /Produktion/)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM hinweise WHERE is_demo = 1').get().n, 1)
  })
})

test('API: Hinweise anlegen, ändern, löschen (Admin) und öffentlich lesen', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  db.exec('DELETE FROM hinweise')

  const login = await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: ADMIN_TEST_PASSWORD } })
  const adminCookie = getCookie(login.res)
  const admin = (urlPath, { method = 'GET', body } = {}) => call(base, urlPath, { method, body, cookie: adminCookie })
  const logRows = () => db.prepare("SELECT aktion, ziel FROM admin_log WHERE aktion LIKE 'hinweis-%' ORDER BY id").all()
  let created

  await t.test('ohne Admin-Cookie 401, auch dann no-store', async () => {
    for (const [method, urlPath] of [
      ['GET', '/api/admin/hinweise'],
      ['POST', '/api/admin/hinweise'],
      ['PUT', '/api/admin/hinweise/1'],
      ['DELETE', '/api/admin/hinweise/1']
    ]) {
      const res = await call(base, urlPath, { method, body: method === 'GET' || method === 'DELETE' ? undefined : {} })
      assert.equal(res.status, 401, `${method} ${urlPath}`)
      assert.equal(res.headers.get('cache-control'), 'no-store', `${method} ${urlPath}`)
    }
  })

  await t.test('anlegen: 201 mit Status, Protokoll ohne Inhalte', async () => {
    const res = await admin('/api/admin/hinweise', {
      method: 'POST',
      body: { titel: 'Wartung heute Abend', text: 'Ab 22 Uhr\nkurz nicht erreichbar.', stufe: 'wartung', start: iso(-1), ende: iso(2) }
    })
    assert.equal(res.status, 201)
    assert.equal(res.headers.get('cache-control'), 'no-store')
    created = res.data
    assert.equal(created.titel, 'Wartung heute Abend')
    assert.equal(created.text, 'Ab 22 Uhr\nkurz nicht erreichbar.')
    assert.equal(created.stufe, 'wartung')
    assert.equal(created.aktiv, true)
    assert.equal(created.isDemo, false)
    assert.equal(created.status, 'aktiv')
    assert.match(created.start, /Z$/)
    assert.deepEqual(logRows(), [{ aktion: 'hinweis-angelegt', ziel: `hinweis:${created.id}` }])
  })

  await t.test('anlegen: Fehler mit Feld (400), nichts gespeichert', async () => {
    const res = await admin('/api/admin/hinweise', { method: 'POST', body: { titel: 'T', start: iso(1), ende: iso(0) } })
    assert.equal(res.status, 400)
    assert.equal(res.data.feld, 'ende')
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM hinweise').get().n, 1)
  })

  await t.test('Liste: alle mit Status, neueste zuerst', async () => {
    await admin('/api/admin/hinweise', { method: 'POST', body: { titel: 'Geplant', start: iso(24) } })
    const res = await admin('/api/admin/hinweise')
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('cache-control'), 'no-store')
    assert.deepEqual(
      res.data.hinweise.map((h) => [h.titel, h.status]),
      [
        ['Geplant', 'geplant'],
        ['Wartung heute Abend', 'aktiv']
      ]
    )
    assert.equal(res.data.max, 100)
  })

  await t.test('öffentlich: ohne Login, nur laufende, kurz cachebar', async () => {
    const res = await call(base, '/api/hinweise')
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('cache-control'), 'public, no-cache')
    assert.deepEqual(res.data, {
      hinweise: [{ id: created.id, titel: 'Wartung heute Abend', text: 'Ab 22 Uhr\nkurz nicht erreichbar.', titelEn: null, textEn: null, stufe: 'wartung' }]
    })
  })

  await t.test('öffentlich: auch in einer Demo-Sitzung', async () => {
    db.prepare("INSERT INTO families (name, password_hash, is_demo) VALUES ('Familie Hinweis-Demo', 'kein-login', 1)").run()
    const demo = await call(base, '/api/demo', { method: 'POST', body: {} })
    assert.equal(demo.status, 200)
    const res = await call(base, '/api/hinweise', { cookie: getCookie(demo.res) })
    assert.equal(res.status, 200)
    assert.equal(res.data.hinweise.length, 1)
  })

  await t.test('ändern: nur aktiv umschalten wird als Ein/Aus protokolliert, sonst als Änderung', async () => {
    const off = await admin(`/api/admin/hinweise/${created.id}`, { method: 'PUT', body: { aktiv: false } })
    assert.equal(off.status, 200)
    assert.equal(off.data.aktiv, false)
    assert.equal(off.data.status, 'aus')
    assert.equal(off.data.titel, 'Wartung heute Abend')
    assert.deepEqual((await call(base, '/api/hinweise')).data.hinweise, [])

    const on = await admin(`/api/admin/hinweise/${created.id}`, { method: 'PUT', body: { aktiv: true } })
    assert.equal(on.data.status, 'aktiv')
    const edit = await admin(`/api/admin/hinweise/${created.id}`, { method: 'PUT', body: { titel: 'Wartung verschoben', stufe: 'wichtig' } })
    assert.equal(edit.status, 200)
    assert.equal(edit.data.titel, 'Wartung verschoben')
    assert.equal(edit.data.stufe, 'wichtig')
    assert.notEqual(edit.data.updatedAt, undefined)
    assert.deepEqual(
      logRows().slice(-3).map((row) => row.aktion),
      ['hinweis-ausgeschaltet', 'hinweis-eingeschaltet', 'hinweis-geaendert']
    )
  })

  await t.test('ändern/löschen: unbekannte oder ungültige Id 404, Fehler 400', async () => {
    assert.equal((await admin('/api/admin/hinweise/999999', { method: 'PUT', body: { aktiv: true } })).status, 404)
    assert.equal((await admin('/api/admin/hinweise/abc', { method: 'PUT', body: { aktiv: true } })).status, 404)
    assert.equal((await admin('/api/admin/hinweise/999999', { method: 'DELETE' })).status, 404)
    const bad = await admin(`/api/admin/hinweise/${created.id}`, { method: 'PUT', body: { stufe: 'alarm' } })
    assert.equal(bad.status, 400)
    assert.equal(bad.data.feld, 'stufe')
  })

  await t.test('löschen: 204, danach weg, protokolliert', async () => {
    const res = await admin(`/api/admin/hinweise/${created.id}`, { method: 'DELETE' })
    assert.equal(res.status, 204)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM hinweise WHERE id = ?').get(created.id).n, 0)
    assert.deepEqual(logRows().at(-1), { aktion: 'hinweis-geloescht', ziel: `hinweis:${created.id}` })
  })

  await t.test('höchstens 100 gespeicherte Hinweise', async () => {
    const lib = require('../lib/hinweise')
    db.exec('DELETE FROM hinweise')
    for (let i = 0; i < lib.MAX_HINWEISE; i += 1) {
      lib.createHinweis({ titel: `H${i}`, text: null, stufe: 'info', start: iso(-1), ende: null, aktiv: 0 })
    }
    const res = await admin('/api/admin/hinweise', { method: 'POST', body: { titel: 'Einer zu viel' } })
    assert.equal(res.status, 409)
  })
})
