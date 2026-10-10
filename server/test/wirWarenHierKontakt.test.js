const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, createHousehold, getCookie } = require('./helpers')

// „Wir waren hier“ Aufgabe 4 (docs/superpowers/plans/2026-10-10-wir-waren-hier.md): Kontaktwunsch über den Ort
// (lib/wwhKontakt.js, Routen /api/wir-waren-hier/kontakt...). Zusage = normaler Besuch (lib/visits.js), Widerruf =
// bestehender Besuchs-Abbruch. Obergrenzen, Wartezeit nach Ablehnung, IDOR, Demo, keine Familiennamen in Antworten.
const dataDir = useTempDataDir('wwh-kontakt', { LOGIN_RATE_LIMIT: '300', CODE_RATE_LIMIT: '300', WWH_RATE_LIMIT: '300', WWH_HOME_RATE_LIMIT: '300' })

const API = '/api/wir-waren-hier'
const KONTAKT_KEYS = ['createdAt', 'eigenesTierName', 'fotoUrl', 'id', 'ortName', 'tierName', 'tierart']
const ENTRY = { autorName: 'Wir', datum: '2026-09-12', titel: 'Am Bach', text: 'Viel geplanscht.' }

test('Wir waren hier: Kontaktwunsch und Besuch bei Zusage', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const { createCheckin, setZeigeMich } = require('../lib/wirWarenHier')
  const pins = require('../lib/wwhPins')
  const kontakt = require('../lib/wwhKontakt')
  const { addVisit, isVisiting } = require('../lib/visits')

  const get = (urlPath, cookie) => call(base, urlPath, { cookie })
  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const del = (urlPath, cookie) => call(base, urlPath, { method: 'DELETE', cookie })
  const send = (home, checkinId, eigenesDogId) => post(`${API}/kontakt`, { checkinId, eigenesDogId }, home.cookie)
  const wishRow = (id) => db.prepare('SELECT status, entschieden_at FROM wwh_kontakt WHERE id = ?').get(id)
  const visitCount = (guest, host) =>
    db.prepare('SELECT COUNT(*) AS c FROM besuche WHERE gast_family_id = ? AND gastgeber_family_id = ?').get(guest.id, host.id).c

  let counter = 0
  function addPartner(isDemo = 0) {
    counter += 1
    return Number(
      db
        .prepare("INSERT INTO partners (slug, name, typ, status, gesperrt, is_demo) VALUES (?, ?, 'hundeschule', 'aktiv', 0, ?)")
        .run(`wwh-kontakt-ort-${counter}`, `Hundeschule Bachweg ${counter}`, isDemo).lastInsertRowid
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
  function checkIn(home, dogId, partnerId, { bestaetigt = true, zeige = true } = {}) {
    const { id } = createCheckin(home.id, { partnerId, dogId })
    if (bestaetigt) pins.decideCheckin(partnerId, id, 'bestaetigt')
    if (zeige) setZeigeMich(home.id, id, true)
    return id
  }

  const ort = addPartner()
  const andererOrt = addPartner()
  const demoOrt = addPartner(1)
  const benno = await createHome('Zuhause Benno Bachweg')
  const flocke = await createHome('Zuhause Flocke Bachweg')
  const lotte = await createHome('Zuhause Lotte Bachweg')
  const wilma = await createHome('Zuhause Wilma Bachweg')
  const pepper = await createHome('Zuhause Pepper Bachweg')
  const dogBenno = await addDog(benno, 'Benno')
  const dogFlocke = await addDog(flocke, 'Flocke')
  const dogLotte = await addDog(lotte, 'Lotte')
  const dogWilma = await addDog(wilma, 'Wilma')
  const dogPepper = await addDog(pepper, 'Pepper')
  const entryFlocke = (await post('/api/timeline', { dogId: dogFlocke, ...ENTRY }, flocke.cookie)).data.id

  const checkinFlocke = checkIn(flocke, dogFlocke, ort, { zeige: false })
  let wishBenno
  let wishLotte

  await t.test('ohne Sitzung 401 mit no-store; Demo-Sitzung schreibt nicht (403)', async () => {
    const results = [
      await get(`${API}/kontakt/offen`),
      await post(`${API}/kontakt`, { checkinId: 1, eigenesDogId: 1 }),
      await post(`${API}/kontakt/1/annehmen`, {}),
      await post(`${API}/kontakt/1/ablehnen`, {}),
      await del(`${API}/kontakt/1`)
    ]
    for (const res of results) {
      assert.equal(res.status, 401)
      assert.equal(res.headers.get('cache-control'), 'no-store')
    }
    const demo = await createHome('Zuhause Hoppel Demo')
    db.prepare('UPDATE families SET is_demo = 1 WHERE id = ?').run(demo.id)
    assert.equal((await send(demo, checkinFlocke, 1)).status, 403)
    assert.equal((await get(`${API}/kontakt/offen`, demo.cookie)).status, 200)
  })

  await t.test('Regeln: Ziel freigegeben + hier gezeigt, eigenes Tier am selben Ort freigegeben, nicht an sich selbst', async () => {
    const checkinBenno = checkIn(benno, dogBenno, ort, { bestaetigt: false, zeige: false })
    assert.equal((await send(benno, checkinFlocke, dogBenno)).status, 404, 'Ziel zeigt sich nicht')
    setZeigeMich(flocke.id, checkinFlocke, true)
    assert.equal((await send(benno, checkinFlocke, dogBenno)).status, 400, 'eigene Anmeldung noch offen')
    pins.decideCheckin(ort, checkinBenno, 'bestaetigt')
    assert.equal((await send(benno, checkinFlocke, dogLotte)).status, 404, 'fremdes Tier')
    assert.equal((await send(benno, checkinFlocke, 'abc')).status, 404)
    assert.equal((await send(benno, 'x', dogBenno)).status, 404)
    assert.equal((await send(benno, 999999, dogBenno)).status, 404)

    setZeigeMich(benno.id, checkinBenno, true)
    assert.equal((await send(benno, checkinBenno, dogBenno)).status, 400, 'nicht an das eigene Zuhause')

    const lotteWoanders = checkIn(lotte, dogLotte, andererOrt)
    assert.equal((await send(benno, lotteWoanders, dogBenno)).status, 400, 'anderer Ort')

    const res = await send(benno, checkinFlocke, dogBenno)
    assert.equal(res.status, 201)
    assert.equal(res.headers.get('cache-control'), 'no-store')
    assert.deepEqual(res.data, { id: res.data.id, status: 'offen' })
    wishBenno = res.data.id
    assert.equal((await send(benno, checkinFlocke, dogBenno)).status, 409, 'doppelt')
  })

  await t.test('Demo und Echt werden nie verbunden', () => {
    const demoHome = db.prepare("SELECT id FROM families WHERE name = 'Zuhause Hoppel Demo'").get()
    const demoDog = Number(db.prepare("INSERT INTO dogs (family_id, name, geschlecht) VALUES (?, 'Hoppel', 'ruede')").run(demoHome.id).lastInsertRowid)
    db.prepare("INSERT INTO wwh_checkins (partner_id, family_id, dog_id, status, zeige_mich, is_demo) VALUES (?, ?, ?, 'bestaetigt', 1, 1)").run(
      demoOrt,
      demoHome.id,
      demoDog
    )
    assert.throws(() => kontakt.sendWish(demoHome.id, { checkinId: checkinFlocke, eigenesDogId: demoDog }), { status: 404 })
  })

  await t.test('Liste: nur Tiername/Tierart/Foto/Ort - keine Familiennamen', async () => {
    const incoming = await get(`${API}/kontakt/offen`, flocke.cookie)
    assert.equal(incoming.status, 200)
    assert.equal(incoming.headers.get('cache-control'), 'no-store')
    assert.equal(incoming.data.an.length, 1)
    assert.deepEqual(Object.keys(incoming.data.an[0]).sort(), KONTAKT_KEYS)
    assert.equal(incoming.data.an[0].tierName, 'Benno')
    assert.equal(incoming.data.an[0].eigenesTierName, 'Flocke')
    assert.equal(incoming.data.an[0].ortName, 'Hundeschule Bachweg 1')
    const outgoing = (await get(`${API}/kontakt/offen`, benno.cookie)).data
    assert.deepEqual(outgoing.an, [])
    assert.equal(outgoing.von[0].tierName, 'Flocke')
    const raw = JSON.stringify([incoming.data, outgoing])
    for (const secret of [benno.name, flocke.name, 'family', 'email']) assert.ok(!raw.includes(secret), secret)
  })

  await t.test('IDOR: nur das Ziel entscheidet, nur die Absenderin zieht zurück - sonst 404', async () => {
    for (const cookie of [lotte.cookie, benno.cookie]) {
      assert.equal((await post(`${API}/kontakt/${wishBenno}/annehmen`, {}, cookie)).status, 404)
      assert.equal((await post(`${API}/kontakt/${wishBenno}/ablehnen`, {}, cookie)).status, 404)
    }
    assert.equal((await del(`${API}/kontakt/${wishBenno}`, lotte.cookie)).status, 404)
    assert.equal((await del(`${API}/kontakt/${wishBenno}`, flocke.cookie)).status, 404)
    assert.equal((await post(`${API}/kontakt/abc/annehmen`, {}, flocke.cookie)).status, 404)
    assert.equal(wishRow(wishBenno).status, 'offen')
  })

  await t.test('Zusage: ein bestätigter Besuch, idempotent; Anfragende sieht nicht private Erinnerungen', async () => {
    const res = await post(`${API}/kontakt/${wishBenno}/annehmen`, {}, flocke.cookie)
    assert.equal(res.status, 200)
    assert.deepEqual(res.data, { id: wishBenno, status: 'angenommen' })
    assert.ok(isVisiting(benno.id, flocke.id))
    assert.equal(isVisiting(flocke.id, benno.id), false, 'nur in eine Richtung')
    const visit = db.prepare('SELECT bestaetigt_at FROM besuche WHERE gast_family_id = ? AND gastgeber_family_id = ?').get(benno.id, flocke.id)
    assert.ok(visit.bestaetigt_at, 'gilt als bestätigt')
    assert.equal((await post(`${API}/kontakt/${wishBenno}/annehmen`, {}, flocke.cookie)).status, 200)
    assert.equal(visitCount(benno, flocke), 1)
    assert.equal((await post(`${API}/kontakt/${wishBenno}/ablehnen`, {}, flocke.cookie)).status, 404)
    assert.equal((await del(`${API}/kontakt/${wishBenno}`, benno.cookie)).status, 404, 'nichts mehr offen')

    const view = await post('/api/view', { familyId: flocke.id }, benno.cookie)
    assert.equal(view.status, 200)
    const guestCookie = getCookie(view.res)
    const timeline = await get(`/api/timeline?dogId=${dogFlocke}`, guestCookie)
    assert.deepEqual(timeline.data.map((entry) => entry.id), [entryFlocke])

    assert.equal((await del(`/api/besuche/gaeste/${benno.id}`, flocke.cookie)).status, 204)
    const after = await get(`/api/timeline?dogId=${dogFlocke}`, guestCookie)
    assert.ok(after.status !== 200 || !after.data.some((entry) => entry.id === entryFlocke), 'Widerruf wirkt sofort')
    assert.equal((await post('/api/view', { familyId: flocke.id }, benno.cookie)).status, 404)
    assert.equal((await send(benno, checkinFlocke, dogBenno)).status, 409, 'kein sofortiges Neu-Bitten')
  })

  await t.test('Absage: 30 Tage Wartezeit, danach erneut möglich', async () => {
    checkIn(lotte, dogLotte, ort)
    const first = await send(lotte, checkinFlocke, dogLotte)
    assert.equal(first.status, 201)
    const res = await post(`${API}/kontakt/${first.data.id}/ablehnen`, {}, flocke.cookie)
    assert.deepEqual(res.data, { id: first.data.id, status: 'abgelehnt' })
    assert.equal((await post(`${API}/kontakt/${first.data.id}/ablehnen`, {}, flocke.cookie)).status, 200, 'idempotent')
    assert.equal((await post(`${API}/kontakt/${first.data.id}/annehmen`, {}, flocke.cookie)).status, 404)
    assert.equal((await send(lotte, checkinFlocke, dogLotte)).status, 409)
    db.prepare("UPDATE wwh_kontakt SET entschieden_at = datetime('now', '-31 days') WHERE id = ?").run(first.data.id)
    const again = await send(lotte, checkinFlocke, dogLotte)
    assert.equal(again.status, 201)
    wishLotte = again.data.id
    assert.deepEqual(wishRow(wishLotte), { status: 'offen', entschieden_at: null })
  })

  await t.test('„Hier zeigen“ aus lehnt offene Wünsche ab', async () => {
    setZeigeMich(flocke.id, checkinFlocke, false)
    assert.equal(wishRow(wishLotte).status, 'abgelehnt')
    assert.deepEqual((await get(`${API}/kontakt/offen`, flocke.cookie)).data.an, [])
    setZeigeMich(flocke.id, checkinFlocke, true)
  })

  await t.test('Zurückziehen; Tagesgrenze zählt auch Zurückgezogenes (429)', async () => {
    const checkinBenno = db.prepare('SELECT id FROM wwh_checkins WHERE dog_id = ?').get(dogBenno).id
    const wish = await send(lotte, checkinBenno, dogLotte)
    assert.equal(wish.status, 201)
    assert.equal((await del(`${API}/kontakt/${wish.data.id}`, lotte.cookie)).status, 204)
    assert.equal((await del(`${API}/kontakt/${wish.data.id}`, lotte.cookie)).status, 404)
    assert.equal(wishRow(wish.data.id), undefined)
    const limited = await send(lotte, checkinBenno, dogLotte)
    assert.equal(limited.status, 429)
    assert.match(limited.data.error, /morgen/)
  })

  await t.test('Obergrenzen: 5 offene je Zuhause, 10 offene je Ziel-Zuhause', async () => {
    checkIn(wilma, dogWilma, ort)
    const fillers = []
    for (let i = 0; i < 10; i += 1) fillers.push(Number(db.prepare("INSERT INTO dogs (family_id, name, geschlecht) VALUES (?, ?, 'ruede')").run(pepper.id, `Pepper ${i}`).lastInsertRowid))
    const insertWish = db.prepare('INSERT INTO wwh_kontakt (partner_id, von_family_id, von_dog_id, an_family_id, an_dog_id) VALUES (?, ?, ?, ?, ?)')
    for (const dogId of fillers.slice(0, 5)) insertWish.run(ort, wilma.id, dogWilma, pepper.id, dogId)
    const tooMany = await send(wilma, checkinFlocke, dogWilma)
    assert.equal(tooMany.status, 409)
    assert.match(tooMany.data.error, /5 offene/)
    db.prepare('DELETE FROM wwh_kontakt WHERE von_family_id = ?').run(wilma.id)

    for (const dogId of fillers) insertWish.run(ort, pepper.id, dogId, flocke.id, dogFlocke)
    assert.equal((await send(wilma, checkinFlocke, dogWilma)).status, 409, 'Ziel-Zuhause voll')
    db.prepare('DELETE FROM wwh_kontakt WHERE von_family_id = ?').run(pepper.id)
    assert.equal((await send(wilma, checkinFlocke, dogWilma)).status, 201)
  })

  await t.test('Zusage prüft den Besuch erneut: kein Doppelbesuch', async () => {
    checkIn(pepper, dogPepper, ort)
    const wish = await send(pepper, checkinFlocke, dogPepper)
    assert.equal(wish.status, 201)
    addVisit(pepper.id, flocke.id)
    assert.equal((await send(pepper, checkinFlocke, dogPepper)).status, 409)
    assert.equal((await post(`${API}/kontakt/${wish.data.id}/annehmen`, {}, flocke.cookie)).status, 200)
    assert.equal(visitCount(pepper, flocke), 1)
    assert.equal(wishRow(wish.data.id).status, 'angenommen')
  })

  await t.test('Zusage prüft den Ort erneut: gesperrter Ort oder zurückgenommene Freigabe -> 409, kein Besuch', async () => {
    const neuerOrt = addPartner()
    const checkinPepper = checkIn(pepper, dogPepper, neuerOrt)
    const checkinWilma = checkIn(wilma, dogWilma, neuerOrt)
    const wish = await send(wilma, checkinPepper, dogWilma)
    assert.equal(wish.status, 201)

    db.prepare('UPDATE partners SET gesperrt = 1 WHERE id = ?').run(neuerOrt)
    const blocked = await post(`${API}/kontakt/${wish.data.id}/annehmen`, {}, pepper.cookie)
    assert.equal(blocked.status, 409)
    assert.equal(visitCount(wilma, pepper), 0)
    assert.equal(wishRow(wish.data.id).status, 'offen')

    db.prepare('UPDATE partners SET gesperrt = 0 WHERE id = ?').run(neuerOrt)
    db.prepare("UPDATE wwh_checkins SET status = 'offen' WHERE id = ?").run(checkinWilma)
    assert.equal((await post(`${API}/kontakt/${wish.data.id}/annehmen`, {}, pepper.cookie)).status, 409, 'Anfragende nicht mehr freigegeben')
    assert.equal(visitCount(wilma, pepper), 0)

    pins.decideCheckin(neuerOrt, checkinWilma, 'bestaetigt')
    assert.equal((await post(`${API}/kontakt/${wish.data.id}/annehmen`, {}, pepper.cookie)).status, 200)
    assert.equal(visitCount(wilma, pepper), 1)
  })
})
