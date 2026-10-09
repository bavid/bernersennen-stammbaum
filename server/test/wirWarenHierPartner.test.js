const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, createHousehold, getCookie } = require('./helpers')

// „Wir waren hier“ Aufgabe 2 (docs/superpowers/plans/2026-10-10-wir-waren-hier.md): Freigabe durch den Partner
// (/api/partner-area/wir-waren-hier, lib/wwhPins.js) und angeheftete Erinnerungen. Die Familien-Seite läuft hier noch
// direkt über die Bibliothek (die Familien-Routen kommen in Aufgabe 3), die Chronik-Hooks über die echten
// /api/timeline-Routen. t.test() bleibt auf einer Ebene.
const ADMIN_TEST_PASSWORD = 'admin-test-wir-waren-hier-partner-1'
const dataDir = useTempDataDir('wwh-partner', { LOGIN_RATE_LIMIT: '300', CODE_RATE_LIMIT: '300' })

const ENTRY_DEFAULTS = { autorName: 'Wir', datum: '2026-09-12', titel: 'Erste Stunde in der Welpengruppe', text: 'Viel geschnuppert.' }
const PARTNER_PIN_KEYS = ['checkinId', 'createdAt', 'datum', 'id', 'status', 'text', 'tierName', 'titel']
const PARTNER_CHECKIN_KEYS = ['createdAt', 'fotoUrl', 'id', 'status', 'tierName', 'tierart']

test('Wir waren hier: Freigabe durch den Partner und angeheftete Erinnerungen', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const wwh = require('../lib/wirWarenHier')
  const pins = require('../lib/wwhPins')
  const partnerNotify = require('../lib/partnerNotify')

  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const put = (urlPath, body, cookie) => call(base, urlPath, { method: 'PUT', body, cookie })
  const del = (urlPath, cookie) => call(base, urlPath, { method: 'DELETE', cookie })
  const rejectsWith = (fn, status) => assert.throws(fn, (err) => err.status === status)

  const adminLogin = await post('/api/admin/login', { username: 'admin', password: ADMIN_TEST_PASSWORD })
  const adminCookie = getCookie(adminLogin.res)

  let counter = 0
  async function createPartner() {
    counter += 1
    const input = { name: `Ort ${counter}`, slug: `wwh-ort-${counter}`, typ: 'hundeschule', plz: '10115', portalText: 'Kleine Gruppen.', status: 'aktiv' }
    const partner = await post('/api/admin/partners', input, adminCookie)
    assert.equal(partner.status, 201)
    const area = await post(`/api/admin/partners/${partner.data.id}/area`, undefined, adminCookie)
    assert.equal(area.status, 201)
    const login = await post('/api/login', { secret: area.data.key })
    return { id: partner.data.id, cookie: getCookie(login.res) }
  }
  async function createHome(name) {
    const household = await createHousehold(base, name)
    assert.equal(household.status, 201)
    const { id } = db.prepare("SELECT id FROM families WHERE name = ? AND art = 'zuhause'").get(name)
    return { id, cookie: household.cookie }
  }
  async function addDog(home, name) {
    const dog = await post('/api/dogs', { name, geschlecht: 'huendin' }, home.cookie)
    assert.equal(dog.status, 201)
    return dog.data.id
  }
  async function addEntry(home, dogId, overrides = {}) {
    const entry = await post('/api/timeline', { dogId, ...ENTRY_DEFAULTS, ...overrides }, home.cookie)
    assert.equal(entry.status, 201)
    return entry.data.id
  }
  const editEntry = (home, entryId, overrides = {}) => put(`/api/timeline/${entryId}`, { ...ENTRY_DEFAULTS, ...overrides }, home.cookie)

  const area = (partner, urlPath = '') => `/api/partner-area/wir-waren-hier${urlPath}`
  async function overview(partner) {
    const res = await call(base, area(partner), { cookie: partner.cookie })
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('cache-control'), 'no-store')
    return res.data
  }
  const decide = (partner, kind, id, action) => post(area(partner, `/${kind}/${id}/${action}`), undefined, partner.cookie)
  const pinRow = (id) => db.prepare('SELECT status FROM wwh_pins WHERE id = ?').get(id)

  // Eine bestätigte Anmeldung mit einer angehefteten, freigegebenen Erinnerung.
  async function confirmedPin(home, partner, dogName) {
    const dogId = await addDog(home, dogName)
    const entryId = await addEntry(home, dogId)
    const checkin = wwh.createCheckin(home.id, { partnerId: partner.id, dogId })
    assert.equal((await decide(partner, 'checkins', checkin.id, 'freigeben')).status, 200)
    const pin = pins.pinEntry(home.id, checkin.id, entryId)
    assert.equal((await decide(partner, 'erinnerungen', pin.id, 'freigeben')).status, 200)
    return { dogId, entryId, checkinId: checkin.id, pinId: pin.id }
  }

  const ort = await createPartner()
  const fremderOrt = await createPartner()
  const home = await createHome('Zuhause Lindenweg')
  const otherHome = await createHome('Zuhause Birkenhof')

  await t.test('neue Anmeldung: Hinweis an den Ort über notifyPartner, Text ohne Namen', () => {
    const calls = []
    const original = partnerNotify.notifyPartner
    partnerNotify.notifyPartner = (...args) => calls.push(args)
    try {
      const dogId = db.prepare("INSERT INTO dogs (family_id, name, geschlecht) VALUES (?, 'Kiki', 'huendin')").run(home.id).lastInsertRowid
      const created = pins.checkInAndNotify(home.id, { partnerId: ort.id, dogId: Number(dogId) })
      assert.equal(created.status, 'offen')
      assert.deepEqual(calls, [[ort.id, 'anmeldung']])
      rejectsWith(() => pins.checkInAndNotify(home.id, { partnerId: ort.id, dogId: Number(dogId) }), 409)
      assert.equal(calls.length, 1, 'keine Anmeldung, kein Hinweis')
    } finally {
      partnerNotify.notifyPartner = original
    }
    const text = partnerNotify.buildPartnerText('anmeldung')
    assert.match(text, /Neue Anmeldung bei „Wir waren hier“/)
    assert.ok(!text.includes('Lindenweg') && !text.includes('Kiki'))
  })

  await t.test('Anheften: nur bestätigte Anmeldung, nur eigener, nicht privater Eintrag des angemeldeten Tiers', async () => {
    const dogId = await addDog(home, 'Wilma')
    const secondDog = await addDog(home, 'Pepper')
    const entryId = await addEntry(home, dogId)
    const privateEntry = await addEntry(home, dogId, { privat: true })
    const brunoEntry = await addEntry(home, secondDog)
    const foreignEntry = await addEntry(otherHome, await addDog(otherHome, 'Lotte'))
    const checkin = wwh.createCheckin(home.id, { partnerId: ort.id, dogId })

    rejectsWith(() => pins.pinEntry(home.id, checkin.id, entryId), 409)
    assert.equal((await decide(ort, 'checkins', checkin.id, 'freigeben')).status, 200)
    rejectsWith(() => pins.pinEntry(home.id, checkin.id, foreignEntry), 404)
    rejectsWith(() => pins.pinEntry(home.id, checkin.id, brunoEntry), 404)
    rejectsWith(() => pins.pinEntry(home.id, checkin.id, 999999), 404)
    rejectsWith(() => pins.pinEntry(home.id, checkin.id, String(entryId)), 404)
    rejectsWith(() => pins.pinEntry(otherHome.id, checkin.id, entryId), 404)
    rejectsWith(() => pins.pinEntry(home.id, checkin.id, privateEntry), 400)

    const pin = pins.pinEntry(home.id, checkin.id, entryId)
    assert.equal(pin.status, 'offen')
    rejectsWith(() => pins.pinEntry(home.id, checkin.id, entryId), 409)
    assert.deepEqual(pins.pinsOfCheckin(home.id, checkin.id).map((p) => p.id), [pin.id])
    assert.deepEqual(pins.pinsOfCheckin(otherHome.id, checkin.id), [])
    rejectsWith(() => pins.unpinEntry(otherHome.id, checkin.id, pin.id), 404)
    pins.unpinEntry(home.id, checkin.id, pin.id)
    assert.equal(pinRow(pin.id), undefined)
  })

  await t.test('Partner sieht und entscheidet nur Einträge des eigenen Ortes, fremder Ort 404', async () => {
    const { checkinId, pinId } = await confirmedPin(home, ort, 'Mia')
    const own = await overview(ort)
    const anmeldung = own.anmeldungen.find((row) => row.id === checkinId)
    assert.deepEqual(Object.keys(anmeldung).sort(), PARTNER_CHECKIN_KEYS)
    const erinnerung = own.erinnerungen.find((row) => row.id === pinId)
    assert.deepEqual(Object.keys(erinnerung).sort(), PARTNER_PIN_KEYS)
    assert.ok(!JSON.stringify(own).includes('Lindenweg'), 'kein Name des Zuhauses')

    const foreign = await overview(fremderOrt)
    assert.deepEqual(foreign, { anmeldungen: [], erinnerungen: [] })
    for (const action of ['freigeben', 'ablehnen']) {
      assert.equal((await decide(fremderOrt, 'checkins', checkinId, action)).status, 404)
      assert.equal((await decide(fremderOrt, 'erinnerungen', pinId, action)).status, 404)
    }
    assert.equal((await del(area(fremderOrt, `/checkins/${checkinId}`), fremderOrt.cookie)).status, 404)
    assert.equal((await decide(ort, 'checkins', 'abc', 'freigeben')).status, 404)
    assert.equal(pinRow(pinId).status, 'bestaetigt')
    assert.equal((await call(base, area(ort), { cookie: home.cookie })).status, 403, 'Zuhause-Sitzung ist kein Partner-Bereich')
  })

  await t.test('Demo-Partner-Sitzung liest, schreibt aber nie', async () => {
    const demoOrt = await createPartner()
    const dogId = await addDog(home, 'Fips')
    const checkin = wwh.createCheckin(home.id, { partnerId: demoOrt.id, dogId })
    db.prepare('UPDATE families SET is_demo = 1 WHERE partner_id = ?').run(demoOrt.id)
    assert.equal((await overview(demoOrt)).anmeldungen.length, 1)
    assert.equal((await decide(demoOrt, 'checkins', checkin.id, 'freigeben')).status, 403)
    assert.equal((await decide(demoOrt, 'erinnerungen', 1, 'ablehnen')).status, 403)
    assert.equal((await del(area(demoOrt, `/checkins/${checkin.id}`), demoOrt.cookie)).status, 403)
    assert.equal(db.prepare('SELECT status FROM wwh_checkins WHERE id = ?').get(checkin.id).status, 'offen')
  })

  await t.test('Eintrag wird privat oder gelöscht: Anheftung verschwindet aus jeder Ausgabe', async () => {
    const viaRoute = await confirmedPin(home, ort, 'Lotte')
    assert.equal((await editEntry(home, viaRoute.entryId, { privat: true })).status, 200)
    assert.equal(pinRow(viaRoute.pinId), undefined, 'clearPins beim Speichern')
    assert.ok(!(await overview(ort)).erinnerungen.some((row) => row.id === viaRoute.pinId))

    const deleted = await confirmedPin(home, ort, 'Odin')
    assert.equal((await del(`/api/timeline/${deleted.entryId}`, home.cookie)).status, 204)
    assert.equal(pinRow(deleted.pinId), undefined, 'CASCADE')

    // Ohne Hook (z. B. künftige Schreibwege): die Sichtprüfung bei jeder Ausgabe blendet trotzdem aus.
    const raw = await confirmedPin(home, ort, 'Pepe')
    db.prepare('UPDATE timeline_entries SET privat = 1 WHERE id = ?').run(raw.entryId)
    assert.ok(!(await overview(ort)).erinnerungen.some((row) => row.id === raw.pinId))
    assert.deepEqual(pins.pinsOfCheckin(home.id, raw.checkinId), [])
    assert.equal((await decide(ort, 'erinnerungen', raw.pinId, 'ablehnen')).status, 404)
  })

  await t.test('Ablehnen blendet überall aus (Anheftung und Anmeldung)', async () => {
    const pinned = await confirmedPin(home, ort, 'Quinn')
    assert.equal((await decide(ort, 'erinnerungen', pinned.pinId, 'ablehnen')).status, 200)
    assert.ok(!(await overview(ort)).erinnerungen.some((row) => row.id === pinned.pinId))
    assert.deepEqual(pins.pinsOfCheckin(home.id, pinned.checkinId), [])
    assert.equal((await decide(ort, 'erinnerungen', pinned.pinId, 'freigeben')).status, 404)
    rejectsWith(() => pins.pinEntry(home.id, pinned.checkinId, pinned.entryId), 409)

    const second = await confirmedPin(home, ort, 'Rosi')
    assert.equal((await decide(ort, 'checkins', second.checkinId, 'ablehnen')).status, 200)
    const after = await overview(ort)
    assert.ok(!after.anmeldungen.some((row) => row.id === second.checkinId))
    assert.ok(!after.erinnerungen.some((row) => row.id === second.pinId))
    assert.equal((await decide(ort, 'checkins', second.checkinId, 'freigeben')).status, 404)
  })

  await t.test('Änderung am Inhalt setzt die Anheftung zurück auf offen, gleicher Inhalt nicht', async () => {
    const pinned = await confirmedPin(home, ort, 'Sammy')
    assert.equal((await editEntry(home, pinned.entryId)).status, 200)
    assert.equal(pinRow(pinned.pinId).status, 'bestaetigt')
    assert.equal((await editEntry(home, pinned.entryId, { text: 'Heute ganz anders.' })).status, 200)
    assert.equal(pinRow(pinned.pinId).status, 'offen')
    assert.equal((await overview(ort)).erinnerungen.find((row) => row.id === pinned.pinId).status, 'offen')
    assert.equal(pins.pinsOfCheckin(home.id, pinned.checkinId)[0].status, 'offen')
  })

  await t.test('Partner entfernt eine Anmeldung nachträglich: Anheftungen fallen mit', async () => {
    const pinned = await confirmedPin(home, ort, 'Tara')
    assert.equal((await del(area(ort, `/checkins/${pinned.checkinId}`), ort.cookie)).status, 204)
    assert.equal(pinRow(pinned.pinId), undefined)
    assert.equal((await del(area(ort, `/checkins/${pinned.checkinId}`), ort.cookie)).status, 404)
  })
})
