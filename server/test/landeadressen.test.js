const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, getCookie } = require('./helpers')

// Plan 2027 Kap. 6 „Messen ohne Tracking“: Landeadressen je Kanal (lib/landeadressen.js, lib/landeadressenRegeln.js,
// lib/landeadresseWeiterleitung.js, routes/adminLandeadressen.js).
const ADMIN_TEST_PASSWORD = 'admin-test-lande-passwort-1'
const dataDir = useTempDataDir('landeadressen', { LOGIN_RATE_LIMIT: '300' })

test('Landeadressen je Kanal', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
  const { server, base } = await startApp()
  const db = require('../db')
  const { createBatch } = require('../lib/vouchers')
  const { cleanSlug, cleanZiel, cleanSerie } = require('../lib/landeadressenRegeln')
  const { resetZaehlSperre } = require('../lib/landeadresseWeiterleitung')
  t.after(() => cleanup(dataDir, server))

  const login = await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: ADMIN_TEST_PASSWORD } })
  const cookie = getCookie(login.res)
  const admin = (path, opts = {}) => call(base, `/api/admin${path}`, { cookie, ...opts })
  const visit = (path, userAgent = 'Mozilla/5.0') => fetch(`${base}${path}`, { redirect: 'manual', headers: { 'User-Agent': userAgent } })
  const liste = async () => (await admin('/landeadressen')).data.landeadressen
  const bySlug = async (slug) => (await liste()).find((row) => row.slug === slug)

  await t.test('Regeln: Kurzname, reservierte Namen, Ziel, Serie', () => {
    assert.equal(cleanSlug(' Hallo '), 'hallo')
    assert.equal(cleanSlug('anzeige-herbst'), 'anzeige-herbst')
    for (const bad of ['a', 'x'.repeat(31), 'ha llo', 'hällo', 'a_b', '-fb', 'fb-', '', undefined]) {
      assert.throws(() => cleanSlug(bad), /Kurzname/, String(bad))
    }
    for (const reserved of ['api', 'admin', 'p', 'start', 'tier', 'tiere', 'partner-werden', 'uploads', 'assets', 'health', 'robots', 'vorstellung']) {
      assert.throws(() => cleanSlug(reserved), (err) => err.status === 400, reserved)
    }
    assert.equal(cleanZiel(undefined), '/')
    assert.equal(cleanZiel('/partner-werden'), '/partner-werden')
    assert.equal(cleanZiel('/p/hundeschule-benno'), '/p/hundeschule-benno')
    for (const bad of ['//fremd.example', 'https://fremd.example', 'partner', '/\\fremd', '/unbekannt', '/fb', '/ start', 'javascript:alert(1)']) {
      assert.throws(() => cleanZiel(bad), /Ziel/, bad)
    }
    assert.equal(cleanSerie(''), null)
    assert.equal(cleanSerie('fb'), 'FB')
    assert.throws(() => cleanSerie('FB-1'), /Code-Serie/)
  })

  await t.test('Admin: Anmeldung nötig, no-store, anlegen und Fehler', async () => {
    assert.equal((await call(base, '/api/admin/landeadressen')).status, 401)
    const ohne = await call(base, '/api/admin/landeadressen', { method: 'POST', body: { slug: 'fb' } })
    assert.equal(ohne.status, 401)

    const fb = await admin('/landeadressen', { method: 'POST', body: { slug: 'FB', serie: 'fb' } })
    assert.equal(fb.status, 201)
    assert.match(fb.headers.get('cache-control') ?? '', /no-store/)
    assert.equal(fb.data.slug, 'fb')
    assert.equal(fb.data.ziel, '/')
    assert.equal(fb.data.serie, 'FB')
    assert.equal(fb.data.aktiv, true)

    const hallo = await admin('/landeadressen', { method: 'POST', body: { slug: 'hallo', ziel: '/partner-werden' } })
    assert.equal(hallo.status, 201)
    assert.equal(hallo.data.einloesungen, null)

    assert.equal((await admin('/landeadressen', { method: 'POST', body: { slug: 'fb' } })).status, 409)
    const reserviert = await admin('/landeadressen', { method: 'POST', body: { slug: 'admin' } })
    assert.equal(reserviert.status, 400)
    assert.equal(reserviert.data.feld, 'slug')
    const fremd = await admin('/landeadressen', { method: 'POST', body: { slug: 'weg', ziel: '//fremd.example' } })
    assert.equal(fremd.status, 400)
    assert.equal(fremd.data.feld, 'ziel')
    assert.equal((await admin('/landeadressen/999', { method: 'PUT', body: { aktiv: false } })).status, 404)

    const log = db.prepare("SELECT ziel FROM admin_log WHERE aktion = 'landeadresse-angelegt' ORDER BY id").all()
    assert.deepEqual(log.map((row) => row.ziel), [`landeadresse:${fb.data.id}`, `landeadresse:${hallo.data.id}`])
  })

  await t.test('Aufruf zählt anonym und leitet weiter, eine IP zählt einmal je Stunde', async () => {
    resetZaehlSperre()
    const first = await visit('/hallo')
    assert.equal(first.status, 302)
    assert.equal(first.headers.get('location'), '/partner-werden')
    assert.match(first.headers.get('cache-control') ?? '', /no-store/)
    assert.equal(first.headers.get('set-cookie'), null)

    assert.equal((await visit('/HALLO/')).status, 302)
    assert.equal((await visit('/hallo', 'facebookexternalhit/1.1')).status, 302)
    let row = await bySlug('hallo')
    assert.equal(row.besuche30, 1)
    assert.equal(row.besucheGesamt, 1)

    resetZaehlSperre()
    await visit('/hallo')
    db.prepare("INSERT INTO landeadresse_besuche (landeadresse_id, tag, anzahl) VALUES (?, date('now', '-40 days'), 5)").run(row.id)
    row = await bySlug('hallo')
    assert.equal(row.besuche30, 2)
    assert.equal(row.besucheGesamt, 7)
  })

  await t.test('Keine personenbezogenen Daten in den Tabellen', () => {
    const spalten = (table) => db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name).sort()
    assert.deepEqual(spalten('landeadresse_besuche'), ['anzahl', 'landeadresse_id', 'tag'])
    assert.deepEqual(spalten('landeadressen'), ['aktiv', 'created_at', 'id', 'serie', 'slug', 'ziel'])
  })

  await t.test('Ausgeschaltet oder unbekannt: keine Weiterleitung, fällt durch', async () => {
    const row = await bySlug('hallo')
    const aus = await admin(`/landeadressen/${row.id}`, { method: 'PUT', body: { aktiv: false } })
    assert.equal(aus.status, 200)
    assert.equal(aus.data.aktiv, false)
    const weg = await visit('/hallo')
    assert.notEqual(weg.status, 302)
    assert.equal(weg.headers.get('location'), null)
    assert.notEqual((await visit('/gibt-es-nicht')).status, 302)
    assert.equal((await visit('/api')).status, 404)

    const logged = db.prepare('SELECT aktion FROM admin_log WHERE ziel = ? ORDER BY id DESC LIMIT 1').get(`landeadresse:${row.id}`)
    assert.equal(logged.aktion, 'landeadresse-ausgeschaltet')
    assert.equal((await admin(`/landeadressen/${row.id}`, { method: 'PUT', body: { aktiv: 'ja' } })).status, 400)
  })

  await t.test('Code-Serie: eingelöste Codes der passenden Stapel', async () => {
    const stapel = (label, size, redeemed, kind = 'admin') => {
      const { batchId } = createBatch(db, { label, kind, size })
      const ids = db.prepare('SELECT id FROM vouchers WHERE batch_id = ? ORDER BY id').all(batchId).map((r) => r.id)
      redeemed.forEach((ago, i) => db.prepare("UPDATE vouchers SET redeemed_at = datetime('now', ?) WHERE id = ?").run(`-${ago} days`, ids[i]))
    }
    stapel('FB-Frühjahr', 3, [2, 60])
    stapel('fb-Herbst', 2, [5])
    stapel('FBX-Anders', 2, [1])
    stapel('Demo-Stapel', 2, [1], 'demo')
    const fb = await bySlug('fb')
    assert.deepEqual(fb.einloesungen, { gesamt: 3, tage30: 2 })
  })
})
