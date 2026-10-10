const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, getCookie } = require('./helpers')

// Öffentliches Entdecken (routes/publicEntdecken.js, lib/publicEntdecken.js) und der Antrag „Überall sichtbar“ mit Freigabe
// durch das Team (lib/ueberallSichtbar.js, routes/adminPartnerSichtbar.js). APP_ENV=production: Demo-Partner nur mit
// ?demo=1. Das Limit je IP prüft test/publicEntdeckenLimit.test.js. t.test() bleibt auf einer Ebene.
const ADMIN_TEST_PASSWORD = 'admin-test-entdecken-1'
const dataDir = useTempDataDir('public-entdecken', { APP_ENV: 'production', LOGIN_RATE_LIMIT: '300', CODE_RATE_LIMIT: '300' })

const CARD_KEYS = ['badge', 'bildArt', 'bildUrl', 'kurztext', 'name', 'ort', 'plz', 'slug', 'typ']

test('Öffentliches Entdecken: Suche, Filter, Umkreis, Deutschlandweit, Demo, Antrag', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const { lookupPlz } = require('../lib/geo')

  const adminLogin = await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: ADMIN_TEST_PASSWORD } })
  const adminCookie = getCookie(adminLogin.res)
  const get = (urlPath, cookie) => call(base, urlPath, { cookie })
  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const put = (urlPath, body, cookie) => call(base, urlPath, { method: 'PUT', body, cookie })
  const entdecken = (qs = '') => get(`/api/public/entdecken${qs}`)
  const near = (body) => post('/api/public/entdecken', body)

  let counter = 0
  function insertPartner({ name, typ = 'hundeschule', plz = '10115', status = 'aktiv', gesperrt = 0, isDemo = 0, ueberall = 0, freigabe = '', titel = null }) {
    counter += 1
    const hit = lookupPlz(plz)
    const slug = `entdecken-${counter}`
    db.prepare(
      `INSERT INTO partners (slug, name, typ, status, gesperrt, plz, ort, lat, lon, portal_titel, portal_text, kontakt_email, kontakt_telefon,
         ansprechperson, is_demo, ueberall_sichtbar, ueberall_freigabe)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'privat@example.org', '0123 456789', 'Erfundene Person', ?, ?, ?)`
    ).run(slug, name, typ, status, gesperrt, plz, hit.ort, hit.lat, hit.lon, titel, `${name} stellt sich vor.\n\nZweiter Absatz.`, isDemo, ueberall, freigabe)
    return slug
  }

  const berlinSchule = insertPartner({ name: 'Hundeschule Kiezpfote', plz: '10115' })
  insertPartner({ name: 'Salon Spreeglanz', typ: 'hundesalon', plz: '10997', titel: 'Fellpflege in Ruhe' })
  const hamburgHeim = insertPartner({ name: 'Tierheim Hafenwind', typ: 'tierheim', plz: '20095' })
  const muenchen = insertPartner({ name: 'Pfotenhof München', typ: 'betreuung', plz: '80331' })
  const weit = insertPartner({ name: 'Tierhilfe Überall', typ: 'tierheim', plz: '60311', ueberall: 1, freigabe: 'freigegeben' })
  insertPartner({ name: 'Antrag Offen', typ: 'tierheim', plz: '60311', ueberall: 1, freigabe: '' })
  insertPartner({ name: 'Entwurf Hundeschule', status: 'entwurf' })
  insertPartner({ name: 'Gesperrte Hundeschule', gesperrt: 1 })
  const demo = insertPartner({ name: 'Demo Hundeschule', isDemo: 1 })

  await t.test('ohne Ort: nur öffentliche, nicht-Demo-Partner nach Name; Kartenfelder ohne private Daten; Cache-Header', async () => {
    const res = await entdecken()
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('cache-control'), 'private, max-age=60')
    assert.deepEqual(res.data.treffer.map((card) => card.name), ['Antrag Offen', 'Hundeschule Kiezpfote', 'Pfotenhof München', 'Salon Spreeglanz', 'Tierheim Hafenwind'])
    assert.deepEqual(res.data.deutschlandweit.map((card) => card.slug), [weit])
    assert.equal(res.data.deutschlandweit[0].deutschlandweit, true)
    assert.deepEqual({ gesamt: res.data.gesamt, seite: res.data.seite, seiten: res.data.seiten, mehr: res.data.mehr }, { gesamt: 5, seite: 1, seiten: 1, mehr: false })
    for (const card of res.data.treffer) assert.deepEqual(Object.keys(card).sort(), CARD_KEYS)
    assert.deepEqual(Object.keys(res.data.deutschlandweit[0]).sort(), [...CARD_KEYS, 'deutschlandweit'].sort())
    const salon = res.data.treffer.find((card) => card.name === 'Salon Spreeglanz')
    assert.equal(salon.kurztext, 'Fellpflege in Ruhe')
    assert.equal(res.data.treffer.find((card) => card.slug === berlinSchule).kurztext, 'Hundeschule Kiezpfote stellt sich vor.')
    assert.doesNotMatch(JSON.stringify(res.data), /privat@example|456789|Erfundene Person|is_demo|"lat"|"lon"/)
  })

  await t.test('Suche q: Name, Ort und Typ-Wörter; Typ-Filter; ungültige Eingaben 400', async () => {
    const byName = await entdecken('?q=kiez')
    assert.deepEqual(byName.data.treffer.map((card) => card.slug), [berlinSchule])
    const byOrt = await entdecken(`?q=${encodeURIComponent('münchen')}`)
    assert.deepEqual(byOrt.data.treffer.map((card) => card.slug), [muenchen])
    const byTypWort = await entdecken('?q=salon')
    assert.deepEqual(byTypWort.data.treffer.map((card) => card.name), ['Salon Spreeglanz'])
    // LIKE-Platzhalter in der Eingabe zählen wörtlich.
    assert.equal((await entdecken('?q=%25%25')).data.treffer.length, 0)

    const heime = await entdecken('?typ=tierheim,vermittlung')
    assert.deepEqual(heime.data.treffer.map((card) => card.slug).sort(), [hamburgHeim, 'entdecken-6'].sort())
    assert.deepEqual(heime.data.deutschlandweit.map((card) => card.slug), [weit])
    assert.equal((await entdecken('?typ=hundeschule')).data.deutschlandweit.length, 0, 'Deutschlandweit folgt dem Typ-Filter')

    assert.equal((await entdecken('?typ=zuechter')).status, 400)
    assert.equal((await entdecken(`?q=${'x'.repeat(61)}`)).status, 400)
    assert.equal((await entdecken('?seite=0')).status, 400)
    assert.equal((await entdecken('?seite=abc')).status, 400)
  })

  await t.test('Umkreis per POST (PLZ im Body): nach Entfernung, Deutschlandweit unabhängig von der PLZ; no-store', async () => {
    const res = await near({ plz: '10115', radius: 25 })
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('cache-control'), 'no-store')
    assert.deepEqual(res.data.treffer.map((card) => card.name), ['Hundeschule Kiezpfote', 'Salon Spreeglanz'])
    assert.equal(res.data.treffer[0].distanceKm, 0)
    assert.ok(res.data.treffer[1].distanceKm > 0)
    assert.deepEqual(res.data.deutschlandweit.map((card) => card.slug), [weit], 'Frankfurt steht trotz Berliner PLZ da')

    assert.equal((await near({ plz: '10115', radius: 7 })).status, 400)
    assert.equal((await near({ plz: '00000', radius: 25 })).status, 400)
    // Eine PLZ in der URL wird nicht ausgewertet.
    assert.equal((await entdecken('?plz=10115&radius=5')).data.gesamt, 5)
  })

  await t.test('Seiten: je 12, „mehr“ bis zur letzten Seite; Deutschlandweit nur auf Seite 1', async () => {
    for (let i = 0; i < 14; i += 1) insertPartner({ name: `Zz Betreuung ${String(i).padStart(2, '0')}`, typ: 'betreuung', plz: '50667' })
    const first = await entdecken('?typ=betreuung')
    assert.equal(first.data.treffer.length, 12)
    assert.deepEqual([first.data.gesamt, first.data.seiten, first.data.mehr], [15, 2, true])
    const second = await entdecken('?typ=betreuung&seite=2')
    assert.equal(second.data.treffer.length, 3)
    assert.equal(second.data.mehr, false)
    assert.deepEqual((await entdecken('?seite=2')).data.deutschlandweit, [])
  })

  await t.test('Demo-Partner nur mit ?demo=1 (Produktion)', async () => {
    assert.equal((await entdecken('?q=demo')).data.treffer.length, 0)
    assert.deepEqual((await entdecken('?q=demo&demo=1')).data.treffer.map((card) => card.slug), [demo])
  })

  await t.test('Antrag: Partner beantragt, sichtbar erst nach Freigabe; Ablehnen mit Grund; neu beantragen; Protokoll', async () => {
    const partner = await post('/api/admin/partners', { name: 'Hundeschule Antrag', slug: 'hundeschule-antrag', typ: 'hundeschule', status: 'aktiv', plz: '80331' }, adminCookie)
    assert.equal(partner.status, 201)
    const id = partner.data.id
    const area = await post(`/api/admin/partners/${id}/area`, undefined, adminCookie)
    const login = await post('/api/login', { secret: area.data.key })
    const cookie = getCookie(login.res)
    const shownDeutschlandweit = async () => (await entdecken('?typ=hundeschule')).data.deutschlandweit.some((card) => card.slug === 'hundeschule-antrag')
    const logOf = () => db.prepare('SELECT aktion, ziel FROM admin_log WHERE ziel = ? ORDER BY id').all(`partner:${id}`).map((row) => row.aktion)

    const on = await put('/api/partner-area/profile/ueberall-sichtbar', { an: true }, cookie)
    assert.equal(on.status, 200)
    assert.deepEqual([on.data.ueberallSichtbar, on.data.ueberallFreigabe, on.data.ueberallGrund], [true, '', null])
    assert.equal(await shownDeutschlandweit(), false, 'offen: noch nicht deutschlandweit')

    assert.equal((await put(`/api/admin/partners/${id}/ueberall-freigabe`, { freigeben: false }, adminCookie)).status, 400, 'Ablehnen braucht einen Grund')
    assert.equal((await put(`/api/admin/partners/${id}/ueberall-freigabe`, { freigeben: 'ja' }, adminCookie)).status, 400)
    assert.equal((await put(`/api/admin/partners/${id}/ueberall-freigabe`, { freigeben: true })).status, 401)
    assert.equal((await put(`/api/admin/partners/${id}/ueberall-freigabe`, { freigeben: true }, cookie)).status, 401)
    assert.equal((await put('/api/admin/partners/9999/ueberall-freigabe', { freigeben: true }, adminCookie)).status, 404)

    const ok = await put(`/api/admin/partners/${id}/ueberall-freigabe`, { freigeben: true }, adminCookie)
    assert.deepEqual(ok.data, { id, ueberallSichtbar: true, ueberallFreigabe: 'freigegeben', ueberallGrund: null })
    assert.equal(await shownDeutschlandweit(), true)

    const no = await put(`/api/admin/partners/${id}/ueberall-freigabe`, { freigeben: false, grund: 'Bitte erst das Profil vervollständigen.' }, adminCookie)
    assert.deepEqual(no.data, { id, ueberallSichtbar: false, ueberallFreigabe: 'abgelehnt', ueberallGrund: 'Bitte erst das Profil vervollständigen.' })
    assert.equal(await shownDeutschlandweit(), false)
    const profile = await get('/api/partner-area/profile', cookie)
    assert.deepEqual([profile.data.ueberallSichtbar, profile.data.ueberallFreigabe, profile.data.ueberallGrund], [false, 'abgelehnt', 'Bitte erst das Profil vervollständigen.'])

    const again = await put('/api/partner-area/profile/ueberall-sichtbar', { an: true }, cookie)
    assert.deepEqual([again.data.ueberallSichtbar, again.data.ueberallFreigabe, again.data.ueberallGrund], [true, '', null])
    assert.deepEqual(logOf(), ['partner-ueberall-freigegeben', 'partner-ueberall-abgelehnt'])
    // Das Protokoll hält nie den Grund fest.
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM admin_log WHERE ziel LIKE '%Profil%'").get().n, 0)
  })
})
