const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, createHousehold, getCookie } = require('./helpers')

const dataDir = useTempDataDir('bilderrahmen', { LOGIN_RATE_LIMIT: '400', CODE_RATE_LIMIT: '400' })

async function uploadPng(base, cookie) {
  const form = new FormData()
  form.append('file', new Blob(['PNG'], { type: 'image/png' }), 'a.png')
  const res = await fetch(`${base}/api/uploads`, { method: 'POST', headers: { Cookie: cookie }, body: form })
  return (await res.json()).url
}

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function yearsAgoToday(years) {
  const now = new Date()
  return `${now.getUTCFullYear() - years}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`
}

const urlsOf = (res) => res.data.fotos.map((foto) => foto.url).sort()

test('Digitaler Bilderrahmen: Diashow im Bereich, Rahmen-Links und signierte Fotos', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')

  const get = (urlPath, cookie) => call(base, urlPath, { cookie })
  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const put = (urlPath, body, cookie) => call(base, urlPath, { method: 'PUT', body, cookie })
  const del = (urlPath, cookie) => call(base, urlPath, { method: 'DELETE', cookie })
  const entry = async (cookie, dogId, datum, fotoUrls, extra = {}) =>
    (await post('/api/timeline', { dogId, autorName: 'Test', datum, titel: 'Erinnerung', text: 'geheimer Text', fotoUrls, ...extra }, cookie)).data

  const home = await createHousehold(base, 'Zuhause Lindenhof')
  const other = await createHousehold(base, 'Zuhause Möwenweg')
  const homeId = home.data.id

  // Lindenhof: Nele (mit Tierfoto, verstorben) und Flocke; Erinnerungen mit Fotos, eine davon privat.
  const nelePhoto = await uploadPng(base, home.cookie)
  const nele = (await post('/api/dogs', { name: 'Nele', geschlecht: 'huendin', fotoUrl: nelePhoto, beiUnsBis: '2026-01-02', abschiedGrund: 'verstorben' }, home.cookie)).data
  const flocke = (await post('/api/dogs', { name: 'Flocke', geschlecht: 'ruede' }, home.cookie)).data
  const recentPhoto = await uploadPng(base, home.cookie)
  const oldPhoto = await uploadPng(base, home.cookie)
  const privatePhoto = await uploadPng(base, home.cookie)
  const flockePhoto = await uploadPng(base, home.cookie)
  const onThisDayPhoto = await uploadPng(base, home.cookie)
  await entry(home.cookie, nele.id, isoDaysAgo(3), [recentPhoto])
  await entry(home.cookie, nele.id, '2019-05-01', [oldPhoto])
  const privateEntry = await entry(home.cookie, nele.id, isoDaysAgo(10), [privatePhoto], { privat: true })
  await entry(home.cookie, flocke.id, isoDaysAgo(40), [flockePhoto])
  await entry(home.cookie, flocke.id, yearsAgoToday(3), [onThisDayPhoto])

  // Möwenweg: Benno mit Foto und einer öffentlichen und einer privaten Erinnerung - Benno ist ins Zuhause Lindenhof geteilt.
  const bennoPhoto = await uploadPng(base, other.cookie)
  const benno = (await post('/api/dogs', { name: 'Benno', geschlecht: 'ruede', fotoUrl: bennoPhoto }, other.cookie)).data
  const bennoEntryPhoto = await uploadPng(base, other.cookie)
  const bennoPrivatePhoto = await uploadPng(base, other.cookie)
  await entry(other.cookie, benno.id, isoDaysAgo(5), [bennoEntryPhoto])
  await entry(other.cookie, benno.id, isoDaysAgo(6), [bennoPrivatePhoto], { privat: true })
  db.prepare('INSERT INTO dog_shares (dog_id, family_id) VALUES (?, ?)').run(benno.id, homeId)

  const ownAll = [nelePhoto, recentPhoto, oldPhoto, privatePhoto, flockePhoto, onThisDayPhoto]
  let groupEntryPhoto

  await t.test('Sitzung: alles, was das eigene Zuhause sieht - eigene private nur auf Wunsch, private anderer nie', async () => {
    const res = await get('/api/bilderrahmen/fotos?privat=1', home.cookie)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('cache-control'), 'no-store')
    assert.equal(res.headers.get('etag'), null)
    assert.deepEqual(urlsOf(res), [...ownAll, bennoPhoto, bennoEntryPhoto].sort())
    assert.ok(!urlsOf(res).includes(bennoPrivatePhoto))
    const plain = await get('/api/bilderrahmen/fotos', home.cookie)
    assert.deepEqual(urlsOf(plain), [...ownAll, bennoPhoto, bennoEntryPhoto].filter((url) => url !== privatePhoto).sort())
    const neleFoto = res.data.fotos.find((foto) => foto.url === recentPhoto)
    assert.equal(neleFoto.tierName, 'Nele')
    assert.equal(neleFoto.inErinnerung, true)
    assert.equal(neleFoto.tierId, nele.id)
    assert.ok(Number.isInteger(neleFoto.eintragId))
    assert.equal(Object.keys(neleFoto).sort().join(','), 'datum,eintragId,inErinnerung,tierId,tierName,url')
    assert.deepEqual(
      res.data.tiere.map((tier) => tier.name),
      ['Benno', 'Flocke', 'Nele']
    )
    const profile = res.data.fotos.find((foto) => foto.url === nelePhoto)
    assert.equal(profile.datum, null)
    assert.equal(JSON.stringify(res.data).includes('geheimer Text'), false)
  })

  await t.test('Sitzung: Filter nach Tieren und Zeitraum, ungültige Angaben 400', async () => {
    assert.deepEqual(urlsOf(await get(`/api/bilderrahmen/fotos?tiere=${flocke.id}`, home.cookie)), [flockePhoto, onThisDayPhoto].sort())
    // letzter Monat: nur Erinnerungen der letzten 31 Tage, Tierfotos (ohne Datum) nicht
    assert.deepEqual(
      urlsOf(await get('/api/bilderrahmen/fotos?zeitraum=monat&privat=1', home.cookie)),
      [recentPhoto, privatePhoto, bennoEntryPhoto].sort()
    )
    const year = urlsOf(await get(`/api/bilderrahmen/fotos?zeitraum=jahr&privat=1&tiere=${nele.id},${flocke.id}`, home.cookie))
    assert.deepEqual(year, [recentPhoto, privatePhoto, flockePhoto].sort())
    assert.equal((await get('/api/bilderrahmen/fotos?zeitraum=woche', home.cookie)).status, 400)
    assert.equal((await get('/api/bilderrahmen/fotos?tiere=1,abc', home.cookie)).status, 400)
    assert.equal((await get('/api/bilderrahmen/fotos?zeitraum[]=jahr', home.cookie)).status, 400)
    assert.equal((await get('/api/bilderrahmen/fotos?tiere[]=1', home.cookie)).status, 400)
    assert.equal((await get('/api/bilderrahmen/fotos')).status, 401)
  })

  await t.test('Sitzung in einer Familie: private Erinnerungen nur im eigenen Zuhause', async () => {
    const group = await post('/api/families/group', { name: 'Familie Sonnenhang', password: 'sonnenhang-passwort' }, home.cookie)
    assert.equal(group.status, 201)
    const groupId = group.data.memberships[0].id
    db.prepare('INSERT INTO dog_shares (dog_id, family_id) VALUES (?, ?)').run(nele.id, groupId)
    const view = await post('/api/view', { familyId: groupId }, home.cookie)
    const groupCookie = getCookie(view.res)
    // Ein Tier der Familie selbst (klassisch im Familienbereich angelegt) mit einer Erinnerung samt Foto
    groupEntryPhoto = await uploadPng(base, groupCookie)
    const lotte = (await post('/api/dogs', { name: 'Lotte', geschlecht: 'huendin' }, groupCookie)).data
    assert.ok(lotte?.id, 'Tier der Familie angelegt')
    assert.ok((await entry(groupCookie, lotte.id, isoDaysAgo(2), [groupEntryPhoto]))?.id, 'Erinnerung der Familie angelegt')
    const res = await get('/api/bilderrahmen/fotos?privat=1', groupCookie)
    assert.equal(res.status, 200)
    assert.deepEqual(urlsOf(res), [nelePhoto, recentPhoto, oldPhoto, groupEntryPhoto].sort())
    // im eigenen Zuhause gehört die Erinnerung der Familie nicht dazu (wie in der Chronik des Zuhauses)
    assert.ok(!urlsOf(await get('/api/bilderrahmen/fotos', home.cookie)).includes(groupEntryPhoto))
    // Rahmen-Links verwaltet nur das eigene Zuhause
    assert.equal((await get('/api/bilderrahmen/geraete', groupCookie)).status, 403)
    assert.equal((await post('/api/bilderrahmen/geraete', { name: 'Flur' }, groupCookie)).status, 403)
  })

  await t.test('Gast (Besuchs-Sitzung) bekommt 403', async () => {
    db.prepare('INSERT INTO besuche (gast_family_id, gastgeber_family_id) VALUES (?, ?)').run(other.data.id, homeId)
    const view = await post('/api/view', { familyId: homeId }, other.cookie)
    assert.equal(view.status, 200)
    const guestCookie = getCookie(view.res)
    assert.equal((await get('/api/bilderrahmen/fotos', guestCookie)).status, 403)
    assert.equal((await get('/api/bilderrahmen/geraete', guestCookie)).status, 403)
    assert.equal((await post('/api/bilderrahmen/geraete', { name: 'Gast' }, guestCookie)).status, 403)
    assert.equal((await put('/api/bilderrahmen/geraete/1', { name: 'Gast' }, guestCookie)).status, 403)
    assert.equal((await del('/api/bilderrahmen/geraete/1', guestCookie)).status, 403)
  })

  let token
  let geraet

  await t.test('Rahmen-Link anlegen: Token einmal, gespeichert nur als Hash, Auswahl geprüft', async () => {
    assert.equal((await post('/api/bilderrahmen/geraete', { name: '' }, home.cookie)).status, 400)
    assert.equal((await post('/api/bilderrahmen/geraete', { name: 'x'.repeat(41) }, home.cookie)).status, 400)
    assert.equal((await post('/api/bilderrahmen/geraete', { name: 'Flur', auswahl: { tiere: [benno.id] } }, home.cookie)).status, 400)
    assert.equal((await post('/api/bilderrahmen/geraete', { name: 'Flur', auswahl: { intervall: 7 } }, home.cookie)).status, 400)
    assert.equal((await post('/api/bilderrahmen/geraete', { name: 'Flur', auswahl: { privat: 'ja' } }, home.cookie)).status, 400)
    assert.equal((await post('/api/bilderrahmen/geraete', { name: { a: 1 } }, home.cookie)).status, 400)
    assert.equal((await post('/api/bilderrahmen/geraete', { name: 'Flur', auswahl: { zeitraum: ['jahr'] } }, home.cookie)).status, 400)

    const res = await post('/api/bilderrahmen/geraete', { name: ' Wohnzimmer Oma ', auswahl: { intervall: 30, uhr: true } }, home.cookie)
    assert.equal(res.status, 201)
    assert.equal(res.headers.get('cache-control'), 'no-store')
    assert.match(res.data.token, /^[A-Za-z0-9_-]{43}$/)
    token = res.data.token
    geraet = res.data.geraet
    assert.equal(geraet.name, 'Wohnzimmer Oma')
    assert.equal(geraet.auswahl.privat, false)
    assert.equal(geraet.auswahl.intervall, 30)
    assert.equal(geraet.auswahl.uhr, true)
    assert.equal(geraet.zuletztAktiv, null)

    const row = db.prepare('SELECT * FROM rahmen_geraete WHERE id = ?').get(geraet.id)
    const { hashToken } = require('../lib/rahmenGeraete')
    assert.equal(row.token_hash, hashToken(token))
    assert.equal(JSON.stringify(row).includes(token), false)

    const list = await get('/api/bilderrahmen/geraete', home.cookie)
    assert.equal(list.status, 200)
    assert.equal(list.data.max, 5)
    assert.deepEqual(list.data.geraete.map((g) => g.name), ['Wohnzimmer Oma'])
    assert.equal(JSON.stringify(list.data).includes(token), false)
  })

  let fotoUrls

  await t.test('Gerät ohne Sitzung: nur eigene Tiere und eigene, nicht-private Erinnerungen; nur Name und Datum', async () => {
    const res = await fetch(`${base}/api/rahmen/fotos`, { headers: { 'X-Rahmen-Token': token } })
    const data = await res.json()
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('cache-control'), 'no-store')
    assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow')
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer')
    assert.equal(res.headers.get('etag'), null)
    assert.equal(data.name, 'Wohnzimmer Oma')
    assert.equal(data.optionen.intervall, 30)
    assert.equal(data.optionen.uhr, true)
    assert.equal('privat' in data.optionen, false)
    const validMinutes = (Date.parse(data.gueltigBis) - Date.now()) / 60000
    assert.ok(validMinutes > 59 && validMinutes <= 120, `gültig ${validMinutes} Minuten`)
    fotoUrls = data.fotos.map((foto) => foto.url)
    const files = fotoUrls.map((url) => `/uploads/${url.split('/')[2].split('?')[0]}`).sort()
    assert.deepEqual(files, [nelePhoto, recentPhoto, oldPhoto, flockePhoto, onThisDayPhoto].sort())
    for (const url of fotoUrls) assert.match(url, /^\/rahmen-foto\/[0-9a-f-]{36}\.png\?g=\d+&exp=\d{10}&sig=[A-Za-z0-9_-]{43}$/)
    assert.deepEqual(Object.keys(data.fotos[0]).sort(), ['datum', 'inErinnerung', 'tierName', 'url'])
    assert.equal(JSON.stringify(data).includes('geheimer Text'), false)
    assert.equal(JSON.stringify(data).includes('Benno'), false)
    assert.ok(!files.includes(groupEntryPhoto), 'Erinnerung aus der Familie nie auf dem Gerät')

    const list = await get('/api/bilderrahmen/geraete', home.cookie)
    assert.ok(list.data.geraete[0].zuletztAktiv, 'zuletzt aktiv ist gesetzt')
  })

  await t.test('signierte Fotos: gültig 200, sonst 404 (Ablauf, Manipulation, falsches Gerät, Pfad-Tricks)', async () => {
    const ok = await fetch(`${base}${fotoUrls[0]}`)
    assert.equal(ok.status, 200)
    assert.equal(ok.headers.get('content-type'), 'image/png')
    assert.match(ok.headers.get('cache-control'), /^private, max-age=\d+$/)
    assert.equal(ok.headers.get('x-robots-tag'), 'noindex, nofollow')
    assert.equal(await ok.text(), 'PNG')

    const { signatureFor, signedFotoUrl } = require('../lib/rahmenSignatur')
    const url = new URL(`${base}${fotoUrls[0]}`)
    const file = url.pathname.split('/')[2]
    const exp = Number(url.searchParams.get('exp'))
    const sig = url.searchParams.get('sig')
    const status = async (urlPath) => (await fetch(`${base}${urlPath}`)).status

    const past = Math.floor(Date.now() / 1000) - 60
    assert.equal(await status(signedFotoUrl(file, geraet.id, past)), 404, 'abgelaufen')
    const farFuture = Math.floor(Date.now() / 1000) + 24 * 60 * 60
    assert.equal(await status(signedFotoUrl(file, geraet.id, farFuture)), 404, 'zu lange gültig')
    assert.equal(await status(`/rahmen-foto/${file}?g=${geraet.id}&exp=${exp + 600}&sig=${sig}`), 404, 'Ablauf verändert')
    const flipped = `${sig.slice(0, -1)}${sig.endsWith('A') ? 'B' : 'A'}`
    assert.equal(await status(`/rahmen-foto/${file}?g=${geraet.id}&exp=${exp}&sig=${flipped}`), 404, 'Signatur verändert')
    assert.equal(await status(`/rahmen-foto/${file}?g=${geraet.id + 1}&exp=${exp}&sig=${sig}`), 404, 'anderes Gerät')
    assert.equal(await status(`/rahmen-foto/${file}?g=${geraet.id}&exp=${exp}`), 404, 'ohne Signatur')
    assert.equal(await status(`/rahmen-foto/${file}?g=${geraet.id}&exp=${exp}&sig=${sig}&sig=${sig}`), 404, 'doppelt')

    // Pfad-Tricks scheitern an der strengen Form des Dateinamens - auch mit gültiger Signatur über den Trick-Namen.
    for (const trick of ['..%2Fdata.db', '%2e%2e%2fdata.db', '..%5Cdata.db', 'data.db']) {
      const name = decodeURIComponent(trick)
      const signed = `?g=${geraet.id}&exp=${exp}&sig=${signatureFor(name, geraet.id, exp)}`
      assert.equal(await status(`/rahmen-foto/${trick}${signed}`), 404, trick)
    }
    assert.equal(await status('/rahmen-foto/'), 404)

    // Ein gültig signiertes, aber fremdes Foto (Benno aus dem Möwenweg) und ein privates gehören nicht zur Auswahl.
    const foreign = bennoPhoto.split('/')[2]
    assert.equal(await status(signedFotoUrl(foreign, geraet.id, exp)), 404, 'fremdes Foto')
    const privateFile = privatePhoto.split('/')[2]
    assert.equal(await status(signedFotoUrl(privateFile, geraet.id, exp)), 404, 'privates Foto')
  })

  await t.test('„auch private Erinnerungen“ nur mit Haken - und ein jetzt privater Eintrag wirkt sofort', async () => {
    const res = await put(`/api/bilderrahmen/geraete/${geraet.id}`, { auswahl: { privat: true } }, home.cookie)
    assert.equal(res.status, 200)
    assert.equal(res.data.geraet.auswahl.privat, true)
    assert.equal(res.data.geraet.auswahl.intervall, 30, 'übrige Auswahl bleibt')
    const data = await (await fetch(`${base}/api/rahmen/fotos`, { headers: { 'X-Rahmen-Token': token } })).json()
    const files = data.fotos.map((foto) => `/uploads/${foto.url.split('/')[2].split('?')[0]}`)
    assert.ok(files.includes(privatePhoto))
    assert.ok(!files.includes(bennoPhoto) && !files.includes(bennoEntryPhoto) && !files.includes(bennoPrivatePhoto))

    const { signedFotoUrl, expiryFor } = require('../lib/rahmenSignatur')
    const privateUrl = signedFotoUrl(privatePhoto.split('/')[2], geraet.id, expiryFor())
    assert.equal((await fetch(`${base}${privateUrl}`)).status, 200)
    await put(`/api/bilderrahmen/geraete/${geraet.id}`, { auswahl: { privat: false } }, home.cookie)
    assert.equal((await fetch(`${base}${privateUrl}`)).status, 404, 'Haken weg: sofort nicht mehr')
    assert.ok(privateEntry.id)
  })

  await t.test('Tiere des Geräts: nur die gewählten', async () => {
    await put(`/api/bilderrahmen/geraete/${geraet.id}`, { auswahl: { tiere: [flocke.id] } }, home.cookie)
    const data = await (await fetch(`${base}/api/rahmen/fotos`, { headers: { 'X-Rahmen-Token': token } })).json()
    assert.deepEqual(data.fotos.map((foto) => foto.tierName), ['Flocke', 'Flocke'])
    assert.equal((await fetch(`${base}${fotoUrls.find((u) => u.includes(nelePhoto.split('/')[2]))}`)).status, 404)
    await put(`/api/bilderrahmen/geraete/${geraet.id}`, { auswahl: { tiere: [] } }, home.cookie)
  })

  await t.test('ein Tier zieht in ein anderes Zuhause: seine Fotos verschwinden vom Gerät', async () => {
    db.prepare('UPDATE dogs SET family_id = ? WHERE id = ?').run(other.data.id, flocke.id)
    const data = await (await fetch(`${base}/api/rahmen/fotos`, { headers: { 'X-Rahmen-Token': token } })).json()
    assert.ok(data.fotos.length > 0)
    assert.ok(data.fotos.every((foto) => foto.tierName !== 'Flocke'))
    db.prepare('UPDATE dogs SET family_id = ? WHERE id = ?').run(homeId, flocke.id)
  })

  await t.test('umbenennen; fremde Geräte gibt es nicht', async () => {
    const res = await put(`/api/bilderrahmen/geraete/${geraet.id}`, { name: 'Küche' }, home.cookie)
    assert.equal(res.data.geraet.name, 'Küche')
    assert.equal((await put(`/api/bilderrahmen/geraete/${geraet.id}`, {}, home.cookie)).status, 400)
    assert.equal((await put(`/api/bilderrahmen/geraete/${geraet.id}`, { name: 'Fremd' }, other.cookie)).status, 404)
    assert.equal((await del(`/api/bilderrahmen/geraete/${geraet.id}`, other.cookie)).status, 404)
    assert.equal((await del('/api/bilderrahmen/geraete/abc', home.cookie)).status, 404)
  })

  await t.test('unbekanntes, fehlendes oder kaputtes Token: 401 „beendet“', async () => {
    for (const headers of [{}, { 'X-Rahmen-Token': 'kurz' }, { 'X-Rahmen-Token': 'A'.repeat(43) }]) {
      const res = await fetch(`${base}/api/rahmen/fotos`, { headers })
      assert.equal(res.status, 401)
      assert.equal(res.headers.get('cache-control'), 'no-store')
      const data = await res.json()
      assert.equal(data.error, 'Dieser Bilderrahmen wurde beendet')
      assert.equal(data.code, 'RAHMEN_BEENDET')
    }
    // Das Token zählt nur als Header - in der Adresse wird es ignoriert.
    assert.equal((await fetch(`${base}/api/rahmen/fotos?token=${token}`)).status, 401)
  })

  await t.test('höchstens fünf Geräte je Zuhause', async () => {
    for (let i = 2; i <= 5; i += 1) assert.equal((await post('/api/bilderrahmen/geraete', { name: `Gerät ${i}` }, home.cookie)).status, 201)
    const sixth = await post('/api/bilderrahmen/geraete', { name: 'Gerät 6' }, home.cookie)
    assert.equal(sixth.status, 409)
    assert.match(sixth.data.error, /Höchstens 5/)
  })

  await t.test('widerrufen: sofort ungültig - auch schon ausgegebene Foto-Adressen', async () => {
    const before = await fetch(`${base}/api/rahmen/fotos`, { headers: { 'X-Rahmen-Token': token } })
    const issued = (await before.json()).fotos[0].url
    assert.equal((await fetch(`${base}${issued}`)).status, 200)
    assert.equal((await del(`/api/bilderrahmen/geraete/${geraet.id}`, home.cookie)).status, 204)
    assert.equal((await fetch(`${base}/api/rahmen/fotos`, { headers: { 'X-Rahmen-Token': token } })).status, 401)
    assert.equal((await fetch(`${base}${issued}`)).status, 404)
    assert.equal((await post('/api/bilderrahmen/geraete', { name: 'Gerät 6' }, home.cookie)).status, 201, 'Platz wieder frei')
  })

  await t.test('Demo: Diashow lesen ja, Rahmen-Links anlegen nein; Demo-Geräte gelten nie', async () => {
    const demo = await createHousehold(base, 'Zuhause Demo')
    const demoPhoto = await uploadPng(base, demo.cookie)
    const demoDog = (await post('/api/dogs', { name: 'Mia', geschlecht: 'huendin', fotoUrl: demoPhoto }, demo.cookie)).data
    const demoDevice = await post('/api/bilderrahmen/geraete', { name: 'Vorher' }, demo.cookie)
    db.prepare('UPDATE families SET is_demo = 1 WHERE id = ?').run(demo.data.id)
    const fotos = await get('/api/bilderrahmen/fotos', demo.cookie)
    assert.equal(fotos.status, 200)
    assert.deepEqual(urlsOf(fotos), [demoPhoto])
    assert.equal(fotos.data.tiere[0].id, demoDog.id)
    const create = await post('/api/bilderrahmen/geraete', { name: 'Demo-Rahmen' }, demo.cookie)
    assert.equal(create.status, 403)
    assert.equal((await get('/api/bilderrahmen/geraete', demo.cookie)).status, 200)
    const res = await fetch(`${base}/api/rahmen/fotos`, { headers: { 'X-Rahmen-Token': demoDevice.data.token } })
    assert.equal(res.status, 401, 'ein Gerät eines Demo-Zuhauses gilt nicht')
  })

  await t.test('Schlüssel erneuert: alle Rahmen-Links des Zuhauses enden', async () => {
    const fresh = await post('/api/bilderrahmen/geraete', { name: 'Neu' }, other.cookie)
    assert.equal(fresh.status, 201)
    const ok = await fetch(`${base}/api/rahmen/fotos`, { headers: { 'X-Rahmen-Token': fresh.data.token } })
    assert.equal(ok.status, 200)
    const photoUrl = (await ok.json()).fotos[0].url
    assert.equal((await fetch(`${base}${photoUrl}`)).status, 200)
    db.prepare('UPDATE families SET auth_epoch = auth_epoch + 1 WHERE id = ?').run(other.data.id)
    assert.equal((await fetch(`${base}/api/rahmen/fotos`, { headers: { 'X-Rahmen-Token': fresh.data.token } })).status, 401)
    assert.equal((await fetch(`${base}${photoUrl}`)).status, 404, 'auch die schon ausgegebenen Fotos')
  })

  await t.test('Seite /rahmen: noindex, kein Referrer', async () => {
    const res = await fetch(`${base}/rahmen`)
    assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow')
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer')
  })

  await t.test('Zuhause gelöscht: seine Rahmen-Links verschwinden mit', async () => {
    const { deleteFamily } = require('../lib/families')
    const before = db.prepare('SELECT COUNT(*) AS c FROM rahmen_geraete WHERE family_id = ?').get(homeId).c
    assert.ok(before > 0)
    deleteFamily(db, homeId)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM rahmen_geraete WHERE family_id = ?').get(homeId).c, 0)
  })
})
