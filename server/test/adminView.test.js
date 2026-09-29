const fs = require('node:fs')
const test = require('node:test')
const assert = require('node:assert/strict')
const jwt = require('jsonwebtoken')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, createFamily, createHousehold, getCookie } = require('./helpers')

// Phase 5 Task 5b (docs/superpowers/plans/2026-09-29-phase-5-admin-praesentation.md): der Admin öffnet jeden
// Bereich nur lesend (POST /api/admin/view/:familyId), jede Schreib-Anfrage der Sitzung wird abgelehnt, jeder
// Aufruf landet im Protokoll (admin_log, GET /api/admin/log). t.test() bleibt auf einer Ebene.
const ADMIN_TEST_PASSWORD = 'admin-test-admin-view-1'
const dataDir = useTempDataDir('admin-view', { LOGIN_RATE_LIMIT: '300', CODE_RATE_LIMIT: '300' })

const READ_ONLY_MESSAGE = 'Admin-Ansicht – nur lesen'
const ADMIN_VIEW_HOURS = 12

async function uploadPng(base, cookie) {
  const form = new FormData()
  form.append('file', new Blob(['PNG'], { type: 'image/png' }), 'a.png')
  const res = await fetch(`${base}/api/uploads`, { method: 'POST', headers: { Cookie: cookie }, body: form })
  const text = await res.text()
  return { status: res.status, data: text ? JSON.parse(text) : null }
}

function uploadCount(uploadDir) {
  if (!fs.existsSync(uploadDir)) return 0
  return fs.readdirSync(uploadDir).filter((name) => name !== '.gitkeep').length
}

test('Admin-Ansicht: jeden Bereich nur lesend öffnen, Protokoll', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const config = require('../config')

  const adminLogin = await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: ADMIN_TEST_PASSWORD } })
  const adminCookie = getCookie(adminLogin.res)
  const get = (urlPath, cookie) => call(base, urlPath, { cookie })
  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const put = (urlPath, body, cookie) => call(base, urlPath, { method: 'PUT', body, cookie })
  const view = (familyId, cookie = adminCookie) => post(`/api/admin/view/${familyId}`, undefined, cookie)

  // Ein Zuhause, das Mitglied in einer Familie ist, eine zweite (fremde) Familie, ein Tierheim- und ein
  // Partner-Bereich - alle vier Bereichsarten, dazu eine Demo-Familie.
  const household = await createHousehold(base, 'Zuhause Birkenweg')
  assert.equal(household.status, 201)
  const householdId = household.data.id
  const rudel = await createFamily(base, 'Familie Talblick', 'talblick-passwort')
  const rudelId = rudel.data.id
  const joined = await post('/api/families/join', { password: 'talblick-passwort' }, household.cookie)
  assert.equal(joined.status, 200)
  const stranger = await createFamily(base, 'Familie Uferweg', 'uferweg-passwort')
  const strangerId = stranger.data.id
  const demo = await createFamily(base, 'Familie Demo-Wiese', 'demo-wiese-passwort')
  db.prepare('UPDATE families SET is_demo = 1 WHERE id = ?').run(demo.data.id)

  async function createPartnerArea(input) {
    const partner = await post('/api/admin/partners', input, adminCookie)
    assert.equal(partner.status, 201)
    const area = await post(`/api/admin/partners/${partner.data.id}/area`, undefined, adminCookie)
    assert.equal(area.status, 201)
    return { partner: partner.data, familyId: area.data.familyId }
  }
  const shelter = await createPartnerArea({ name: 'Tierheim Sonnenhang', slug: 'tierheim-sonnenhang', typ: 'tierheim', plz: '10115', status: 'aktiv' })
  const school = await createPartnerArea({ name: 'Hundeschule Wiesengrund', slug: 'hundeschule-wiesengrund', typ: 'hundeschule', status: 'entwurf' })

  // Ein Tier im Zuhause, damit es dort etwas zu lesen gibt.
  const dog = await post('/api/dogs', { name: 'Wilma', geschlecht: 'huendin', rasse: 'Mischling' }, household.cookie)
  assert.equal(dog.status, 201)

  let homeViewCookie
  let rudelViewCookie
  let shelterViewCookie
  let schoolViewCookie

  await t.test('nur der Admin darf einen Bereich öffnen (401), unbekannte Bereiche gibt es nicht (404)', async () => {
    assert.equal((await view(householdId, household.cookie)).status, 401)
    // null statt undefined: undefined würde den Standardwert (Admin-Cookie) ziehen.
    assert.equal((await view(householdId, null)).status, 401)
    assert.equal((await view(999999)).status, 404)
    assert.equal((await view('abc')).status, 404)
  })

  await t.test('Zuhause: Sitzungs-Cookie für den Bereich, me.adminView, lesen geht', async () => {
    const res = await view(householdId)
    assert.equal(res.status, 200)
    assert.equal(res.data.id, householdId)
    assert.equal(res.data.art, 'zuhause')
    assert.equal(res.data.adminView, true)
    assert.equal(res.data.isDemo, false)
    assert.equal(res.data.role, 'leitung')
    homeViewCookie = getCookie(res.res)
    assert.ok(homeViewCookie.startsWith(`${config.sessionCookie}=`), `expected ${config.sessionCookie}=..., got ${homeViewCookie}`)

    // Das Token trägt die Markierung und lebt nur so lange wie eine Admin-Sitzung (nicht 30 Tage).
    const payload = jwt.decode(homeViewCookie.split('=')[1])
    assert.equal(payload.adminView, true)
    assert.equal(payload.familyId, householdId)
    assert.equal(payload.activeFamilyId, householdId)
    assert.equal(payload.exp - payload.iat, ADMIN_VIEW_HOURS * 60 * 60)

    const me = await get('/api/me', homeViewCookie)
    assert.equal(me.status, 200)
    assert.equal(me.data.adminView, true)
    assert.equal(me.data.id, householdId)
    assert.equal(me.data.memberships.length, 1)

    const dogs = await get('/api/dogs', homeViewCookie)
    assert.equal(dogs.status, 200)
    assert.deepEqual(dogs.data.map((d) => d.name), ['Wilma'])

    // Nur lesen heißt auch: GET /vouchers/mine füllt das Einladungs-Kontingent des Bereichs hier NICHT auf
    // (routes/vouchers.js ensureVoucherQuota) - das tut erst der Bereich selbst wieder.
    const vouchersBefore = db.prepare('SELECT COUNT(*) AS c FROM vouchers').get().c
    assert.equal((await get('/api/vouchers/mine', homeViewCookie)).status, 200)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM vouchers').get().c, vouchersBefore)
  })

  await t.test('eine normale Sitzung trägt kein adminView', async () => {
    const me = await get('/api/me', household.cookie)
    assert.equal(me.status, 200)
    assert.equal('adminView' in me.data, false)
  })

  await t.test('Familie (rudel): art und Rolle', async () => {
    const res = await view(rudelId)
    assert.equal(res.status, 200)
    assert.equal(res.data.art, 'rudel')
    assert.equal(res.data.adminView, true)
    assert.equal(res.data.role, 'leitung')
    rudelViewCookie = getCookie(res.res)
    assert.equal((await get('/api/family/members', rudelViewCookie)).status, 200)
  })

  await t.test('Tierheim-Bereich: partner ist gesetzt, Partner-Bereich-Routen lesen', async () => {
    const res = await view(shelter.familyId)
    assert.equal(res.status, 200)
    assert.equal(res.data.art, 'tierheim')
    assert.equal(res.data.adminView, true)
    assert.equal(res.data.partner.slug, 'tierheim-sonnenhang')
    assert.equal(res.data.partner.typ, 'tierheim')
    shelterViewCookie = getCookie(res.res)
    assert.equal((await get('/api/partner-area/profile', shelterViewCookie)).status, 200)
  })

  await t.test('Partner-Bereich: partner ist gesetzt', async () => {
    const res = await view(school.familyId)
    assert.equal(res.status, 200)
    assert.equal(res.data.art, 'partner')
    assert.equal(res.data.adminView, true)
    assert.equal(res.data.partner.slug, 'hundeschule-wiesengrund')
    schoolViewCookie = getCookie(res.res)
    assert.equal((await get('/api/partner-area/profile', schoolViewCookie)).status, 200)
  })

  await t.test('Demo-Familie: is_demo bleibt sichtbar, die Admin-Sperre greift zuerst', async () => {
    const res = await view(demo.data.id)
    assert.equal(res.status, 200)
    assert.equal(res.data.isDemo, true)
    assert.equal(res.data.adminView, true)
    const write = await post('/api/dogs', { name: 'X', geschlecht: 'ruede' }, getCookie(res.res))
    assert.equal(write.status, 403)
    assert.equal(write.data.error, READ_ONLY_MESSAGE)
  })

  await t.test('Schreibsperre: Stichproben über alle Router liefern 403 „Admin-Ansicht – nur lesen“', async () => {
    const attempts = [
      post('/api/dogs', { name: 'Benno', geschlecht: 'ruede' }, homeViewCookie),
      post('/api/timeline', { dogId: dog.data.id, autorName: 'A', datum: '2026-06-01', titel: 'See' }, homeViewCookie),
      post('/api/notes', { autorName: 'A', text: 'Zettel' }, homeViewCookie),
      put(`/api/dogs/${dog.data.id}`, { name: 'Benno' }, homeViewCookie),
      call(base, `/api/dogs/${dog.data.id}`, { method: 'DELETE', cookie: homeViewCookie }),
      put('/api/family', { name: 'Neuer Name' }, homeViewCookie),
      post('/api/family/key', {}, homeViewCookie),
      post('/api/users', { username: 'wilma', password: 'geheim123' }, homeViewCookie),
      call(base, `/api/memberships/${rudelId}`, { method: 'DELETE', cookie: homeViewCookie }),
      put('/api/vouchers/1/rolle', { rolle: 'gast' }, rudelViewCookie),
      put(`/api/family/members/${householdId}`, { rolle: 'gast' }, rudelViewCookie),
      post('/api/breeding', {}, homeViewCookie),
      post('/api/messages', { type: 'feedback', autorName: 'A', text: 'Hallo' }, homeViewCookie),
      put('/api/partner-area/profile', { portalTitel: 'Neu' }, schoolViewCookie),
      post('/api/partner-area/profile/publish', {}, schoolViewCookie),
      post('/api/partner-area/posts', {}, schoolViewCookie),
      call(base, '/api/partner-area/messages/1', { method: 'DELETE', cookie: shelterViewCookie }),
      call(base, '/api/admin-messages/1', { method: 'PATCH', body: {}, cookie: homeViewCookie })
    ]
    const results = await Promise.all(attempts)
    results.forEach((res, index) => {
      assert.equal(res.status, 403, `attempt #${index} returned ${res.status}: ${JSON.stringify(res.data)}`)
      assert.equal(res.data.error, READ_ONLY_MESSAGE, `attempt #${index}`)
    })
    // Nichts ist passiert.
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM dogs').get().c, 1)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM notes').get().c, 0)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM timeline_entries').get().c, 0)
  })

  await t.test('Upload: abgelehnt, bevor eine Datei auf der Platte landet', async () => {
    const before = uploadCount(config.uploadDir)
    const res = await uploadPng(base, homeViewCookie)
    assert.equal(res.status, 403)
    assert.equal(res.data.error, READ_ONLY_MESSAGE)
    assert.equal(uploadCount(config.uploadDir), before)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM uploads').get().c, 0)
  })

  await t.test('lesende POSTs bleiben erlaubt: /discover, /places/search, /partner-area/preview/discover, /public/partners/near, /vouchers/check', async () => {
    const discover = await post('/api/discover', {}, homeViewCookie)
    assert.equal(discover.status, 200)
    assert.ok(discover.data.hundeschulen)

    // Ohne Umkreis eine 400 - entscheidend ist, dass die Sperre (403) nicht greift.
    const places = await post('/api/places/search', {}, homeViewCookie)
    assert.equal(places.status, 400)

    const preview = await post('/api/partner-area/preview/discover', {}, schoolViewCookie)
    assert.equal(preview.status, 200)

    const near = await post('/api/public/partners/near', { plz: '10115', radius: 25 }, homeViewCookie)
    assert.notEqual(near.status, 403)

    const check = await post('/api/vouchers/check', { code: 'AAAA-AAAA-AAAA' }, homeViewCookie)
    assert.equal(check.status, 200)
    assert.equal(check.data.status, 'unbekannt')
  })

  await t.test('/api/view: in die Familie des Zuhauses wechseln geht (adminView bleibt), fremde Bereiche nicht', async () => {
    const same = await post('/api/view', { familyId: householdId }, homeViewCookie)
    assert.equal(same.status, 200)
    assert.equal(same.data.adminView, true)

    const toRudel = await post('/api/view', { familyId: rudelId }, homeViewCookie)
    assert.equal(toRudel.status, 200)
    assert.equal(toRudel.data.id, rudelId)
    assert.equal(toRudel.data.adminView, true)
    assert.equal(toRudel.data.role, 'mitglied')
    const switched = getCookie(toRudel.res)
    const me = await get('/api/me', switched)
    assert.equal(me.data.id, rudelId)
    assert.equal(me.data.home.id, householdId)
    assert.equal(me.data.adminView, true)
    // Schreiben bleibt auch nach dem Wechsel gesperrt.
    const write = await post('/api/notes', { autorName: 'A', text: 'Zettel' }, switched)
    assert.equal(write.status, 403)
    assert.equal(write.data.error, READ_ONLY_MESSAGE)

    assert.equal((await post('/api/view', { familyId: strangerId }, homeViewCookie)).status, 404)
    assert.equal((await post('/api/view', { familyId: rudelId }, schoolViewCookie)).status, 404)
  })

  await t.test('Logout beendet die Admin-Ansicht wie jede Sitzung', async () => {
    const res = await post('/api/logout', undefined, homeViewCookie)
    assert.equal(res.status, 204)
    const setCookie = res.headers.get('set-cookie') || ''
    assert.ok(setCookie.startsWith(`${config.sessionCookie}=`), setCookie)
    assert.match(setCookie, /Expires=Thu, 01 Jan 1970/i)
  })

  await t.test('Protokoll: je Aufruf ein Eintrag (Bereich + Zeitpunkt, keine Inhalte), neueste zuerst, nur Admin', async () => {
    assert.equal((await get('/api/admin/log', homeViewCookie)).status, 401)
    assert.equal((await get('/api/admin/log')).status, 401)

    const res = await get('/api/admin/log', adminCookie)
    assert.equal(res.status, 200)
    assert.ok(Array.isArray(res.data))
    // Zuhause, Rudel, Tierheim, Partner, Demo - die vier fehlgeschlagenen Aufrufe (401/404) stehen nicht drin.
    assert.equal(res.data.length, 5)
    assert.deepEqual(
      res.data.map((entry) => entry.ziel),
      [demo.data.id, school.familyId, shelter.familyId, rudelId, householdId].map((id) => `family:${id}`)
    )
    for (const entry of res.data) {
      assert.deepEqual(Object.keys(entry).sort(), ['aktion', 'created_at', 'id', 'ziel'])
      assert.equal(entry.aktion, 'view')
      assert.match(entry.created_at, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    }
    const text = JSON.stringify(res.data)
    for (const name of ['Birkenweg', 'Talblick', 'Sonnenhang', 'Wiesengrund', 'Wilma']) assert.equal(text.includes(name), false)

    assert.equal((await get('/api/admin/log?limit=2', adminCookie)).data.length, 2)
    assert.equal((await get('/api/admin/log?limit=abc', adminCookie)).data.length, 5)
    assert.equal((await get('/api/admin/log?limit=0', adminCookie)).data.length, 5)
    assert.equal((await get('/api/admin/log?limit=99999', adminCookie)).status, 200)
  })
})
