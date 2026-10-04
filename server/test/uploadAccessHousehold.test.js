const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { useTempDataDir, startApp, cleanup, call, createHousehold, getCookie } = require('./helpers')

// Start zeigt im eigenen Zuhause Tier- und Erinnerungsfotos aus den Familien und den befreundeten Zuhause (GET /api/start) -
// lib/uploadAccess.js canSeeUpload lässt sie einer Haushalts-Sitzung genau dann durch, wenn sie dort sichtbar wären. Nie
// private Fotos, nie mehr nach dem Verlassen bzw. Beenden, und anhängen (canAttachUpload) bleibt auf den aktiven Bereich
// beschränkt.
const dataDir = useTempDataDir('upload-household', { LOGIN_RATE_LIMIT: '200', CODE_RATE_LIMIT: '200' })

test('Fotos aus Familien und Besuchen auf Start', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const config = require('../config')
  const { canSeeUpload, canAttachUpload } = require('../lib/uploadAccess')

  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const view = async (cookie, familyId) => getCookie((await post('/api/view', { familyId }, cookie)).res)
  const photo = async (cookie, url) => (await fetch(`${base}${url}`, { headers: { Cookie: cookie } })).status
  const member = (homeId, groupId, rolle = 'mitglied') =>
    db.prepare('INSERT INTO family_members (member_family_id, group_family_id, rolle) VALUES (?, ?, ?)').run(homeId, groupId, rolle)
  const share = (dogId, familyId) => db.prepare('INSERT INTO dog_shares (dog_id, family_id) VALUES (?, ?)').run(dogId, familyId)
  const visit = (guestId, hostId) => db.prepare('INSERT INTO besuche (gast_family_id, gastgeber_family_id) VALUES (?, ?)').run(guestId, hostId)
  // Eine Datei im Upload-Ordner (ohne uploads-Zeile: sichtbar nur über Tier oder Erinnerung).
  const file = () => {
    const name = `${crypto.randomUUID()}.jpg`
    fs.writeFileSync(path.join(config.uploadDir, name), 'JPG')
    return `/uploads/${name}`
  }
  const dogWithPhoto = (familyId, name) => {
    const url = file()
    const id = db.prepare("INSERT INTO dogs (family_id, name, geschlecht, foto_url) VALUES (?, ?, 'huendin', ?)").run(familyId, name, url).lastInsertRowid
    return { id: Number(id), url }
  }
  const entryWithPhoto = (familyId, dogId, { privat = 0 } = {}) => {
    const url = file()
    db.prepare(
      "INSERT INTO timeline_entries (dog_id, family_id, autor_name, datum, titel, foto_urls, privat) VALUES (?, ?, 'Test', '2026-09-01', 'Foto', ?, ?)"
    ).run(dogId, familyId, JSON.stringify([url]), privat)
    return url
  }
  const filename = (url) => url.split('/').pop()

  // A (Zuhause Lindenhof) ist Mitglied in Familie Sonnenhang (F, gegründet von B) und zu Besuch bei D (Zuhause am Deich).
  const a = await createHousehold(base, 'Zuhause Lindenhof')
  const aId = a.data.id
  const b = await createHousehold(base, 'Zuhause Möwenweg')
  const bId = b.data.id
  const group = await post('/api/families/group', { name: 'Familie Sonnenhang', password: 'sonnenhang-passwort' }, b.cookie)
  const fId = group.data.memberships[0].id
  member(aId, fId)

  const benno = dogWithPhoto(bId, 'Benno')
  share(benno.id, fId)
  const bennoPublic = entryWithPhoto(bId, benno.id)
  const bennoPrivate = entryWithPhoto(bId, benno.id, { privat: 1 })
  const lotte = dogWithPhoto(fId, 'Lotte')
  const lottePublic = entryWithPhoto(fId, lotte.id)
  const lottePrivate = entryWithPhoto(fId, lotte.id, { privat: 1 })
  const mira = dogWithPhoto(bId, 'Mira') // nicht geteilt

  const d = await createHousehold(base, 'Zuhause am Deich')
  const dId = d.data.id
  const dorle = dogWithPhoto(dId, 'Dorle')
  const dorlePublic = entryWithPhoto(dId, dorle.id)
  const dorlePrivate = entryWithPhoto(dId, dorle.id, { privat: 1 })
  visit(aId, dId)

  // Zuhause Heidekamp (C): weder Mitglied noch zu Besuch.
  const c = await createHousehold(base, 'Zuhause Heidekamp')

  await t.test('im eigenen Zuhause: Tier- und Erinnerungsfotos der Familie und des besuchten Zuhauses', async () => {
    for (const url of [benno.url, bennoPublic, lotte.url, lottePublic, dorle.url, dorlePublic]) {
      assert.equal(await photo(a.cookie, url), 200, url)
    }
    assert.equal(canSeeUpload({ familyId: aId, homeId: aId }, filename(bennoPublic)), true)
  })

  await t.test('private Fotos nie - auch nicht die der Familie selbst oder des Gastgebers', async () => {
    for (const url of [bennoPrivate, lottePrivate, dorlePrivate, mira.url]) assert.equal(await photo(a.cookie, url), 404, url)
  })

  await t.test('Fremde ohne Mitgliedschaft oder Besuch sehen nichts davon', async () => {
    for (const url of [benno.url, bennoPublic, lotte.url, dorle.url, dorlePublic]) assert.equal(await photo(c.cookie, url), 404, url)
  })

  await t.test('anhängen bleibt auf den aktiven Bereich beschränkt', async () => {
    assert.equal(canAttachUpload({ familyId: aId, homeId: aId }, bennoPublic), false)
    assert.equal(canAttachUpload({ familyId: aId, homeId: aId }, dorle.url), false)
    const nele = await post('/api/dogs', { name: 'Nele', geschlecht: 'huendin', fotoUrl: dorle.url }, a.cookie)
    assert.equal(nele.status, 400)
  })

  await t.test('eine Besuchs-Sitzung sieht nur den Gastgeber - nicht die Familien des Gasts', async () => {
    const asGuest = await view(a.cookie, dId)
    assert.equal(await photo(asGuest, dorlePublic), 200)
    assert.equal(await photo(asGuest, bennoPublic), 404)
    assert.equal(await photo(asGuest, lotte.url), 404)
  })

  await t.test('eine Mitgliedschaft ohne gültige Rolle oder über die Demo-Grenze zählt nicht', async () => {
    db.prepare("UPDATE family_members SET rolle = 'unbekannt' WHERE member_family_id = ? AND group_family_id = ?").run(aId, fId)
    assert.equal(await photo(a.cookie, lottePublic), 404)
    db.prepare("UPDATE family_members SET rolle = 'mitglied' WHERE member_family_id = ? AND group_family_id = ?").run(aId, fId)
    assert.equal(await photo(a.cookie, lottePublic), 200)

    const demoFamily = db.prepare("INSERT INTO families (name, password_hash, art, is_demo) VALUES ('Demo-Familie', 'x', 'rudel', 1)").run()
    const demoFamilyId = Number(demoFamily.lastInsertRowid)
    member(aId, demoFamilyId)
    const demoDog = dogWithPhoto(demoFamilyId, 'Demohund')
    const demoEntry = entryWithPhoto(demoFamilyId, demoDog.id)
    assert.equal(await photo(a.cookie, demoDog.url), 404)
    assert.equal(await photo(a.cookie, demoEntry), 404)
  })

  await t.test('Familie verlassen bzw. Besuch beendet: die Fotos sind sofort weg', async () => {
    assert.equal((await call(base, `/api/memberships/${fId}`, { method: 'DELETE', cookie: a.cookie })).status, 200)
    for (const url of [benno.url, bennoPublic, lotte.url, lottePublic]) assert.equal(await photo(a.cookie, url), 404, url)
    assert.equal((await call(base, `/api/besuche/bei/${dId}`, { method: 'DELETE', cookie: a.cookie })).status, 200)
    for (const url of [dorle.url, dorlePublic]) assert.equal(await photo(a.cookie, url), 404, url)
  })
})
