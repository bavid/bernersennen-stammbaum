const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, getCookie } = require('./helpers')

// Phase T Task 6: das Demo-Tierheim "Tierheim Sonnenhang" (seed/demo-shelter.js, lib/demoPack.js
// createDemoShelter) und seine Verknüpfung mit der Demo-Nele ("Zuhause am Deich"). Der allgemeine
// Ersetzungs-Mechanismus (Photos, Partner, Orphans) steht in demoPack.test.js - diese Datei prüft nur
// die Task-6-spezifischen Inhalte: die vier Tiere, /api/demo {as:'tierheim'} und die Nele-Verknüpfung.
// APP_ENV=staging: Demo-Partner/-Tiere sind dort ohne ?demo=1 sichtbar (wie demoPack.test.js).
const dataDir = useTempDataDir('demo-shelter', { APP_ENV: 'staging' })

test('Demo-Tierheim: vier Tiere, Steckbriefe, /api/demo {as: "tierheim"}, Verknüpfung mit Nele', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const { uploadDir } = require('../config')
  const { replaceDemoPack } = require('../lib/demoPack')

  const { created, household, shelter } = replaceDemoPack(db, uploadDir)

  await t.test('vier Tiere im Demo-Tierheim, drei davon mit veröffentlichtem Steckbrief', () => {
    assert.equal(shelter.dogs, 4)
    const dogs = db.prepare('SELECT name, tierart, vermittlung_status, public_slug FROM dogs WHERE family_id = ? ORDER BY name').all(
      shelter.familyId
    )
    assert.deepEqual(
      dogs.map((d) => d.name),
      ['Momo', 'Oskar', 'Pepper', 'Sunny']
    )
    const published = dogs.filter((d) => d.public_slug !== null)
    assert.equal(published.length, 3, 'Pepper, Sunny und Oskar sind veröffentlicht')
    assert.deepEqual(
      published.map((d) => d.name).sort(),
      ['Oskar', 'Pepper', 'Sunny']
    )
    const momo = dogs.find((d) => d.name === 'Momo')
    assert.equal(momo.public_slug, null, 'Momo hat keinen Steckbrief')
    assert.equal(momo.vermittlung_status, 'in_vermittlung')
    const oskar = dogs.find((d) => d.name === 'Oskar')
    assert.equal(oskar.vermittlung_status, 'reserviert')
  })

  await t.test('Peppers Chronik: vier Einträge mit den geforderten Kategorien, drei davon öffentlich', () => {
    const pepperId = db.prepare('SELECT id FROM dogs WHERE family_id = ? AND name = ?').get(shelter.familyId, 'Pepper').id
    const entries = db.prepare('SELECT kategorie, is_public FROM timeline_entries WHERE dog_id = ? ORDER BY datum').all(pepperId)
    assert.equal(entries.length, 4)
    assert.deepEqual(
      entries.map((e) => e.kategorie).sort(),
      ['ankunft', 'gassi', 'tierarzt', 'verhalten']
    )
    assert.equal(entries.filter((e) => e.is_public).length, 3)
  })

  await t.test('der öffentliche Steckbrief eines Tiers funktioniert; die Partner-Tierliste zeigt nur die drei veröffentlichten', async () => {
    const pepperSlug = db.prepare('SELECT public_slug FROM dogs WHERE family_id = ? AND name = ?').get(shelter.familyId, 'Pepper')
      .public_slug
    const view = await call(base, `/api/public/animals/${pepperSlug}`)
    assert.equal(view.status, 200)
    assert.equal(view.data.name, 'Pepper')
    assert.equal(view.data.shelter.slug, 'tierheim-sonnenhang')

    const list = await call(base, '/api/public/partners/tierheim-sonnenhang/animals')
    assert.equal(list.status, 200)
    assert.deepEqual(
      list.data.map((a) => a.name).sort(),
      ['Oskar', 'Pepper', 'Sunny']
    )
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
    // Vier eigene Tiere plus Nele, die geteilt (dog_shares mit story_consent) unter "Ehemalige" erscheint.
    assert.equal(dogs.data.length, 5)
    assert.equal(dogs.data.filter((d) => d.can_edit).length, 4, 'vier davon eigene, bearbeitbare Tiere')

    // Schreibgeschützt wie jede Demo-Sitzung
    const write = await call(base, '/api/dogs', {
      method: 'POST',
      cookie: shelterCookie,
      body: { name: 'Neu', geschlecht: 'ruede', tierart: 'hund' }
    })
    assert.equal(write.status, 403)
  })

  await t.test('POST /api/demo ohne "as" bleibt beim Zuhause; ein ungültiger Wert -> 400', async () => {
    const defaultLogin = await call(base, '/api/demo', { method: 'POST' })
    assert.equal(defaultLogin.status, 200)
    assert.equal(defaultLogin.data.art, 'zuhause')
    assert.equal(defaultLogin.data.id, household.familyId)

    const invalid = await call(base, '/api/demo', { method: 'POST', body: { as: 'rudel' } })
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

  await t.test('das Demo-Tierheim sieht Nele unter "Ehemalige" (geteilt, nicht mehr eigen)', async () => {
    const shelterLogin = await call(base, '/api/demo', { method: 'POST', body: { as: 'tierheim' } })
    const shelterCookie = getCookie(shelterLogin.res)
    const dogs = await call(base, '/api/dogs', { cookie: shelterCookie })
    const nele = dogs.data.find((d) => d.name === 'Nele')
    assert.ok(nele, 'Nele erscheint in der Tierliste des Tierheims')
    assert.equal(nele.shared_from, 'Zuhause am Deich')
    assert.equal(nele.can_edit, 0)
  })

  await t.test('Happy Ends: das Demo-Tierheim zeigt Neles Geschichte, ohne jede Angabe zum Zuhause', async () => {
    const happyEnds = await call(base, '/api/public/partners/tierheim-sonnenhang/happy-ends')
    assert.equal(happyEnds.status, 200)
    const nele = happyEnds.data.find((h) => h.name === 'Nele')
    assert.ok(nele, 'Nele erscheint als Happy End')
    assert.equal(nele.tierart, 'hund')
    assert.equal(nele.entry.titel, 'Nele zieht ein – die ersten Tage')
    const json = JSON.stringify(nele)
    assert.ok(!json.includes('Zuhause am Deich'), 'kein Hinweis auf die Halter-Familie')
    // Ein reiner Substring-Test auf die numerische Familien-Id wäre unzuverlässig (kann zufällig Teil
    // eines Datums o. Ä. sein, siehe happyEnds.test.js) - stattdessen die erwartbaren Feldnamen prüfen.
    assert.ok(!('familyId' in nele) && !('family' in nele) && !('owner' in nele) && !('ownerFamilyId' in nele) && !('homeId' in nele))
  })
})
