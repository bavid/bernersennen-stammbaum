const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, createFamily, createHousehold, getCookie } = require('./helpers')

const dataDir = useTempDataDir('erlebt-mit', { LOGIN_RATE_LIMIT: '400', CODE_RATE_LIMIT: '400' })

async function uploadPng(base, cookie) {
  const form = new FormData()
  form.append('file', new Blob(['PNG'], { type: 'image/png' }), 'a.png')
  const res = await fetch(`${base}/api/uploads`, { method: 'POST', headers: { Cookie: cookie }, body: form })
  return (await res.json()).url
}

test('Phase V2: „Erlebt mit“ - markieren, Anfrage, bestätigen/ablehnen, gespiegelte Chronik', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')

  const get = (urlPath, cookie) => call(base, urlPath, { cookie })
  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const put = (urlPath, body, cookie) => call(base, urlPath, { method: 'PUT', body, cookie })
  const del = (urlPath, cookie) => call(base, urlPath, { method: 'DELETE', cookie })
  const newDog = async (cookie, name) => (await post('/api/dogs', { name, geschlecht: 'huendin' }, cookie)).data

  const author = await createHousehold(base, 'Zuhause am Deich Test')
  const friend = await createHousehold(base, 'Zuhause Möwenweg Test')
  const member = await createHousehold(base, 'Zuhause Lindenhof Test')
  const stranger = await createHousehold(base, 'Zuhause Fremd Test')

  const balu = await newDog(author.cookie, 'Balu')
  const wilma = await newDog(friend.cookie, 'Wilma')
  const pepper = await newDog(member.cookie, 'Pepper')
  const pepperUnshared = await newDog(member.cookie, 'Lotte')
  const strangerDog = await newDog(stranger.cookie, 'Oskar')

  // Besuch: der Freund besucht die Autorin (Richtung egal). Familie: Autorin und Mitglied, Pepper geteilt.
  const invite = await post('/api/besuche/einladungen', {}, author.cookie)
  assert.equal((await post('/api/besuche/einloesen', { code: invite.data.code }, friend.cookie)).status, 201)
  const rudel = await createFamily(base, 'Familie Erlebt', 'erlebt-mit-pw-1')
  await post('/api/families/join', { password: 'erlebt-mit-pw-1' }, author.cookie)
  await post('/api/families/join', { password: 'erlebt-mit-pw-1' }, member.cookie)
  assert.equal((await put(`/api/dogs/${pepper.id}/shares`, { familyIds: [rudel.data.id] }, member.cookie)).status, 200)

  const photo = await uploadPng(base, author.cookie)
  let entry

  await t.test('markierbar sind nur Tiere verbundener Zuhause (Besuch, gemeinsame Familie mit Freigabe)', async () => {
    const res = await get('/api/erlebt-mit/tiere', author.cookie)
    assert.equal(res.status, 200)
    assert.deepEqual(res.data.map((dog) => dog.id).sort(), [wilma.id, pepper.id].sort())
    const ids = res.data.map((dog) => dog.id)
    for (const hidden of [balu.id, pepperUnshared.id, strangerDog.id]) assert.ok(!ids.includes(hidden))
    assert.equal(res.data.find((dog) => dog.id === wilma.id).zuhause, 'Zuhause Möwenweg Test')
  })

  await t.test('Eintrag mit Markierung: die Autorin sieht „erlebt mit“ sofort (offen)', async () => {
    const res = await post(
      '/api/timeline',
      { dogId: balu.id, autorName: 'Nissen', datum: '2026-08-30', titel: 'Deichrunde', fotoUrls: [photo], erlebtMit: [wilma.id] },
      author.cookie
    )
    assert.equal(res.status, 201)
    entry = res.data
    assert.deepEqual(entry.erlebt_mit.map((tag) => [tag.dogId, tag.name, tag.status]), [[wilma.id, 'Wilma', 'offen']])
    const timeline = await get(`/api/timeline?dogId=${balu.id}`, author.cookie)
    assert.equal(timeline.data.find((e) => e.id === entry.id).erlebt_mit.length, 1)
  })

  await t.test('nicht erlaubt: fremde Tiere, private Einträge, Markieren außerhalb des eigenen Zuhauses', async () => {
    const base_ = { dogId: balu.id, autorName: 'Nissen', datum: '2026-08-01', titel: 'Test' }
    assert.equal((await post('/api/timeline', { ...base_, erlebtMit: [strangerDog.id] }, author.cookie)).status, 400)
    assert.equal((await post('/api/timeline', { ...base_, erlebtMit: [pepperUnshared.id] }, author.cookie)).status, 400)
    assert.equal((await post('/api/timeline', { ...base_, privat: true, erlebtMit: [wilma.id] }, author.cookie)).status, 400)
    assert.equal((await post('/api/timeline', { ...base_, erlebtMit: ['x'] }, author.cookie)).status, 400)
    // In der Familie (aktiver Bereich = Rudel) gibt es keine Markierungen
    const inRudel = getCookie((await post('/api/view', { familyId: rudel.data.id }, author.cookie)).res)
    const rudelDog = await newDog(inRudel, 'Familienhund')
    const res = await post('/api/timeline', { ...base_, dogId: rudelDog.id, erlebtMit: [pepper.id] }, inRudel)
    assert.equal(res.status, 400)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM erlebt_mit').get().c, 1)
  })

  await t.test('die Besitzer bekommen eine Anfrage - samt Fotos; Fremde sehen nichts', async () => {
    const me = await get('/api/me', friend.cookie)
    assert.equal(me.data.erlebtMitOffen, 1)
    const res = await get('/api/erlebt-mit/offen', friend.cookie)
    assert.equal(res.data.length, 1)
    assert.equal(res.data[0].titel, 'Deichrunde')
    assert.equal(res.data[0].dogName, 'Wilma')
    assert.equal(res.data[0].tier, 'Balu')
    assert.equal(res.data[0].zuhause, 'Zuhause am Deich Test')
    assert.deepEqual(res.data[0].foto_urls, [photo])
    assert.equal((await fetch(`${base}${photo}`, { headers: { Cookie: friend.cookie } })).status, 200)
    assert.equal((await fetch(`${base}${photo}`, { headers: { Cookie: stranger.cookie } })).status, 404)
    assert.deepEqual((await get('/api/erlebt-mit/offen', stranger.cookie)).data, [])
    assert.equal((await post(`/api/erlebt-mit/${res.data[0].requestId}/bestaetigen`, {}, stranger.cookie)).status, 404)
    assert.equal((await post(`/api/erlebt-mit/${res.data[0].requestId}/bestaetigen`, {}, author.cookie)).status, 404)
  })

  await t.test('bestätigen: der Eintrag erscheint gespiegelt in Wilmas Chronik (Verweis, ohne Kommentare)', async () => {
    const requestId = (await get('/api/erlebt-mit/offen', friend.cookie)).data[0].requestId
    const res = await post(`/api/erlebt-mit/${requestId}/bestaetigen`, {}, friend.cookie)
    assert.equal(res.status, 200)
    assert.equal(res.data.offen, 0)
    const timeline = await get(`/api/timeline?dogId=${wilma.id}`, friend.cookie)
    const mirrored = timeline.data.find((e) => e.gespiegelt)
    assert.equal(mirrored.id, entry.id)
    assert.equal(mirrored.titel, 'Deichrunde')
    assert.deepEqual(mirrored.comments, [])
    assert.deepEqual(mirrored.gespiegelt, {
      requestId,
      tierId: balu.id,
      tier: 'Balu',
      tierNameUnbekannt: false,
      zuhauseId: author.data.id,
      zuhause: 'Zuhause am Deich Test'
    })
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM timeline_entries WHERE titel = ?').get('Deichrunde').c, 1, 'keine Kopie')
    const authorView = await get(`/api/timeline?dogId=${balu.id}`, author.cookie)
    assert.equal(authorView.data.find((e) => e.id === entry.id).erlebt_mit[0].status, 'bestaetigt')
    // Kommentieren geht nur im Original (der gespiegelte Eintrag ist in Wilmas Chronik nicht kommentierbar)
    assert.equal((await post(`/api/timeline/${entry.id}/comments`, { autorName: 'J', text: 'Hi' }, friend.cookie)).status, 404)
  })

  await t.test('ein Gast im Zuhause der Autorin sieht die Markierungen nicht', async () => {
    const guestView = getCookie((await post('/api/view', { familyId: author.data.id }, friend.cookie)).res)
    const timeline = await get(`/api/timeline?dogId=${balu.id}`, guestView)
    const visible = timeline.data.find((e) => e.id === entry.id)
    assert.equal(visible.erlebt_mit, undefined)
    assert.equal((await get('/api/erlebt-mit/tiere', guestView)).status, 403)
  })

  await t.test('ablehnen nimmt die Markierung überall weg - und erneutes Speichern fragt nicht wieder an', async () => {
    const requestId = db.prepare('SELECT id FROM erlebt_mit WHERE entry_id = ?').get(entry.id).id
    assert.equal((await post(`/api/erlebt-mit/${requestId}/ablehnen`, {}, friend.cookie)).status, 200)
    assert.ok(!(await get(`/api/timeline?dogId=${wilma.id}`, friend.cookie)).data.some((e) => e.gespiegelt))
    const res = await put(
      `/api/timeline/${entry.id}`,
      { autorName: 'Nissen', datum: '2026-08-30', titel: 'Deichrunde', fotoUrls: [photo], erlebtMit: [wilma.id] },
      author.cookie
    )
    assert.equal(res.status, 200)
    assert.deepEqual(res.data.erlebt_mit, [])
    assert.deepEqual((await get('/api/erlebt-mit/offen', friend.cookie)).data, [])
    // Das Foto bleibt für den Freund sichtbar - nicht mehr über die Markierung, sondern weil er die Autorin besucht und Start
    // deren nicht-private Erinnerungen zeigt (Phase W, Schritt 3, lib/uploadAccess.js). Fremde sehen es weiterhin nicht.
    assert.equal((await fetch(`${base}${photo}`, { headers: { Cookie: friend.cookie } })).status, 200)
    assert.equal((await fetch(`${base}${photo}`, { headers: { Cookie: stranger.cookie } })).status, 404)
  })

  await t.test('privat machen löscht alle Markierungen; Löschen des Eintrags nimmt sie mit', async () => {
    const res = await post(
      '/api/timeline',
      { dogId: balu.id, autorName: 'Nissen', datum: '2026-09-01', titel: 'Familienausflug', erlebtMit: [pepper.id] },
      author.cookie
    )
    assert.equal((await get('/api/erlebt-mit/offen', member.cookie)).data.length, 1)
    const toPrivate = await put(
      `/api/timeline/${res.data.id}`,
      { autorName: 'Nissen', datum: '2026-09-01', titel: 'Familienausflug', privat: true },
      author.cookie
    )
    assert.equal(toPrivate.status, 200)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM erlebt_mit WHERE entry_id = ?').get(res.data.id).c, 0)

    const again = await post(
      '/api/timeline',
      { dogId: balu.id, autorName: 'Nissen', datum: '2026-09-02', titel: 'Noch ein Ausflug', erlebtMit: [pepper.id] },
      author.cookie
    )
    assert.equal((await del(`/api/timeline/${again.data.id}`, author.cookie)).status, 204)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM erlebt_mit WHERE entry_id = ?').get(again.data.id).c, 0)
  })

  await t.test('endet die Verbindung, verschwinden Anfrage, Spiegelung und Fotos', async () => {
    const res = await post(
      '/api/timeline',
      { dogId: balu.id, autorName: 'Nissen', datum: '2026-09-10', titel: 'Strandtag', fotoUrls: [photo], erlebtMit: [wilma.id] },
      author.cookie
    )
    const requestId = (await get('/api/erlebt-mit/offen', friend.cookie)).data.find((r) => r.id === res.data.id).requestId
    await post(`/api/erlebt-mit/${requestId}/bestaetigen`, {}, friend.cookie)
    assert.ok((await get(`/api/timeline?dogId=${wilma.id}`, friend.cookie)).data.some((e) => e.gespiegelt))

    assert.equal((await del(`/api/besuche/bei/${author.data.id}`, friend.cookie)).status, 200)
    assert.ok(!(await get(`/api/timeline?dogId=${wilma.id}`, friend.cookie)).data.some((e) => e.gespiegelt))
    assert.equal((await fetch(`${base}${photo}`, { headers: { Cookie: friend.cookie } })).status, 404)
    assert.ok(!(await get('/api/erlebt-mit/tiere', author.cookie)).data.some((dog) => dog.id === wilma.id))
    assert.equal((await post(`/api/erlebt-mit/${requestId}/ablehnen`, {}, friend.cookie)).status, 404)
  })

  await t.test('nur aus dem eigenen Zuhause; die Demo liest nur', async () => {
    const inRudel = getCookie((await post('/api/view', { familyId: rudel.data.id }, member.cookie)).res)
    assert.equal((await get('/api/erlebt-mit/offen', inRudel)).status, 400)
    db.prepare('UPDATE families SET is_demo = 1 WHERE id = ?').run(member.data.id)
    const requestId = db.prepare("SELECT id FROM erlebt_mit WHERE status = 'offen' LIMIT 1").get()?.id ?? 1
    assert.equal((await post(`/api/erlebt-mit/${requestId}/bestaetigen`, {}, member.cookie)).status, 403)
    db.prepare('UPDATE families SET is_demo = 0 WHERE id = ?').run(member.data.id)
  })
})
