const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, createHousehold, getCookie } = require('./helpers')

// Phase F: „Überall sichtbar (vorerst kostenlos)“ (lib/ueberallSichtbar.js) - der Partner schaltet es im Profil, der Admin
// kann es ausschalten; in „Entdecken“ steht ein so markierter Partner auch außerhalb des Umkreises, hinter den nahen
// Treffern und gekennzeichnet (ueberall: true). Demo-Trennung wie bei allen Partnern. t.test() bleibt auf einer Ebene.
const ADMIN_TEST_PASSWORD = 'admin-test-ueberall-1'
const dataDir = useTempDataDir('ueberall-sichtbar', { LOGIN_RATE_LIMIT: '300', CODE_RATE_LIMIT: '300' })

const LONG_TEXT = 'Wir trainieren mit Familien und ihren Hunden im Park und in der Stadt – ruhig, freundlich und alltagsnah.'

test('„Überall sichtbar“: Schalter, Entdecken, Demo-Trennung, Protokoll', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const { withUeberallSichtbar, parseAn } = require('../lib/ueberallSichtbar')
  const { radiusSection } = require('../lib/nearby')
  const { lookupPlz } = require('../lib/geo')

  const adminLogin = await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: ADMIN_TEST_PASSWORD } })
  const adminCookie = getCookie(adminLogin.res)
  const get = (urlPath, cookie) => call(base, urlPath, { cookie })
  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const put = (urlPath, body, cookie) => call(base, urlPath, { method: 'PUT', body, cookie })
  const discover = (body, cookie) => call(base, '/api/discover', { method: 'POST', body, cookie })
  const adminLog = () => db.prepare('SELECT aktion, ziel FROM admin_log ORDER BY id').all()

  let counter = 0
  function insertPartner(overrides = {}) {
    counter += 1
    const slug = `ueberall-${counter}`
    const plz = overrides.plz || '10115'
    const hit = lookupPlz(plz)
    db.prepare(
      `INSERT INTO partners (slug, name, typ, status, plz, ort, lat, lon, portal_text, is_demo, ueberall_sichtbar)
       VALUES (@slug, @name, 'hundeschule', 'aktiv', @plz, @ort, @lat, @lon, @text, @is_demo, @ueberall)`
    ).run({
      slug,
      name: overrides.name || `Hundeschule ${counter}`,
      plz,
      ort: hit.ort,
      lat: hit.lat,
      lon: hit.lon,
      text: LONG_TEXT,
      is_demo: overrides.is_demo || 0,
      ueberall: overrides.ueberall || 0
    })
    return db.prepare('SELECT * FROM partners WHERE slug = ?').get(slug)
  }

  await t.test('lib: parseAn und withUeberallSichtbar (Reihenfolge, Kennzeichnung, Fallback)', () => {
    assert.equal(parseAn({ an: true }), true)
    assert.equal(parseAn({ an: false }), false)
    for (const body of [{}, { an: 'ja' }, { an: 1 }, null, 'x']) {
      assert.throws(() => parseAn(body), (err) => err.status === 400)
    }

    const center = { lat: 52.53, lon: 13.38 }
    const rows = [
      { id: 1, name: 'Nah B', lat: 52.54, lon: 13.39, ueberall_sichtbar: 0 },
      { id: 2, name: 'Nah A', lat: 52.53, lon: 13.4, ueberall_sichtbar: 1 },
      { id: 3, name: 'Fern Hamburg', lat: 53.55, lon: 9.99, ueberall_sichtbar: 1 },
      { id: 4, name: 'Fern München', lat: 48.14, lon: 11.58, ueberall_sichtbar: 1 },
      { id: 5, name: 'Fern Köln', lat: 50.94, lon: 6.96, ueberall_sichtbar: 0 },
      { id: 6, name: 'Ohne Ort', lat: null, lon: null, ueberall_sichtbar: 1 }
    ]
    // Ohne Mittelpunkt: unverändert (jeder steht ohnehin da).
    const plain = radiusSection(rows, null, null)
    assert.equal(withUeberallSichtbar(plain, rows, null), plain)

    // Mit Umkreis 10 km: zwei nahe (unter MIN_IN_RADIUS -> Fallback hängt die nächsten außerhalb an). Die „überall“-Partner
    // kommen hinter die nahen, nach Entfernung, ohne Koordinaten zuletzt; Köln bleibt „Weiter weg“.
    const result = withUeberallSichtbar(radiusSection(rows, center, 10), rows, center)
    assert.deepEqual(
      result.items.map((item) => [item.row.id, item.ueberall === true, item.ausserhalb === true]),
      [
        [1, false, false],
        [2, false, false],
        [3, true, false],
        [4, true, false],
        [6, true, false],
        [5, false, true]
      ]
    )
    assert.equal(result.fallback, true)
    assert.equal(typeof result.items[2].distanceKm, 'number')
    assert.equal(result.items[4].distanceKm, undefined)

    // Nur „überall“-Partner außerhalb: nichts bleibt für „Weiter weg“, fallback also false.
    const onlyUeberall = rows.filter((row) => row.id !== 5)
    const result2 = withUeberallSichtbar(radiusSection(onlyUeberall, center, 10), onlyUeberall, center)
    assert.equal(result2.fallback, false)
    assert.equal(result2.items.some((item) => item.ausserhalb), false)
  })

  // --- Entdecken über die API -----------------------------------------------------------------------
  const nahA = insertPartner({ name: 'Nahe Hundeschule A', plz: '10115' })
  insertPartner({ name: 'Nahe Hundeschule B', plz: '10117' })
  insertPartner({ name: 'Nahe Hundeschule C', plz: '10119' })
  insertPartner({ name: 'Nahe Hundeschule D', plz: '10178' })
  insertPartner({ name: 'Nahe Hundeschule E', plz: '10179' })
  const hamburg = insertPartner({ name: 'Hamburger Hundeschule', plz: '20095', ueberall: 1 })
  insertPartner({ name: 'Münchner Hundeschule', plz: '80331' })
  const demoUeberall = insertPartner({ name: 'Demo überall', plz: '50667', is_demo: 1, ueberall: 1 })

  const household = await createHousehold(base, 'Zuhause Test')
  assert.equal(household.status, 201)
  // Eine Demo-Sitzung wie in test/discover.test.js: ein Zuhause mit is_demo = 1.
  const demoHousehold = await createHousehold(base, 'Zuhause Demo')
  db.prepare('UPDATE families SET is_demo = 1 WHERE id = ?').run(demoHousehold.data.id)

  await t.test('Entdecken: der „überall“-Partner steht hinter den nahen, gekennzeichnet; Zähler stimmen', async () => {
    const res = await discover({ plz: '10115', radius: 10 }, household.cookie)
    assert.equal(res.status, 200)
    const cards = res.data.hundeschulen.filter((card) => card.kind === 'partner')
    // Fünf nahe -> kein Fallback, München fehlt; Hamburg steht trotzdem da - hinter den nahen, mit ueberall und Entfernung.
    // Die Testumgebung ist dev/staging: eine echte Sitzung sieht dort zusätzlich die Demo-Partner (discover.js
    // partnerDemoValues), darum folgt der Demo-Partner mit Schalter (Köln, weiter weg) hinter Hamburg.
    assert.equal(res.data.fallback.hundeschulen, false)
    assert.equal(cards[0].id, nahA.id)
    assert.equal(cards.slice(0, 5).every((card) => card.ueberall === undefined && card.ausserhalb === false), true)
    assert.deepEqual(
      cards.slice(5).map((card) => [card.id, card.ueberall, card.ausserhalb]),
      [
        [hamburg.id, true, undefined],
        [demoUeberall.id, true, undefined]
      ]
    )
    assert.ok(cards[5].distanceKm > 200)
    assert.equal(cards.some((card) => card.name === 'Münchner Hundeschule'), false)
    // Die Karte ist eine normale Partner-Karte (Portal-Slug, Kennzeichnung).
    assert.equal(cards[5].slug, hamburg.slug)
    assert.equal(cards[5].badge, 'partner')
  })

  await t.test('Entdecken ohne PLZ: alle nach Name, keine Kennzeichnung', async () => {
    const res = await discover({}, household.cookie)
    const cards = res.data.hundeschulen.filter((card) => card.kind === 'partner')
    assert.equal(cards.every((card) => card.ueberall === undefined), true)
    assert.ok(cards.some((card) => card.id === hamburg.id))
  })

  await t.test('Demo-Trennung: eine Demo-Sitzung sieht keinen echten „überall“-Partner', async () => {
    const res = await discover({ plz: '10115', radius: 10 }, demoHousehold.cookie)
    assert.equal(res.status, 200)
    const ids = res.data.hundeschulen.filter((card) => card.kind === 'partner').map((card) => card.id)
    assert.equal(ids.includes(hamburg.id), false)
    assert.equal(ids.includes(nahA.id), false)
    assert.ok(ids.includes(demoUeberall.id), 'der Demo-Partner mit Schalter steht in der Demo-Sitzung')
    assert.equal(res.data.hundeschulen.find((card) => card.id === demoUeberall.id).ueberall, true)
  })

  // --- Schalter im Partner-Bereich -----------------------------------------------------------------
  let area
  await t.test('Partner: Schalter im eigenen Profil, nicht über PUT /profile; gesperrt -> 403', async () => {
    const partner = await post('/api/admin/partners', { name: 'Hundeschule Schalter', slug: 'hundeschule-schalter', typ: 'hundeschule', status: 'entwurf' }, adminCookie)
    assert.equal(partner.status, 201)
    const created = await post(`/api/admin/partners/${partner.data.id}/area`, undefined, adminCookie)
    assert.equal(created.status, 201)
    const login = await post('/api/login', { secret: created.data.key })
    assert.equal(login.status, 200)
    area = { partnerId: partner.data.id, cookie: getCookie(login.res) }

    const profile = await get('/api/partner-area/profile', area.cookie)
    assert.equal(profile.data.ueberallSichtbar, false)

    const viaProfile = await put('/api/partner-area/profile', { ueberallSichtbar: true }, area.cookie)
    assert.equal(viaProfile.status, 400)

    const bad = await put('/api/partner-area/profile/ueberall-sichtbar', { an: 'ja' }, area.cookie)
    assert.equal(bad.status, 400)

    const on = await put('/api/partner-area/profile/ueberall-sichtbar', { an: true }, area.cookie)
    assert.equal(on.status, 200)
    assert.equal(on.data.ueberallSichtbar, true)
    assert.equal(db.prepare('SELECT ueberall_sichtbar FROM partners WHERE id = ?').get(area.partnerId).ueberall_sichtbar, 1)

    // Ohne Anmeldung nichts.
    assert.equal((await put('/api/partner-area/profile/ueberall-sichtbar', { an: false })).status, 401)
    assert.equal((await put('/api/partner-area/profile/ueberall-sichtbar', { an: false }, household.cookie)).status, 403)

    db.prepare('UPDATE partners SET gesperrt = 1 WHERE id = ?').run(area.partnerId)
    const locked = await put('/api/partner-area/profile/ueberall-sichtbar', { an: false }, area.cookie)
    assert.equal(locked.status, 403)
    db.prepare('UPDATE partners SET gesperrt = 0 WHERE id = ?').run(area.partnerId)
  })

  await t.test('Admin: Schalter ausschalten, Protokoll nur bei Änderung, Prüfung', async () => {
    const logBefore = adminLog().length
    const off = await put(`/api/admin/partners/${area.partnerId}/ueberall-sichtbar`, { an: false }, adminCookie)
    assert.equal(off.status, 200)
    assert.equal(off.headers.get('cache-control'), 'no-store')
    assert.deepEqual(off.data, { id: area.partnerId, ueberallSichtbar: false })
    assert.deepEqual(adminLog().slice(logBefore), [{ aktion: 'partner-nicht-ueberall-sichtbar', ziel: `partner:${area.partnerId}` }])

    // Unverändert: kein weiterer Eintrag.
    await put(`/api/admin/partners/${area.partnerId}/ueberall-sichtbar`, { an: false }, adminCookie)
    assert.equal(adminLog().length, logBefore + 1)

    const on = await put(`/api/admin/partners/${area.partnerId}/ueberall-sichtbar`, { an: true }, adminCookie)
    assert.equal(on.data.ueberallSichtbar, true)
    assert.deepEqual(adminLog().at(-1), { aktion: 'partner-ueberall-sichtbar', ziel: `partner:${area.partnerId}` })

    assert.equal((await put(`/api/admin/partners/${area.partnerId}/ueberall-sichtbar`, { an: 1 }, adminCookie)).status, 400)
    assert.equal((await put('/api/admin/partners/999/ueberall-sichtbar', { an: true }, adminCookie)).status, 404)
    assert.equal((await put(`/api/admin/partners/${area.partnerId}/ueberall-sichtbar`, { an: false })).status, 401)
    assert.equal((await put(`/api/admin/partners/${area.partnerId}/ueberall-sichtbar`, { an: false }, area.cookie)).status, 401)

    // Die Partnerliste des Admins zeigt den Schalter mit.
    const list = await get('/api/admin/partners', adminCookie)
    assert.equal(list.data.find((row) => row.id === area.partnerId).ueberall_sichtbar, 1)

    // Ein normales Bearbeiten durch den Admin (PUT /partners/:id) lässt den Schalter stehen.
    const edit = await put(`/api/admin/partners/${area.partnerId}`, { name: 'Hundeschule Schalter', typ: 'hundeschule' }, adminCookie)
    assert.equal(edit.status, 200)
    assert.equal(db.prepare('SELECT ueberall_sichtbar FROM partners WHERE id = ?').get(area.partnerId).ueberall_sichtbar, 1)
  })

  await t.test('Demo-Pack: Hundeschule Pfotenglück hat den Schalter an, die anderen nicht', () => {
    const { replaceDemoPack } = require('../lib/demoPack')
    const { uploadDir } = require('../config')
    replaceDemoPack(db, uploadDir)
    const rows = db.prepare('SELECT slug, ueberall_sichtbar FROM partners WHERE is_demo = 1 ORDER BY slug').all()
    assert.equal(rows.find((row) => row.slug === 'hundeschule-pfotenglueck').ueberall_sichtbar, 1)
    assert.equal(rows.filter((row) => row.slug !== 'hundeschule-pfotenglueck').every((row) => row.ueberall_sichtbar === 0), true)
  })
})
