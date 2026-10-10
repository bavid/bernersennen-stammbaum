const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, createHousehold, createFamily, getCookie } = require('./helpers')
const { hashPassword } = require('../lib/adminAuth')
const { TINY_JPEG } = require('./imageFixtures')

// Phase M „Mein Revier“ (lib/revier.js, routes/revier.js): öffentliche Profile nur mit Opt-in, Radar nur in
// Entfernungsstufen, Folgen und „Aus deinem Revier“ - nur für angemeldete Haushalte, no-store, noindex.

const dataDir = useTempDataDir('revier', { REVIER_FOLGEN_LIMIT: '12', REVIER_RADAR_LIMIT: '20' })

// Schlüssel, die nie in einer Revier-Antwort über ein fremdes Profil stehen dürfen.
const VERBOTEN = ['plz', 'lat', 'lon', 'km', 'distanz', 'family_id', 'familyId', 'profil_id', 'dog_id', 'autor_name']

function assertNoLeak(value, label) {
  const walk = (node, pfad) => {
    if (Array.isArray(node)) return node.forEach((item, i) => walk(item, `${pfad}[${i}]`))
    if (!node || typeof node !== 'object') return
    for (const [key, inner] of Object.entries(node)) {
      assert.ok(!VERBOTEN.includes(key), `${label}: Schlüssel ${pfad}.${key} darf nicht erscheinen`)
      walk(inner, `${pfad}.${key}`)
    }
  }
  walk(value, label)
  assert.ok(!/\b\d{5}\b/.test(JSON.stringify(value)), `${label}: keine fünfstellige Zahl (PLZ)`)
}

async function uploadJpeg(base, cookie) {
  const form = new FormData()
  form.append('file', new Blob([TINY_JPEG], { type: 'image/jpeg' }), 'a.jpg')
  const res = await fetch(`${base}/api/uploads`, { method: 'POST', headers: { Cookie: cookie }, body: form })
  return (await res.json()).url
}

test('Mein Revier', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword('admin-test-passwort')
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')

  const api = (cookie) => ({
    get: (path) => call(base, `/api/revier${path}`, { cookie }),
    post: (path, body = {}) => call(base, `/api/revier${path}`, { method: 'POST', body, cookie }),
    put: (path, body = {}) => call(base, `/api/revier${path}`, { method: 'PUT', body, cookie }),
    del: (path) => call(base, `/api/revier${path}`, { method: 'DELETE', cookie })
  })

  const viewer = await createHousehold(base, 'Zuhause Kiefernweg')
  const a = await createHousehold(base, 'Zuhause Benno')
  const b = await createHousehold(base, 'Zuhause Wilma')
  const c = await createHousehold(base, 'Zuhause Flocke')
  const fern = await createHousehold(base, 'Zuhause Fern')
  const V = api(viewer.cookie)
  const A = api(a.cookie)

  const dog = async (cookie, name, extra = {}) =>
    (await call(base, '/api/dogs', { method: 'POST', cookie, body: { name, geschlecht: 'ruede', ...extra } })).data
  const entry = async (cookie, dogId, extra = {}) =>
    (await call(base, '/api/timeline', { method: 'POST', cookie, body: { dogId, autorName: 'Pepper', datum: '2026-09-01', titel: 'Am See', ...extra } })).data

  const foto = await uploadJpeg(base, a.cookie)
  const benno = await dog(a.cookie, 'Benno', { fotoUrl: foto })
  const lotte = await dog(a.cookie, 'Lotte', { tierart: 'katze' })
  const oeffentlich = await entry(a.cookie, benno.id, { titel: 'Benno am Deich', text: 'Wind und Wellen.', fotoUrls: [foto] })
  const privat = await entry(a.cookie, benno.id, { titel: 'Nur für uns', privat: true })
  const impfung = await entry(a.cookie, benno.id, { titel: 'Impfung', privat: false, gesundheit: { art: 'impfung' } })

  const einschalten = (who, plz, extra = {}) => api(who.cookie).put('/einstellungen', { aktiv: true, plz, zustimmung: true, ...extra })

  await t.test('nur angemeldete Haushalte – no-store, noindex', async () => {
    const anon = await call(base, '/api/revier/radar', { method: 'POST', body: { plz: '21037', umkreis: 50 } })
    assert.equal(anon.status, 401)
    assert.equal(anon.headers.get('cache-control'), 'no-store')
    assert.equal(anon.headers.get('x-robots-tag'), 'noindex')
    const partner = await createFamily(base, 'Hundeschule Flocke', 'partner-passwort', { art: 'partner' })
    assert.equal((await api(partner.cookie).post('/radar', { plz: '21037', umkreis: 50 })).status, 403)
    assert.equal((await api(partner.cookie).get('/einstellungen')).status, 403)
  })

  await t.test('Einschalten braucht PLZ und das Häkchen', async () => {
    assert.equal((await A.put('/einstellungen', { aktiv: true, plz: '21035' })).status, 400)
    assert.equal((await A.put('/einstellungen', { aktiv: true, zustimmung: true })).status, 400)
    assert.equal((await A.put('/einstellungen', { aktiv: true, zustimmung: true, plz: '00000' })).status, 400)
    const ok = await einschalten(a, '21035', { name: 'Benno und Lotte', text: 'Wir gehen gern am Deich.' })
    assert.equal(ok.status, 200)
    assert.equal(ok.data.aktiv, true)
    assert.equal(ok.data.plz, '21035') // die eigene PLZ sieht nur der Inhaber
    assert.equal(ok.data.name, 'Benno und Lotte')
    assert.equal(ok.headers.get('cache-control'), 'no-store')
  })

  await t.test('Tiere und Erinnerungen: Standard aus, Gesundheit nie öffentlich, privat nicht', async () => {
    let settings = await A.get('/einstellungen')
    assert.deepEqual(settings.data.tiere.map((tier) => tier.sichtbar), [false, false])
    assert.equal((await A.put(`/eintraege/${impfung.id}`, { oeffentlich: true })).status, 400)
    assert.equal((await A.put(`/eintraege/${privat.id}`, { oeffentlich: true })).status, 400)
    const fremd = await entry(b.cookie, (await dog(b.cookie, 'Wilma')).id)
    assert.equal((await A.put(`/eintraege/${fremd.id}`, { oeffentlich: true })).status, 404)
    assert.equal((await A.put(`/eintraege/${oeffentlich.id}`, { oeffentlich: true })).status, 200)
    // Ein Gesundheits-Eintrag, der vorher markiert wurde, bleibt beim Lesen trotzdem draußen.
    db.prepare('INSERT INTO revier_eintraege (entry_id) VALUES (?)').run(impfung.id)
    const fremdesTier = (await call(base, '/api/dogs', { cookie: b.cookie })).data.find((d) => d.name === 'Wilma')
    const put = await A.put('/tiere', { ids: [benno.id, lotte.id, fremdesTier.id] })
    assert.equal(put.status, 200)
    settings = await A.get('/einstellungen')
    assert.deepEqual(settings.data.tiere.map((tier) => tier.sichtbar), [true, true])
    assert.deepEqual((await A.get('/eintraege')).data.ids.sort(), [impfung.id, oeffentlich.id].sort())
  })

  await t.test('Radar: nur Entfernungsstufen, Ort nur mit Schalter, nichts Verräterisches', async () => {
    await einschalten(b, '21029')
    await einschalten(c, '20095', { ortZeigen: true })
    await einschalten(fern, '80331')
    const res = await V.post('/radar', { plz: '21037', umkreis: 50 })
    assert.equal(res.status, 200)
    assert.deepEqual(res.data.profile.map((p) => p.band), ['unter5', '5-10', '10-25'])
    const [pa, pb, pc] = res.data.profile
    assert.equal(pa.name, 'Benno und Lotte')
    assert.equal(pa.ort, undefined)
    assert.equal(pb.name, 'Zuhause Wilma')
    assert.equal(pc.ort, 'Hamburg')
    assert.deepEqual(pa.tiere.map((tier) => tier.name), ['Benno', 'Lotte'])
    assert.equal(pa.neueste.titel, 'Benno am Deich')
    assertNoLeak(res.data.profile, 'radar')
    const nah = await V.post('/radar', { plz: '21037', umkreis: 5 })
    assert.deepEqual(nah.data.profile.map((p) => p.band), ['unter5'])
    const katzen = await V.post('/radar', { plz: '21037', umkreis: 50, tierart: 'katze' })
    assert.deepEqual(katzen.data.profile.map((p) => p.name), ['Benno und Lotte'])
    assert.equal((await V.post('/radar', { plz: '21037', umkreis: 7 })).status, 400)
  })

  await t.test('Profilseite: nur öffentliche Erinnerungen, keine Gesundheit, Fotos sichtbar', async () => {
    const slug = (await A.get('/einstellungen')).data.slug
    const res = await V.get(`/p/${slug}`)
    assert.equal(res.status, 200)
    assert.deepEqual(res.data.eintraege.map((e) => e.titel), ['Benno am Deich'])
    assert.equal(res.data.eigenes, false)
    assertNoLeak(res.data, 'profil')
    const bild = await fetch(`${base}${foto}`, { headers: { Cookie: viewer.cookie } })
    assert.equal(bild.status, 200)
    const vorschau = await A.get('/vorschau')
    assert.deepEqual(vorschau.data.eintraege.map((e) => e.titel), ['Benno am Deich'])
    assert.equal(vorschau.data.eigenes, true)
  })

  await t.test('Folgen, Feed und Follower öffentlich/privat', async () => {
    const slugA = (await A.get('/einstellungen')).data.slug
    assert.equal((await A.post(`/p/${slugA}/folgen`)).status, 400) // nicht sich selbst
    assert.equal((await V.post(`/p/${slugA}/folgen`)).status, 201)
    await api(b.cookie).post(`/p/${slugA}/folgen`)
    const feed = await V.get('/feed')
    assert.deepEqual(feed.data.eintraege.map((e) => e.titel), ['Benno am Deich'])
    assert.equal(feed.data.eintraege[0].profil.slug, slugA)
    assert.equal(feed.data.eintraege[0].text, 'Wind und Wellen.') // nie der Profiltext
    assertNoLeak(feed.data, 'feed')
    let profil = await V.get(`/p/${slugA}`)
    assert.equal(profil.data.folgeIch, true)
    assert.deepEqual(profil.data.follower, { anzahl: 2 })
    await A.put('/einstellungen', { followerOeffentlich: true })
    profil = await V.get(`/p/${slugA}`)
    // Nur Namen öffentlicher Profile - der Kiefernweg hat keins und zählt als „weitere“.
    assert.deepEqual(profil.data.follower, { anzahl: 2, namen: ['Zuhause Wilma'], weitere: 1 })
    const eigene = await A.get('/follower')
    assert.equal(eigene.data.follower.length, 2)
    const kiefernweg = eigene.data.follower.find((f) => f.name === null)
    assert.equal((await A.del(`/follower/${kiefernweg.id}`)).status, 204)
    assert.equal((await V.get(`/p/${slugA}`)).data.folgeIch, false)
    assert.equal((await V.get('/feed')).data.eintraege.length, 0)
    await V.post(`/p/${slugA}/folgen`)
    assert.equal((await V.del(`/p/${slugA}/folgen`)).status, 204)
    assert.equal((await V.get('/folge')).data.profile.length, 0)
  })

  await t.test('Ausblenden: nicht mehr im Radar und Feed, zurückholbar', async () => {
    const slugB = (await api(b.cookie).get('/einstellungen')).data.slug
    assert.equal((await V.post(`/p/${slugB}/ausblenden`)).status, 201)
    let radar = await V.post('/radar', { plz: '21037', umkreis: 50 })
    assert.ok(!radar.data.profile.some((p) => p.slug === slugB))
    assert.deepEqual((await V.get('/ausgeblendet')).data.profile.map((p) => p.slug), [slugB])
    assert.equal((await V.del(`/p/${slugB}/ausblenden`)).status, 204)
    radar = await V.post('/radar', { plz: '21037', umkreis: 50 })
    assert.ok(radar.data.profile.some((p) => p.slug === slugB))
  })

  await t.test('Ausschalten wirkt sofort überall – auch für Fotos', async () => {
    const slugA = (await A.get('/einstellungen')).data.slug
    await V.post(`/p/${slugA}/folgen`)
    await A.put('/einstellungen', { aktiv: false })
    assert.equal((await V.get(`/p/${slugA}`)).status, 404)
    assert.equal((await V.get('/feed')).data.eintraege.length, 0)
    const radar = await V.post('/radar', { plz: '21037', umkreis: 50 })
    assert.ok(!radar.data.profile.some((p) => p.slug === slugA))
    const bild = await fetch(`${base}${foto}`, { headers: { Cookie: viewer.cookie } })
    assert.equal(bild.status, 404)
    // Die Vorschau geht auch ausgeschaltet.
    assert.equal((await A.get('/vorschau')).status, 200)
    await A.put('/einstellungen', { aktiv: true })
  })

  await t.test('Demo und echt nie gemischt', async () => {
    db.prepare('UPDATE families SET is_demo = 1 WHERE id = (SELECT family_id FROM revier_profile WHERE plz = ?)').run('21029')
    const radar = await V.post('/radar', { plz: '21037', umkreis: 50 })
    assert.ok(!radar.data.profile.some((p) => p.name === 'Zuhause Wilma'))
    db.prepare('UPDATE families SET is_demo = 0 WHERE id = (SELECT family_id FROM revier_profile WHERE plz = ?)').run('21029')
  })

  await t.test('Admin kann ein Profil ausschalten', async () => {
    const slugC = (await api(c.cookie).get('/einstellungen')).data.slug
    const adminPut = (cookie, gesperrt) => call(base, `/api/admin/revier/${slugC}`, { method: 'PUT', body: { gesperrt }, cookie })
    assert.equal((await adminPut(c.cookie, true)).status, 401)
    const login = await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: 'admin-test-passwort' } })
    const adminCookie = getCookie(login.res)
    const liste = await call(base, '/api/admin/revier', { cookie: adminCookie })
    assert.ok(liste.data.profile.some((p) => p.slug === slugC && p.aktiv && !p.gesperrt))
    assert.ok(!JSON.stringify(liste.data).includes('20095'))
    assert.equal((await adminPut(adminCookie, true)).status, 200)
    assert.equal((await V.get(`/p/${slugC}`)).status, 404)
    assert.equal((await api(c.cookie).get('/einstellungen')).data.gesperrt, true)
    assert.equal((await adminPut(adminCookie, false)).status, 200)
    assert.equal((await V.get(`/p/${slugC}`)).status, 200)
  })

  await t.test('Rate-Limit auf Folgen', async () => {
    const slugC = (await api(c.cookie).get('/einstellungen')).data.slug
    let last
    for (let i = 0; i < 14; i += 1) last = await V.post(`/p/${slugC}/folgen`)
    assert.equal(last.status, 429)
  })

  await t.test('in einer Familie stellt nur die Leitung das Profil ein', async () => {
    const familie = await createFamily(base, 'Familie Flocke', 'familien-passwort')
    const familyId = db.prepare("SELECT id FROM families WHERE name = 'Familie Flocke'").get().id
    const homeId = db.prepare("SELECT id FROM families WHERE name = 'Zuhause Kiefernweg'").get().id
    db.prepare("INSERT INTO family_members (member_family_id, group_family_id, rolle) VALUES (?, ?, 'mitglied')").run(homeId, familyId)
    const view = await call(base, '/api/view', { method: 'POST', body: { familyId }, cookie: viewer.cookie })
    const memberCookie = (view.res.headers.get('set-cookie') || '').split(';')[0]
    const res = await api(memberCookie).put('/einstellungen', { aktiv: true, plz: '21037', zustimmung: true })
    assert.equal(res.status, 403)
    assert.ok(familie.cookie)
  })

  await t.test('Rate-Limit auf das Radar', async () => {
    let last
    for (let i = 0; i < 15; i += 1) last = await V.post('/radar', { plz: '21037', umkreis: 50 })
    assert.equal(last.status, 429)
  })
})
