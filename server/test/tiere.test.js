const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, createHousehold, createFamily, getCookie } = require('./helpers')

// GET /api/tiere (routes/tiere.js, lib/allAnimals.js): alle Tiere aus dem eigenen Zuhause, den Familien des Haushalts und den
// befreundeten Zuhause an einem Ort - je Bereich mit dessen Regeln, jedes Tier genau einmal (der Bereich, dem es gehört).
const dataDir = useTempDataDir('tiere', { LOGIN_RATE_LIMIT: '400', CODE_RATE_LIMIT: '400' })

// Felder, die ein Tier hier haben darf - keine Freigaben, keine Eltern-Ids, keine internen Angaben.
const ANIMAL_KEYS = new Set([
  'id', 'name', 'name_unbekannt', 'rasse', 'tierart', 'geschlecht', 'geburtsdatum', 'foto_url', 'bei_uns_bis',
  'abschied_grund', 'letzte_erinnerung', 'area', 'zuhause'
])

test('Tiere: alle Tiere aus Zuhause, Familien und Besuchen - je Bereich mit dessen Regeln, jedes einmal', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')

  const get = (urlPath, cookie) => call(base, urlPath, { cookie })
  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const tiere = (cookie, query = '') => get(`/api/tiere${query}`, cookie)
  const dog = async (cookie, name, extra = {}) => (await post('/api/dogs', { name, geschlecht: 'huendin', ...extra }, cookie)).data
  const entry = async (cookie, dogId, titel, extra = {}) =>
    (await post('/api/timeline', { dogId, autorName: 'Test', datum: '2026-05-01', titel, ...extra }, cookie)).data
  const view = async (cookie, familyId) => getCookie((await post('/api/view', { familyId }, cookie)).res)
  const share = (dogId, familyId) => db.prepare('INSERT INTO dog_shares (dog_id, family_id) VALUES (?, ?)').run(dogId, familyId)
  const member = (homeId, groupId, rolle = 'mitglied') =>
    db.prepare('INSERT INTO family_members (member_family_id, group_family_id, rolle) VALUES (?, ?, ?)').run(homeId, groupId, rolle)
  const visit = (guestId, hostId) => db.prepare('INSERT INTO besuche (gast_family_id, gastgeber_family_id) VALUES (?, ?)').run(guestId, hostId)
  const endVisit = (guestId, hostId) =>
    db.prepare('DELETE FROM besuche WHERE gast_family_id = ? AND gastgeber_family_id = ?').run(guestId, hostId)
  const entryAt = (id, at) => db.prepare('UPDATE timeline_entries SET created_at = ? WHERE id = ?').run(at, id)
  const names = (res) => res.data.tiere.map((animal) => animal.name)
  const animalOf = (res, id) => res.data.tiere.find((animal) => animal.id === id)

  // Zuhause Lindenhof (A): Nele (in Familie Sonnenhang geteilt) und Flocke (nicht geteilt), Flockes Mutter ist ein Platzhalter.
  const a = await createHousehold(base, 'Zuhause Lindenhof')
  const aId = a.data.id
  const nele = await dog(a.cookie, 'Nele', { rasse: 'Mischling', geburtsdatum: '2016-04-01' })
  const platzhalter = db.prepare("INSERT INTO dogs (family_id, name, name_unbekannt, geschlecht) VALUES (?, 'Unbekannt', 1, 'huendin')").run(aId)
  const flocke = await dog(a.cookie, 'Flocke')
  db.prepare('UPDATE dogs SET mother_dog_id = ?, herkunft_text = ? WHERE id = ?').run(platzhalter.lastInsertRowid, 'Vom Bauernhof', flocke.id)
  const neleOld = await entry(a.cookie, nele.id, 'Strandtag', { datum: '2026-03-01' })
  const nelePrivate = await entry(a.cookie, nele.id, 'Tierarzt', { datum: '2026-04-01', privat: true })
  entryAt(neleOld.id, '2026-09-01 10:00:00')
  entryAt(nelePrivate.id, '2026-09-02 10:00:00')

  // Zuhause Möwenweg (B) gründet Familie Sonnenhang (F); A ist Mitglied. Lotte gehört F, Benno (B) ist in F geteilt.
  const b = await createHousehold(base, 'Zuhause Möwenweg')
  const bId = b.data.id
  const group = await post('/api/families/group', { name: 'Familie Sonnenhang', password: 'sonnenhang-passwort' }, b.cookie)
  const fId = group.data.memberships[0].id
  member(aId, fId)
  share(nele.id, fId)
  const bInF = await view(b.cookie, fId)
  const lotte = await dog(bInF, 'Lotte')
  const benno = await dog(b.cookie, 'Benno', { beschreibung: 'Liebt Möhren' })
  share(benno.id, fId)
  const bennoPublic = await entry(b.cookie, benno.id, 'Strandlauf', { datum: '2026-06-01' })
  const bennoPrivate = await entry(b.cookie, benno.id, 'Geheimnis', { datum: '2026-07-01', privat: true })
  entryAt(bennoPublic.id, '2026-09-03 10:00:00')
  entryAt(bennoPrivate.id, '2026-09-04 10:00:00')
  // Kasimir (B) ist nirgends geteilt - nur über einen Besuch bei B zu sehen.
  const kasimir = await dog(b.cookie, 'Kasimir')

  // Zuhause am Deich (D): A ist dort zu Besuch. Dorle hat nur eine private Erinnerung.
  const d = await createHousehold(base, 'Zuhause am Deich')
  const dId = d.data.id
  const dorle = await dog(d.cookie, 'Dorle')
  await entry(d.cookie, dorle.id, 'Deichgeheimnis', { privat: true })
  visit(aId, dId)
  // Verirrte Freigabe in ein Zuhause (gibt es regulär nicht): zu Besuch zählen nur die eigenen Tiere des Gastgebers.
  share(kasimir.id, dId)

  await t.test('ohne Anmeldung 401, jede Antwort no-store', async () => {
    assert.equal((await tiere()).status, 401)
    const ok = await tiere(a.cookie)
    assert.equal(ok.status, 200)
    assert.equal(ok.headers.get('cache-control'), 'no-store')
  })

  await t.test('eigene (auch nicht geteilte), Familien- und Besuchs-Tiere; Platzhalter-Eltern nicht', async () => {
    const res = await tiere(a.cookie)
    assert.deepEqual(names(res), ['Flocke', 'Nele', 'Benno', 'Lotte', 'Dorle'])
    assert.deepEqual(animalOf(res, nele.id).area, { id: aId, name: 'Zuhause Lindenhof', art: 'eigen' })
    assert.deepEqual(animalOf(res, lotte.id).area, { id: fId, name: 'Familie Sonnenhang', art: 'familie' })
    assert.deepEqual(animalOf(res, benno.id).area, { id: fId, name: 'Familie Sonnenhang', art: 'familie' })
    assert.deepEqual(animalOf(res, dorle.id).area, { id: dId, name: 'Zuhause am Deich', art: 'besuch' })
    assert.ok(!animalOf(res, kasimir.id), 'zu Besuch nur die eigenen Tiere des Gastgebers')
  })

  await t.test('zuhause: wo das Tier wohnt - das eigene Zuhause nie', async () => {
    const res = await tiere(a.cookie)
    assert.equal(animalOf(res, nele.id).zuhause, null)
    assert.equal(animalOf(res, flocke.id).zuhause, null)
    assert.equal(animalOf(res, lotte.id).zuhause, 'Familie Sonnenhang')
    assert.equal(animalOf(res, benno.id).zuhause, 'Zuhause Möwenweg')
    assert.equal(animalOf(res, dorle.id).zuhause, 'Zuhause am Deich')
  })

  await t.test('areas: alle Bereiche in fester Reihenfolge mit der Zahl ihrer Tiere', async () => {
    const res = await tiere(a.cookie)
    assert.deepEqual(res.data.areas, [
      { id: aId, name: 'Zuhause Lindenhof', art: 'eigen', anzahl: 2 },
      { id: fId, name: 'Familie Sonnenhang', art: 'familie', anzahl: 2 },
      { id: dId, name: 'Zuhause am Deich', art: 'besuch', anzahl: 1 }
    ])
  })

  await t.test('nur erlaubte Felder - keine Freigaben, Eltern-Ids oder internen Angaben', async () => {
    const res = await tiere(a.cookie)
    for (const animal of res.data.tiere) {
      for (const key of Object.keys(animal)) assert.ok(ANIMAL_KEYS.has(key), `${animal.name}: ${key}`)
      assert.deepEqual(Object.keys(animal.area).sort(), ['art', 'id', 'name'])
    }
    assert.deepEqual(Object.keys(res.data).sort(), ['areas', 'tiere'])
    assert.equal(animalOf(res, nele.id).rasse, 'Mischling')
    assert.equal(animalOf(res, nele.id).geburtsdatum, '2016-04-01')
    assert.equal(animalOf(res, nele.id).name_unbekannt, false)
    assert.ok(!JSON.stringify(res.data).includes('Möhren'))
    assert.ok(!JSON.stringify(res.data).includes('Bauernhof'))
  })

  await t.test('private Erinnerungen verstecken kein Tier - zählen aber nur im eigenen Zuhause', async () => {
    const res = await tiere(a.cookie)
    assert.equal(animalOf(res, nele.id).letzte_erinnerung, '2026-04-01', 'eigene private zählt')
    assert.equal(animalOf(res, benno.id).letzte_erinnerung, '2026-06-01', 'fremde private nie')
    assert.equal(animalOf(res, dorle.id).letzte_erinnerung, null, 'nur private: Tier da, kein Datum')
    assert.equal(animalOf(res, lotte.id).letzte_erinnerung, null)
    assert.ok(!JSON.stringify(res.data).includes('2026-07-01'))
  })

  await t.test('Familien-Tiere nur als Mitglied; Mitgliedschaft ohne gültige Rolle zählt nicht', async () => {
    const e = await createHousehold(base, 'Zuhause Elbblick')
    const forE = await tiere(e.cookie)
    assert.deepEqual(forE.data.tiere, [])
    assert.deepEqual(forE.data.areas, [{ id: e.data.id, name: 'Zuhause Elbblick', art: 'eigen', anzahl: 0 }])
    db.prepare("UPDATE family_members SET rolle = 'unbekannt' WHERE member_family_id = ? AND group_family_id = ?").run(aId, fId)
    try {
      const res = await tiere(a.cookie)
      assert.ok(!res.data.tiere.some((animal) => animal.area.id === fId))
      assert.ok(!res.data.areas.some((area) => area.id === fId))
    } finally {
      db.prepare("UPDATE family_members SET rolle = 'mitglied' WHERE member_family_id = ? AND group_family_id = ?").run(aId, fId)
    }
  })

  await t.test('gehört das Tier einem Bereich der Ansicht, gewinnt der - sonst Zuhause > Familien (nach Namen) > Besuche', async () => {
    // Familie Heidekamp (G): A und B Mitglied, Benno auch dorthin geteilt - Heidekamp kommt vor Sonnenhang.
    const g = db.prepare("INSERT INTO families (name, password_hash, art) VALUES ('Familie Heidekamp', 'x', 'rudel')").run()
    const gId = Number(g.lastInsertRowid)
    member(aId, gId)
    member(bId, gId)
    share(benno.id, gId)
    try {
      const inTwo = await tiere(a.cookie)
      assert.equal(inTwo.data.tiere.filter((animal) => animal.id === benno.id).length, 1)
      assert.deepEqual(animalOf(inTwo, benno.id).area, { id: gId, name: 'Familie Heidekamp', art: 'familie' })
      // Besucht A auch B, gehört Benno dorthin - als Besuch, obwohl die Familien in der Reihenfolge vorn stehen.
      visit(aId, bId)
      const withVisit = await tiere(a.cookie)
      assert.equal(withVisit.data.tiere.filter((animal) => animal.id === benno.id).length, 1)
      assert.deepEqual(animalOf(withVisit, benno.id).area, { id: bId, name: 'Zuhause Möwenweg', art: 'besuch' })
      assert.deepEqual(animalOf(withVisit, kasimir.id).area, { id: bId, name: 'Zuhause Möwenweg', art: 'besuch' })
      assert.equal(animalOf(withVisit, benno.id).letzte_erinnerung, '2026-06-01', 'mit den Gast-Regeln, nie privat')
      // Nele gehört A - in Sonnenhang geteilt, bleibt sie "Mein Zuhause" und zählt nur dort.
      assert.deepEqual(animalOf(withVisit, nele.id).area.art, 'eigen')
      const counts = Object.fromEntries(withVisit.data.areas.map((area) => [area.id, area.anzahl]))
      assert.deepEqual(counts, { [aId]: 2, [gId]: 0, [fId]: 1, [dId]: 1, [bId]: 2 })
      const total = withVisit.data.areas.reduce((sum, area) => sum + area.anzahl, 0)
      assert.equal(total, withVisit.data.tiere.length)
    } finally {
      endVisit(aId, bId)
      db.prepare('DELETE FROM dog_shares WHERE family_id = ?').run(gId)
      db.prepare('DELETE FROM family_members WHERE group_family_id = ?').run(gId)
      db.prepare('DELETE FROM families WHERE id = ?').run(gId)
    }
  })

  await t.test('unbekannte Angaben -> 400, kein Bereichs-Parameter', async () => {
    for (const query of ['?x=1', `?familyId=${fId}`, `?in=${fId}`, `?bereich=${fId}`, '?gruppe=eigen']) {
      const res = await tiere(a.cookie, query)
      assert.equal(res.status, 400, query)
      assert.equal(res.headers.get('cache-control'), 'no-store')
    }
  })

  await t.test('in einer Familie 400, zu Besuch 403, Tierheim und Partner 404', async () => {
    const aInF = await view(a.cookie, fId)
    assert.equal((await tiere(aInF)).status, 400)
    const asGuest = await view(a.cookie, dId)
    assert.equal((await tiere(asGuest)).status, 403)
    assert.equal((await get('/api/tiere/', asGuest)).status, 403)
    assert.equal((await get('/api/TIERE', asGuest)).status, 403)
    const shelter = await createFamily(base, 'Tierheim Nordlicht', 'nordlicht-passwort', { art: 'tierheim' })
    assert.equal((await tiere(shelter.cookie)).status, 404)
    const partner = await createFamily(base, 'Hundeschule Pfotenglück', 'pfotenglueck-passwort', { art: 'partner' })
    assert.equal((await tiere(partner.cookie)).status, 404)
  })

  await t.test('klassischer Familien-Login: nur die Familie selbst', async () => {
    const login = await post('/api/login', { password: 'sonnenhang-passwort' })
    const res = await tiere(getCookie(login.res))
    assert.equal(res.status, 200)
    assert.deepEqual(names(res), ['Benno', 'Lotte', 'Nele'])
    assert.ok(res.data.tiere.every((animal) => animal.area.id === fId && animal.area.art === 'eigen'))
    assert.equal(res.data.tiere.find((animal) => animal.name === 'Lotte').zuhause, null)
    assert.equal(res.data.tiere.find((animal) => animal.name === 'Nele').zuhause, 'Zuhause Lindenhof')
  })

  await t.test('Demo und echte Daten mischen sich nie - auch nicht über eine verirrte Mitgliedschaft oder Freigabe', async () => {
    const x = await createHousehold(base, 'Zuhause Demohof')
    const xId = x.data.id
    const demohund = await dog(x.cookie, 'Demohund')
    db.prepare('UPDATE families SET is_demo = 1 WHERE id = ?').run(xId)
    member(xId, fId)
    visit(xId, dId)
    visit(aId, xId)
    share(demohund.id, fId)
    const demoFamily = db.prepare("INSERT INTO families (name, password_hash, art, is_demo) VALUES ('Demo-Familie', 'x', 'rudel', 1)").run()
    const demoFamilyId = Number(demoFamily.lastInsertRowid)
    member(aId, demoFamilyId)
    db.prepare("INSERT INTO dogs (family_id, name, geschlecht) VALUES (?, 'Demofamilienhund', 'ruede')").run(demoFamilyId)

    const forX = await tiere(x.cookie)
    assert.equal(forX.status, 200, 'die Demo liest')
    assert.deepEqual(names(forX), ['Demohund'])
    assert.deepEqual(forX.data.areas.map((area) => area.id), [xId])
    const forA = await tiere(a.cookie)
    assert.ok(!names(forA).includes('Demohund'), 'auch nicht über die Freigabe in Sonnenhang')
    assert.ok(!names(forA).includes('Demofamilienhund'))
    assert.ok(!forA.data.areas.some((area) => area.id === demoFamilyId || area.id === xId))
  })

  await t.test('Besuch beendet bzw. Familie verlassen: sofort weg', async () => {
    assert.equal((await call(base, `/api/besuche/bei/${dId}`, { method: 'DELETE', cookie: a.cookie })).status, 200)
    assert.ok(!names(await tiere(a.cookie)).includes('Dorle'))
    assert.equal((await call(base, `/api/memberships/${fId}`, { method: 'DELETE', cookie: a.cookie })).status, 200)
    const res = await tiere(a.cookie)
    assert.deepEqual(names(res), ['Flocke', 'Nele'])
    assert.deepEqual(res.data.areas.map((area) => area.art), ['eigen'])
  })
})
