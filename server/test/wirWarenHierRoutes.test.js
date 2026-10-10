const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, createFamily, createHousehold, getCookie } = require('./helpers')

// „Wir waren hier“ Aufgabe 3 (docs/superpowers/plans/2026-10-10-wir-waren-hier.md): Familien-Routen unter
// /api/wir-waren-hier, Ortsansicht (lib/wwhOrtView.js), IDOR, Gast/Demo nur lesend, Ratenbegrenzung.
// Die WWH-Limits sind knapp, damit der letzte Teil die Limiter erreicht - die Teile davor bleiben darunter.
const dataDir = useTempDataDir('wwh-routes', {
  LOGIN_RATE_LIMIT: '300',
  CODE_RATE_LIMIT: '300',
  WWH_RATE_LIMIT: '60',
  WWH_HOME_RATE_LIMIT: '25',
  WWH_READ_RATE_LIMIT: '40'
})

const ENTRY = { autorName: 'Wir', datum: '2026-09-12', titel: 'Erste Stunde in der Welpengruppe', text: 'Viel geschnuppert.' }
const ORT_TIER_KEYS = ['checkinId', 'erinnerungen', 'fotoUrl', 'tierName', 'tierart']
const ORT_ERINNERUNG_KEYS = ['datum', 'titel']
const API = '/api/wir-waren-hier'

test('Wir waren hier: Familien-Routen, Ortsansicht, Ratenbegrenzung', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const pins = require('../lib/wwhPins')
  const { addVisit, endVisit } = require('../lib/visits')
  const partnerNotify = require('../lib/partnerNotify')
  const originalNotify = partnerNotify.notifyPartner
  const notified = []
  partnerNotify.notifyPartner = (partnerId, ereignis) => notified.push({ partnerId, ereignis })
  t.after(() => {
    partnerNotify.notifyPartner = originalNotify
  })

  const get = (urlPath, cookie) => call(base, urlPath, { cookie })
  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const put = (urlPath, body, cookie) => call(base, urlPath, { method: 'PUT', body, cookie })
  const del = (urlPath, cookie) => call(base, urlPath, { method: 'DELETE', cookie })

  let counter = 0
  function addPartner({ gesperrt = 0, isDemo = 0 } = {}) {
    counter += 1
    return Number(
      db
        .prepare("INSERT INTO partners (slug, name, typ, status, gesperrt, is_demo) VALUES (?, ?, 'hundeschule', 'aktiv', ?, ?)")
        .run(`wwh-route-ort-${counter}`, `Hundeschule Pfotenweg ${counter}`, gesperrt, isDemo).lastInsertRowid
    )
  }
  async function createHome(name) {
    const household = await createHousehold(base, name)
    assert.equal(household.status, 201)
    const { id } = db.prepare("SELECT id FROM families WHERE name = ? AND art = 'zuhause'").get(name)
    return { id, name, cookie: household.cookie }
  }
  async function addDog(home, name) {
    const dog = await post('/api/dogs', { name, geschlecht: 'huendin' }, home.cookie)
    assert.equal(dog.status, 201)
    return dog.data.id
  }
  async function addEntry(home, dogId, overrides = {}) {
    const entry = await post('/api/timeline', { dogId, ...ENTRY, ...overrides }, home.cookie)
    assert.equal(entry.status, 201)
    return entry.data.id
  }

  const ort = addPartner()
  const gesperrterOrt = addPartner({ gesperrt: 1 })
  const demoOrt = addPartner({ isDemo: 1 })
  const benno = await createHome('Zuhause Benno Testweg')
  const flocke = await createHome('Zuhause Flocke Testweg')
  const lotte = await createHome('Zuhause Lotte Testweg')
  const dogBenno = await addDog(benno, 'Benno')
  const dogFlocke = await addDog(flocke, 'Flocke')
  const dogLotte = await addDog(lotte, 'Lotte')
  const entryFlocke = await addEntry(flocke, dogFlocke)
  const privateFlocke = await addEntry(flocke, dogFlocke, { titel: 'Tierarzt', privat: true })
  const openEntryFlocke = await addEntry(flocke, dogFlocke, { titel: 'Noch nicht freigegeben' })

  let checkinBenno
  let checkinFlocke
  let pinFlocke

  await t.test('ohne Sitzung 401 - auch dann mit Cache-Control: no-store', async () => {
    const results = [
      await get(`${API}/checkins`),
      await get(`${API}/partner/${ort}`),
      await post(`${API}/checkins`, { partnerId: ort, dogId: dogBenno }),
      await put(`${API}/checkins/1`, { zeigeMich: true }),
      await del(`${API}/checkins/1`),
      await post(`${API}/checkins/1/erinnerungen`, { entryId: entryFlocke }),
      await del(`${API}/checkins/1/erinnerungen/1`)
    ]
    for (const res of results) {
      assert.equal(res.status, 401)
      assert.equal(res.headers.get('cache-control'), 'no-store')
    }
  })

  await t.test('nur aus dem eigenen Zuhause: ein Rudel bekommt 400', async () => {
    const rudel = await createFamily(base, 'Rudel Hoppel Testweg', 'wwh-rudel-pw-1')
    assert.equal((await get(`${API}/checkins`, rudel.cookie)).status, 400)
    assert.equal((await post(`${API}/checkins`, { partnerId: ort, dogId: dogBenno }, rudel.cookie)).status, 400)
  })

  await t.test('Anmelden: 201, Ort benachrichtigt; fremdes Tier 404, doppelt 409, Ids strikt', async () => {
    const res = await post(`${API}/checkins`, { partnerId: ort, dogId: dogBenno }, benno.cookie)
    assert.equal(res.status, 201)
    assert.equal(res.headers.get('cache-control'), 'no-store')
    assert.deepEqual(res.data, { id: res.data.id, partnerId: ort, dogId: dogBenno, status: 'offen', zeigeMich: false })
    checkinBenno = res.data.id
    assert.deepEqual(notified, [{ partnerId: ort, ereignis: partnerNotify.PARTNER_EREIGNIS.anmeldung }])

    assert.equal((await post(`${API}/checkins`, { partnerId: ort, dogId: dogFlocke }, benno.cookie)).status, 404)
    assert.equal((await post(`${API}/checkins`, { partnerId: ort, dogId: dogBenno }, benno.cookie)).status, 409)
    assert.equal((await post(`${API}/checkins`, { partnerId: ort, dogId: true }, benno.cookie)).status, 404)
    assert.equal((await post(`${API}/checkins`, { partnerId: gesperrterOrt, dogId: dogBenno }, benno.cookie)).status, 404)
    assert.equal(notified.length, 1)
  })

  await t.test('Ortsansicht: nur freigegeben UND hier gezeigt, nur erlaubte Schlüssel', async () => {
    const created = await post(`${API}/checkins`, { partnerId: ort, dogId: dogFlocke }, flocke.cookie)
    checkinFlocke = created.data.id
    pins.decideCheckin(ort, checkinFlocke, 'bestaetigt')
    // Lotte: zeigt sich, aber der Ort hat noch nicht freigegeben -> unsichtbar.
    const lotteCheckin = (await post(`${API}/checkins`, { partnerId: ort, dogId: dogLotte }, lotte.cookie)).data.id
    assert.equal((await put(`${API}/checkins/${lotteCheckin}`, { zeigeMich: true }, lotte.cookie)).status, 200)

    let view = await get(`${API}/partner/${ort}`, benno.cookie)
    assert.equal(view.status, 200)
    assert.equal(view.headers.get('cache-control'), 'no-store')
    assert.deepEqual(view.data.andere, [], 'freigegeben, aber nicht „hier zeigen“')
    assert.deepEqual(view.data.eigene.map((c) => [c.id, c.status]), [[checkinBenno, 'offen']])

    assert.equal((await put(`${API}/checkins/${checkinFlocke}`, { zeigeMich: true }, flocke.cookie)).status, 200)
    const pinned = await post(`${API}/checkins/${checkinFlocke}/erinnerungen`, { entryId: entryFlocke }, flocke.cookie)
    assert.equal(pinned.status, 201)
    pinFlocke = pinned.data.id
    pins.decidePin(ort, pinFlocke, 'bestaetigt')
    assert.equal((await post(`${API}/checkins/${checkinFlocke}/erinnerungen`, { entryId: privateFlocke }, flocke.cookie)).status, 400)
    assert.equal((await post(`${API}/checkins/${checkinFlocke}/erinnerungen`, { entryId: openEntryFlocke }, flocke.cookie)).status, 201)

    view = await get(`${API}/partner/${ort}`, benno.cookie)
    assert.deepEqual(view.data.andere, [], 'ohne eigene freigegebene Anmeldung keine fremden Tiere')
    pins.decideCheckin(ort, checkinBenno, 'bestaetigt')
    view = await get(`${API}/partner/${ort}`, benno.cookie)
    assert.equal(view.data.andere.length, 1)
    const [tier] = view.data.andere
    assert.deepEqual(Object.keys(tier).sort(), ORT_TIER_KEYS)
    assert.deepEqual(tier, { checkinId: checkinFlocke, tierName: 'Flocke', tierart: 'hund', fotoUrl: null, erinnerungen: [{ titel: ENTRY.titel, datum: ENTRY.datum }] })
    for (const erinnerung of tier.erinnerungen) assert.deepEqual(Object.keys(erinnerung).sort(), ORT_ERINNERUNG_KEYS)
    const raw = JSON.stringify(view.data.andere)
    for (const secret of [flocke.name, 'family', 'email', 'adresse', 'Tierarzt', 'Viel geschnuppert']) assert.ok(!raw.includes(secret), secret)
    assert.deepEqual(Object.keys(view.data).sort(), ['andere', 'eigene', 'ort'])

    const own = (await get(`${API}/partner/${ort}`, flocke.cookie)).data
    assert.deepEqual(own.andere, [], 'das eigene Tier steht nicht unter „andere“')
    assert.equal(own.eigene[0].erinnerungen.length, 2)
  })

  await t.test('Widerruf wirkt sofort; unbekannte, gesperrte und Demo-Orte 404', async () => {
    assert.equal((await put(`${API}/checkins/${checkinFlocke}`, { zeigeMich: false }, flocke.cookie)).status, 200)
    assert.deepEqual((await get(`${API}/partner/${ort}`, benno.cookie)).data.andere, [])
    assert.equal((await put(`${API}/checkins/${checkinFlocke}`, { zeigeMich: true }, flocke.cookie)).status, 200)
    assert.equal((await get(`${API}/partner/${ort}`, benno.cookie)).data.andere.length, 1)

    for (const id of [gesperrterOrt, demoOrt, 999999, 'abc', '0', '1.5']) {
      assert.equal((await get(`${API}/partner/${id}`, benno.cookie)).status, 404, String(id))
    }
  })

  await t.test('IDOR: fremde Anmeldungen und Anheftungen sind 404, ungültige Werte 400/404', async () => {
    assert.equal((await put(`${API}/checkins/${checkinFlocke}`, { zeigeMich: false }, benno.cookie)).status, 404)
    assert.equal((await del(`${API}/checkins/${checkinFlocke}`, benno.cookie)).status, 404)
    assert.equal((await post(`${API}/checkins/${checkinFlocke}/erinnerungen`, { entryId: entryFlocke }, benno.cookie)).status, 404)
    assert.equal((await del(`${API}/checkins/${checkinFlocke}/erinnerungen/${pinFlocke}`, benno.cookie)).status, 404)
    assert.equal((await put(`${API}/checkins/abc`, { zeigeMich: true }, benno.cookie)).status, 404)
    assert.equal((await put(`${API}/checkins/${checkinBenno}`, { zeigeMich: 'ja' }, benno.cookie)).status, 400)
    const row = db.prepare('SELECT zeige_mich FROM wwh_checkins WHERE id = ?').get(checkinFlocke)
    assert.equal(row.zeige_mich, 1, 'die fremde Anmeldung blieb unverändert')
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM wwh_pins WHERE id = ?').get(pinFlocke).c, 1)
  })

  await t.test('Gast- und Demo-Sitzungen schreiben nie (403), Demo darf lesen', async () => {
    addVisit(benno.id, flocke.id)
    const view = await post('/api/view', { familyId: flocke.id }, benno.cookie)
    assert.equal(view.status, 200)
    const guestCookie = getCookie(view.res)
    assert.equal((await post(`${API}/checkins`, { partnerId: ort, dogId: dogFlocke }, guestCookie)).status, 403)
    assert.equal((await put(`${API}/checkins/${checkinFlocke}`, { zeigeMich: false }, guestCookie)).status, 403)
    assert.equal((await get(`${API}/partner/${ort}`, guestCookie)).status, 403)
    endVisit(benno.id, flocke.id)

    const demo = await createHome('Zuhause Pepper Demo')
    db.prepare('UPDATE families SET is_demo = 1 WHERE id = ?').run(demo.id)
    assert.equal((await post(`${API}/checkins`, { partnerId: demoOrt, dogId: 1 }, demo.cookie)).status, 403)
    assert.equal((await put(`${API}/checkins/${checkinFlocke}`, { zeigeMich: false }, demo.cookie)).status, 403)
    assert.equal((await del(`${API}/checkins/${checkinFlocke}`, demo.cookie)).status, 403)
    assert.equal((await get(`${API}/checkins`, demo.cookie)).status, 200)
    assert.equal((await get(`${API}/partner/${demoOrt}`, demo.cookie)).status, 200)
    assert.equal((await get(`${API}/partner/${ort}`, demo.cookie)).status, 404, 'Demo sieht keine echten Orte')
  })

  await t.test('Anheftung lösen und Rückzug', async () => {
    assert.equal((await del(`${API}/checkins/${checkinFlocke}/erinnerungen/${pinFlocke}`, flocke.cookie)).status, 204)
    assert.equal((await del(`${API}/checkins/${checkinFlocke}/erinnerungen/${pinFlocke}`, flocke.cookie)).status, 404)
    assert.deepEqual((await get(`${API}/partner/${ort}`, benno.cookie)).data.andere[0].erinnerungen, [])

    assert.equal((await del(`${API}/checkins/${checkinBenno}`, benno.cookie)).status, 204)
    assert.deepEqual((await get(`${API}/checkins`, benno.cookie)).data, [])
    assert.equal((await del(`${API}/checkins/${checkinBenno}`, benno.cookie)).status, 404)
  })

  await t.test('Neu anmelden kurz nach Rückzug: erlaubt, aber kein zweiter Hinweis an den Ort', async () => {
    const before = notified.length
    const again = await post(`${API}/checkins`, { partnerId: ort, dogId: dogBenno }, benno.cookie)
    assert.equal(again.status, 201)
    assert.equal(notified.length, before, 'kein Hinweis innerhalb von 10 Minuten')
    assert.equal((await del(`${API}/checkins/${again.data.id}`, benno.cookie)).status, 204)
    db.prepare("UPDATE wwh_rueckzug_log SET created_at = datetime('now', '-11 minutes') WHERE family_id = ?").run(benno.id)
    assert.equal((await post(`${API}/checkins`, { partnerId: ort, dogId: dogBenno }, benno.cookie)).status, 201)
    assert.equal(notified.length, before + 1, 'nach 10 Minuten wieder ein Hinweis')
  })

  await t.test('Ratenbegrenzung: je Zuhause, dann je IP; Ortsansicht mit Lese-Limit', async () => {
    const writeUntil429 = async (home, checkinId) => {
      for (let i = 0; i < 70; i += 1) {
        const res = await put(`${API}/checkins/${checkinId}`, { zeigeMich: true }, home.cookie)
        if (res.status === 429) return res
        assert.equal(res.status, 200)
      }
      return null
    }
    const homeLimited = await writeUntil429(flocke, checkinFlocke)
    assert.ok(homeLimited, 'Zuhause-Limiter greift')
    assert.match(homeLimited.data.error, /eurem Zuhause/)
    assert.equal(homeLimited.headers.get('cache-control'), 'no-store')
    const lotteCheckin = db.prepare('SELECT id FROM wwh_checkins WHERE family_id = ?').get(lotte.id).id
    const ipLimited = await writeUntil429(lotte, lotteCheckin)
    assert.ok(ipLimited, 'IP-Limiter greift für ein anderes Zuhause erst später')
    assert.doesNotMatch(ipLimited.data.error, /eurem Zuhause/)
    assert.match(ipLimited.data.error, /Zu viele/)
    assert.equal((await get(`${API}/checkins`, flocke.cookie)).status, 200)

    let readLimited = null
    for (let i = 0; i < 50 && !readLimited; i += 1) {
      const res = await get(`${API}/partner/${ort}`, benno.cookie)
      if (res.status === 429) readLimited = res
      else assert.equal(res.status, 200)
    }
    assert.ok(readLimited, 'Lese-Limiter greift')
    assert.equal(readLimited.headers.get('cache-control'), 'no-store')
    assert.equal((await get(`${API}/partner/${ort}`, flocke.cookie)).status, 200, 'je Zuhause')
    assert.equal((await get(`${API}/checkins`, benno.cookie)).status, 200)
  })
})
