const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, getCookie } = require('./helpers')

// Phase T Task 6: das Demo-Tierheim "Tierheim Sonnenhang" (seed/demo-shelter.js, lib/demoPack.js
// createDemoShelter) und seine Verknüpfung mit der Demo-Nele ("Zuhause am Deich"). Der allgemeine
// Ersetzungs-Mechanismus (Photos, Partner, Orphans) steht in demoPack.test.js - diese Datei prüft nur
// die Task-6-spezifischen Inhalte: die Tiere (seit Phase P2 Task 9 fünf, Lotte pausiert), /api/demo
// {as:'tierheim'} und die Verknüpfung mit den Schützlingen: Nele („Zuhause am Deich“) und Pepper („Zuhause
// Lindenhof“, vor gut fünf Monaten vermittelt - „So geht es euren Schützlingen“, GET /api/schuetzlinge).
// APP_ENV=staging: Demo-Partner/-Tiere sind dort ohne ?demo=1 sichtbar (wie demoPack.test.js).
const dataDir = useTempDataDir('demo-shelter', { APP_ENV: 'staging' })

test('Demo-Tierheim: fünf Tiere, Steckbriefe, /api/demo {as: "tierheim"}, Verknüpfung mit Nele', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const { uploadDir } = require('../config')
  const { replaceDemoPack } = require('../lib/demoPack')
  const { relativeDemoDate } = require('../lib/demoDates')

  const { created, household, members, shelter } = replaceDemoPack(db, uploadDir)
  const lindenhof = members.households.find((h) => h.name === 'Zuhause Lindenhof (Demo)')
  const pepperId = db.prepare('SELECT id FROM dogs WHERE family_id = ? AND name = ?').get(lindenhof.familyId, 'Pepper').id
  const shelterCookie = async () => getCookie((await call(base, '/api/demo', { method: 'POST', body: { as: 'tierheim' } })).res)

  await t.test('fünf Tiere im Demo-Tierheim, vier davon mit veröffentlichtem Steckbrief (Lotte pausiert)', () => {
    assert.equal(shelter.dogs, 5)
    const dogs = db.prepare('SELECT name, tierart, vermittlung_status, public_slug FROM dogs WHERE family_id = ? ORDER BY name').all(
      shelter.familyId
    )
    assert.deepEqual(
      dogs.map((d) => d.name),
      ['Frieda', 'Lotte', 'Momo', 'Oskar', 'Sunny']
    )
    const published = dogs.filter((d) => d.public_slug !== null)
    assert.equal(published.length, 4, 'Frieda, Sunny, Oskar und Lotte sind veröffentlicht')
    assert.deepEqual(
      published.map((d) => d.name).sort(),
      ['Frieda', 'Lotte', 'Oskar', 'Sunny']
    )
    const lotte = dogs.find((d) => d.name === 'Lotte')
    assert.equal(lotte.vermittlung_status, 'pausiert')
    const momo = dogs.find((d) => d.name === 'Momo')
    assert.equal(momo.public_slug, null, 'Momo hat keinen Steckbrief')
    assert.equal(momo.vermittlung_status, 'in_vermittlung')
    const oskar = dogs.find((d) => d.name === 'Oskar')
    assert.equal(oskar.vermittlung_status, 'reserviert')
  })

  await t.test('Friedas Chronik: vier Einträge mit den geforderten Kategorien, drei davon öffentlich', () => {
    const friedaId = db.prepare('SELECT id FROM dogs WHERE family_id = ? AND name = ?').get(shelter.familyId, 'Frieda').id
    const entries = db.prepare('SELECT kategorie, is_public FROM timeline_entries WHERE dog_id = ? ORDER BY datum').all(friedaId)
    assert.equal(entries.length, 4)
    assert.deepEqual(
      entries.map((e) => e.kategorie).sort(),
      ['ankunft', 'gassi', 'tierarzt', 'verhalten']
    )
    assert.equal(entries.filter((e) => e.is_public).length, 3)
  })

  await t.test('der öffentliche Steckbrief eines Tiers funktioniert; die Partner-Tierliste zeigt nur die vier veröffentlichten', async () => {
    const friedaSlug = db.prepare('SELECT public_slug FROM dogs WHERE family_id = ? AND name = ?').get(shelter.familyId, 'Frieda')
      .public_slug
    const view = await call(base, `/api/public/animals/${friedaSlug}`)
    assert.equal(view.status, 200)
    assert.equal(view.data.name, 'Frieda')
    assert.equal(view.data.shelter.slug, 'tierheim-sonnenhang')

    const list = await call(base, '/api/public/partners/tierheim-sonnenhang/animals')
    assert.equal(list.status, 200)
    assert.deepEqual(
      list.data.map((a) => a.name).sort(),
      ['Frieda', 'Lotte', 'Oskar', 'Sunny']
    )
    assert.equal(list.data.find((a) => a.name === 'Lotte').vermittlung_status, 'pausiert')
  })

  await t.test('Lotte (Phase P2 Task 9): pausiert - Steckbrief und Portal ja, Entdecken nein', async () => {
    const lotte = db.prepare('SELECT id, public_slug, beschreibung FROM dogs WHERE family_id = ? AND name = ?').get(shelter.familyId, 'Lotte')
    assert.match(lotte.beschreibung, /tierärztlicher Behandlung/)
    const view = await call(base, `/api/public/animals/${lotte.public_slug}`)
    assert.equal(view.status, 200)
    assert.equal(view.data.vermittlung_status, 'pausiert')
    assert.equal(view.data.entries.length, 1, 'genau ein öffentlicher Eintrag')
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM timeline_entries WHERE dog_id = ?').get(lotte.id).n, 1)

    const demoLogin = await call(base, '/api/demo', { method: 'POST' })
    const discover = await call(base, '/api/discover', { method: 'POST', body: {}, cookie: getCookie(demoLogin.res) })
    assert.equal(discover.status, 200)
    const tiere = discover.data.begleiter.tiere.map((a) => a.name)
    assert.ok(tiere.includes('Frieda'))
    assert.ok(!tiere.includes('Pepper'), 'Pepper ist längst vermittelt')
    assert.ok(!tiere.includes('Lotte'), 'pausiert erscheint nicht in Entdecken')
  })

  await t.test('POST /api/demo {as: "tierheim"} loggt ins Demo-Tierheim, mit Partner-Info', async () => {
    const login = await call(base, '/api/demo', { method: 'POST', body: { as: 'tierheim' } })
    assert.equal(login.status, 200)
    assert.equal(login.data.art, 'tierheim')
    assert.equal(login.data.isDemo, true)
    assert.equal(login.data.id, shelter.familyId)
    assert.equal(login.data.partner.slug, 'tierheim-sonnenhang')
    assert.equal(login.data.partner.name, 'Tierheim Sonnenhang')

    const shelterCookie = getCookie(login.res)
    const dogs = await call(base, '/api/dogs', { cookie: shelterCookie })
    assert.equal(dogs.status, 200)
    // Fünf eigene Tiere plus Nele und Pepper, die geteilt (dog_shares mit story_consent) unter "Vermittelt" erscheinen.
    assert.equal(dogs.data.length, 7)
    assert.equal(dogs.data.filter((d) => d.can_edit).length, 5, 'fünf davon eigene, bearbeitbare Tiere')

    // Schreibgeschützt wie jede Demo-Sitzung
    const write = await call(base, '/api/dogs', {
      method: 'POST',
      cookie: shelterCookie,
      body: { name: 'Neu', geschlecht: 'ruede', tierart: 'hund' }
    })
    assert.equal(write.status, 403)
  })

  await t.test('POST /api/demo ohne "as" bleibt beim Zuhause; { as: "rudel" } geht ins Demo-Rudel; ein ungültiger Wert -> 400', async () => {
    const defaultLogin = await call(base, '/api/demo', { method: 'POST' })
    assert.equal(defaultLogin.status, 200)
    assert.equal(defaultLogin.data.art, 'zuhause')
    assert.equal(defaultLogin.data.id, household.familyId)

    // Phase 5 Task 5 (Präsentationsmodus "Als Rudel ansehen"): 'rudel' ist ein gültiger Wert.
    const asRudel = await call(base, '/api/demo', { method: 'POST', body: { as: 'rudel' } })
    assert.equal(asRudel.status, 200)
    assert.equal(asRudel.data.art, 'rudel')
    assert.equal(asRudel.data.isDemo, true)

    const invalid = await call(base, '/api/demo', { method: 'POST', body: { as: 'admin' } })
    assert.equal(invalid.status, 400)
  })

  await t.test('Nele: zwei frühe Einträge mit herkunft_name "Tierheim Sonnenhang", dog_transfers, dog_shares mit story_consent', async () => {
    const neleId = db.prepare('SELECT id FROM dogs WHERE family_id = ? AND name = ?').get(household.familyId, 'Nele').id

    const transfer = db.prepare('SELECT from_family_id, to_family_id FROM dog_transfers WHERE dog_id = ?').get(neleId)
    assert.ok(transfer, 'dog_transfers-Eintrag vorhanden')
    assert.equal(transfer.from_family_id, shelter.familyId)
    assert.equal(transfer.to_family_id, household.familyId)

    const share = db.prepare('SELECT story_consent FROM dog_shares WHERE dog_id = ? AND family_id = ?').get(neleId, shelter.familyId)
    assert.ok(share, 'Nele ist mit dem Tierheim geteilt')
    assert.equal(share.story_consent, 1)

    // Die vorhandene Rudel-Freigabe bleibt daneben unangetastet bestehen (Keep Nele's existing shares).
    const rudelShare = db.prepare('SELECT 1 FROM dog_shares WHERE dog_id = ? AND family_id = ?').get(neleId, created.familyId)
    assert.ok(rudelShare, 'Nele bleibt zusätzlich ins Rudel geteilt')

    const householdLogin = await call(base, '/api/demo', { method: 'POST' })
    const householdCookie = getCookie(householdLogin.res)
    const entries = (await call(base, '/api/timeline', { cookie: householdCookie })).data
    const arrival = entries.find((e) => e.titel === 'Ankunft im Tierheim')
    const walk = entries.find((e) => e.titel === 'Erster Spaziergang')
    assert.ok(arrival && walk, 'beide frühen Einträge sind da')
    assert.equal(arrival.herkunft_name, 'Tierheim Sonnenhang')
    assert.equal(walk.herkunft_name, 'Tierheim Sonnenhang')
    assert.ok(arrival.datum < '2021-06-12' && walk.datum < '2021-06-12', 'beide vor dem Einzug datiert')
    // Der Einzugseintrag selbst ist frisch beim neuen Zuhause geschrieben, kein Umzugs-Eintrag.
    const moveIn = entries.find((e) => e.titel === 'Nele zieht ein – die ersten Tage')
    assert.equal(moveIn.herkunft_name, null, 'frisch beim neuen Zuhause geschrieben, kein Umzugs-Eintrag')
  })

  await t.test('das Demo-Tierheim sieht Nele und Pepper unter "Vermittelt" (geteilt, nicht mehr eigen)', async () => {
    const dogs = await call(base, '/api/dogs', { cookie: await shelterCookie() })
    const nele = dogs.data.find((d) => d.name === 'Nele')
    assert.ok(nele, 'Nele erscheint in der Tierliste des Tierheims')
    assert.equal(nele.shared_from, 'Zuhause am Deich')
    assert.equal(nele.can_edit, 0)
    const pepper = dogs.data.find((d) => d.id === pepperId)
    assert.equal(pepper.shared_from, 'Zuhause Lindenhof (Demo)')
    assert.equal(pepper.can_edit, 0)
  })

  await t.test('Pepper (Lindenhof): vor gut fünf Monaten aus dem Tierheim vermittelt - Übergabe, Einwilligung, frühe Einträge', async () => {
    const dog = db.prepare('SELECT herkunft_art, herkunft_text, bei_uns_seit FROM dogs WHERE id = ?').get(pepperId)
    assert.equal(dog.herkunft_art, 'tierheim')
    assert.equal(dog.herkunft_text, 'Tierheim Sonnenhang')
    assert.equal(dog.bei_uns_seit, relativeDemoDate({ days: -148 }))
    const transfer = db.prepare('SELECT from_family_id, to_family_id FROM dog_transfers WHERE dog_id = ? ORDER BY id DESC').get(pepperId)
    assert.deepEqual({ ...transfer }, { from_family_id: shelter.familyId, to_family_id: lindenhof.familyId })
    const share = db.prepare('SELECT story_consent FROM dog_shares WHERE dog_id = ? AND family_id = ?').get(pepperId, shelter.familyId)
    assert.equal(share.story_consent, 1)
    assert.ok(db.prepare('SELECT 1 FROM dog_shares WHERE dog_id = ? AND family_id = ?').get(pepperId, created.familyId), 'weiter in der Familie')

    const entries = db.prepare('SELECT titel, datum, privat, foto_urls, herkunft_family_id FROM timeline_entries WHERE dog_id = ?').all(pepperId)
    const early = entries.filter((e) => e.herkunft_family_id === shelter.familyId)
    assert.equal(early.length, 2, 'zwei Einträge aus der Zeit im Tierheim')
    assert.ok(early.every((e) => e.datum < dog.bei_uns_seit && !e.privat))
    const since = entries.filter((e) => e.herkunft_family_id === null)
    const open = since.filter((e) => !e.privat)
    assert.ok(open.length >= 3 && open.length <= 4, `3 bis 4 nicht-private Erinnerungen danach (${open.length})`)
    assert.ok(open.every((e) => e.datum >= dog.bei_uns_seit))
    assert.ok(open.some((e) => JSON.parse(e.foto_urls).length > 0), 'mit Foto')
    assert.equal(since.filter((e) => e.privat).length, 1, 'genau eine private')
  })

  await t.test('„So geht es euren Schützlingen“: Peppers neueste Erinnerungen und Nele - nie die private', async () => {
    const cookie = await shelterCookie()
    const res = await call(base, '/api/schuetzlinge', { cookie })
    assert.equal(res.status, 200)
    const { items } = res.data
    assert.equal(items.length, 5)
    assert.deepEqual([...new Set(items.map((item) => item.dog.name))], ['Pepper', 'Nele'], 'zuerst Pepper (neu), dann Nele')
    const privateTitles = db.prepare('SELECT titel FROM timeline_entries WHERE dog_id IN (?, ?) AND privat = 1').all(pepperId, household.dogIds.nele)
    assert.ok(privateTitles.length >= 2)
    for (const { titel } of privateTitles) assert.ok(!items.some((item) => item.titel === titel), `privat: ${titel}`)
    assert.ok(!items.some((item) => item.titel === 'Ankunft im Tierheim'), 'die eigenen frühen Einträge des Tierheims nicht')
    assert.ok(items.some((item) => item.titel === 'Nele zieht ein – die ersten Tage'))
    const greeted = items.find((item) => item.titel === 'Pepper lernt schwimmen')
    assert.equal(greeted.comment_count, 1, 'ein Gruß vom Tierheim')
    const photo = await fetch(`${base}${greeted.foto_url}`, { headers: { Cookie: cookie } })
    assert.equal(photo.status, 200, 'das Foto lädt im Tierheim')

    // Dieselbe private Erinnerung fehlt auch in Peppers Chronik, die das Tierheim liest
    const chronicle = await call(base, `/api/timeline?dogId=${pepperId}`, { cookie })
    assert.ok(chronicle.data.length > 0)
    assert.ok(chronicle.data.every((entry) => !entry.privat))
  })

  await t.test('Happy Ends: das Demo-Tierheim zeigt Neles Geschichte, ohne jede Angabe zum Zuhause', async () => {
    const happyEnds = await call(base, '/api/public/partners/tierheim-sonnenhang/happy-ends')
    assert.equal(happyEnds.status, 200)
    const nele = happyEnds.data.find((h) => h.name === 'Nele')
    assert.ok(nele, 'Nele erscheint als Happy End')
    assert.ok(happyEnds.data.some((h) => h.name === 'Pepper'), 'Pepper ebenso (story_consent)')
    assert.ok(!JSON.stringify(happyEnds.data).includes('Lindenhof'))
    assert.equal(nele.tierart, 'hund')
    assert.equal(nele.entry.titel, 'Nele zieht ein – die ersten Tage')
    const json = JSON.stringify(nele)
    assert.ok(!json.includes('Zuhause am Deich'), 'kein Hinweis auf die Halter-Familie')
    // Ein reiner Substring-Test auf die numerische Familien-Id wäre unzuverlässig (kann zufällig Teil
    // eines Datums o. Ä. sein, siehe happyEnds.test.js) - stattdessen die erwartbaren Feldnamen prüfen.
    assert.ok(!('familyId' in nele) && !('family' in nele) && !('owner' in nele) && !('ownerFamilyId' in nele) && !('homeId' in nele))
  })
})
