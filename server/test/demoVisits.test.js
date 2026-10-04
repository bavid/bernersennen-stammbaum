const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { useTempDataDir, startApp, cleanup, call, getCookie } = require('./helpers')

const dataDir = useTempDataDir('demo-visits', { APP_ENV: 'staging' })

test('Demo (Phase V2): Besuch Deich <-> Möwenweg, „Erlebt mit“, Fotos bei Balu, Einladungsliste', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const { uploadDir } = require('../config')
  const { replaceDemoPack } = require('../lib/demoPack')

  const get = (urlPath, cookie) => call(base, urlPath, { cookie })
  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })

  replaceDemoPack(db, uploadDir)
  const uploadsAfterFirst = fs.readdirSync(uploadDir).length
  const { household, visits } = replaceDemoPack(db, uploadDir)
  const login = await post('/api/demo')
  const demoCookie = getCookie(login.res)
  const dogs = (await get('/api/dogs', demoCookie)).data
  const dogId = (name) => dogs.find((dog) => dog.name === name).id

  await t.test('ein zweites Ersetzen hinterlässt keine Waisen (Besuche, Markierungen, Fotos)', () => {
    assert.equal(fs.readdirSync(uploadDir).length, uploadsAfterFirst)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM besuche').get().n, 2)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM erlebt_mit').get().n, 3)
  })

  await t.test('„Zuhause am Deich“ besucht den Möwenweg und hat ihn als Gast', async () => {
    assert.equal(login.data.id, household.familyId)
    // security-review V2 (M-3): der Möwenweg ist am Deich noch „Neu zu Besuch“
    assert.equal(login.data.neueGaeste, 1)
    assert.deepEqual(login.data.besuche.map(({ id, name }) => ({ id, name })), [{ id: visits.hostId, name: 'Zuhause Möwenweg (Demo)' }])
    const lists = (await get('/api/besuche', demoCookie)).data
    assert.deepEqual(lists.besuche.map((b) => b.name), ['Zuhause Möwenweg (Demo)'])
    assert.deepEqual(lists.gaeste.map((g) => g.name), ['Zuhause Möwenweg (Demo)'])
  })

  await t.test('zu Besuch: Wilmas Chronik ansehen, nichts ändern (Demo und Besuch)', async () => {
    const view = await post('/api/view', { familyId: visits.hostId }, demoCookie)
    assert.equal(view.data.zuBesuch, true)
    const guestCookie = getCookie(view.res)
    const hostDogs = (await get('/api/dogs', guestCookie)).data
    assert.deepEqual(hostDogs.map((dog) => dog.name), ['Wilma'])
    const timeline = (await get(`/api/timeline?dogId=${hostDogs[0].id}`, guestCookie)).data
    assert.ok(timeline.some((entry) => entry.titel === 'Schneerunde mit Nele' && entry.foto_urls.length === 1))
    const photo = timeline.find((entry) => entry.titel === 'Schneerunde mit Nele').foto_urls[0]
    assert.equal((await fetch(`${base}${photo}`, { headers: { Cookie: guestCookie } })).status, 200)
    assert.equal((await post(`/api/timeline/${timeline[0].id}/comments`, { autorName: 'X', text: 'Hallo' }, guestCookie)).status, 403)
  })

  await t.test('„Erlebt mit“: eine offene Anfrage, ein gespiegelter Eintrag in Neles Chronik, ein eigener Chip bei Mira', async () => {
    assert.equal(login.data.erlebtMitOffen, 1)
    const requests = (await get('/api/erlebt-mit/offen', demoCookie)).data
    assert.deepEqual(requests.map((r) => [r.dogName, r.titel]), [['Flocke', 'Wilma staunt über Flocke']])

    const nele = (await get(`/api/timeline?dogId=${dogId('Nele')}`, demoCookie)).data
    const mirrored = nele.find((entry) => entry.gespiegelt)
    assert.equal(mirrored.titel, 'Schneerunde mit Nele')
    assert.equal(mirrored.gespiegelt.tier, 'Wilma')
    assert.equal((await fetch(`${base}${mirrored.foto_urls[0]}`, { headers: { Cookie: demoCookie } })).status, 200)
    const mira = (await get(`/api/timeline?dogId=${dogId('Mira')}`, demoCookie)).data
    const own = mira.find((entry) => entry.titel === 'Besuch vom Möwenweg')
    assert.deepEqual(own.erlebt_mit.map((tag) => [tag.name, tag.status]), [['Wilma', 'bestaetigt']])
    assert.equal((await post(`/api/erlebt-mit/${requests[0].requestId}/bestaetigen`, {}, demoCookie)).status, 403)
  })

  await t.test('Balu hat mehrere Einträge mit Fotos (eigene Kopien, sichtbar)', async () => {
    const balu = (await get(`/api/timeline?dogId=${dogId('Balu')}`, demoCookie)).data
    const withPhotos = balu.filter((entry) => entry.foto_urls.length > 0)
    assert.ok(withPhotos.length >= 3, `${withPhotos.length} Einträge mit Fotos`)
    const baluPhoto = dogs.find((dog) => dog.name === 'Balu').foto_url
    assert.ok(withPhotos.every((entry) => !entry.foto_urls.includes(baluPhoto)), 'keine geteilte Datei mit dem Profilfoto')
    for (const entry of withPhotos) {
      assert.equal((await fetch(`${base}${entry.foto_urls[0]}`, { headers: { Cookie: demoCookie } })).status, 200)
    }
  })

  await t.test('Einladungsliste: zwei beschriftete offene, drei eingelöste im Archiv', async () => {
    const open = (await get('/api/vouchers/mine', demoCookie)).data
    assert.equal(open.length, 2)
    assert.ok(open.every((voucher) => voucher.status === 'offen' && voucher.label))
    assert.ok(open.some((voucher) => voucher.besuch))
    const archive = (await get('/api/vouchers/mine?archiv=1', demoCookie)).data
    assert.equal(archive.length, 3)
    assert.equal(archive.filter((voucher) => voucher.neueChronik).length, 2)
  })
})
