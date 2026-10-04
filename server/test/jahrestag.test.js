const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, createFamily, createHousehold, getCookie } = require('./helpers')

const dataDir = useTempDataDir('jahrestag', { LOGIN_RATE_LIMIT: '300', CODE_RATE_LIMIT: '300' })

// B+ Familienalbum: Karte „Heute vor einem Jahr“ auf Start (routes/timeline.js GET /api/timeline/jahrestag) - Erinnerungen
// vom selben Tag in früheren Jahren, mit denselben Sichtregeln wie GET /api/timeline/recent.
test('Heute vor … Jahren: gleicher Tag, frühere Jahre, nur was der Bereich sehen darf', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')

  const get = (urlPath, cookie) => call(base, urlPath, { cookie })
  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const entry = async (cookie, dogId, datum, titel, extra = {}) =>
    (await post('/api/timeline', { dogId, autorName: 'Test', datum, titel, ...extra }, cookie)).data

  const home = await createHousehold(base, 'Zuhause Lindenhof')
  const other = await createHousehold(base, 'Zuhause Möwenweg')
  const nele = (await post('/api/dogs', { name: 'Nele', geschlecht: 'huendin' }, home.cookie)).data
  const benno = (await post('/api/dogs', { name: 'Benno', geschlecht: 'ruede' }, other.cookie)).data
  db.prepare('INSERT INTO dog_shares (dog_id, family_id) VALUES (?, ?)').run(benno.id, home.data.id)

  await entry(home.cookie, nele.id, '2025-10-04', 'Erster Schnee')
  await entry(home.cookie, nele.id, '2023-10-04', 'Am Deich')
  await entry(home.cookie, nele.id, '2024-10-04', 'Nur für uns', { privat: true })
  await entry(home.cookie, nele.id, '2026-10-04', 'Heute selbst')
  await entry(home.cookie, nele.id, '2025-10-05', 'Ein Tag später')
  await entry(other.cookie, benno.id, '2022-06-01', 'Benno am Strand')
  await entry(other.cookie, benno.id, '2021-06-01', 'Benno privat', { privat: true })

  await t.test('ohne Anmeldung 401, ohne gültigen Tag 400', async () => {
    assert.equal((await get('/api/timeline/jahrestag?tag=2026-10-04', '')).status, 401)
    for (const tag of ['', '04.10.2026', '2026-13-01', 'x']) {
      assert.equal((await get(`/api/timeline/jahrestag?tag=${encodeURIComponent(tag)}`, home.cookie)).status, 400, tag)
    }
    // Review B+ (L2): ein mehrfach angegebener oder als Liste geschickter Tag ist kein Tag
    assert.equal((await get('/api/timeline/jahrestag?tag=2026-10-04&tag=2026-10-05', home.cookie)).status, 400)
    assert.equal((await get('/api/timeline/jahrestag?tag[]=2026-10-04', home.cookie)).status, 400)
    assert.equal((await get('/api/timeline/jahrestag', home.cookie)).status, 400)
  })

  await t.test('eigenes Zuhause: gleicher Tag in früheren Jahren (auch eigene private), geteilte nicht-private, neueste zuerst', async () => {
    const res = await get('/api/timeline/jahrestag?tag=2026-10-04', home.cookie)
    assert.equal(res.status, 200)
    assert.deepEqual(
      res.data.map((item) => item.titel),
      ['Erster Schnee', 'Nur für uns', 'Am Deich']
    )
    assert.equal(res.data[0].dog_name, 'Nele')
    assert.deepEqual(res.data[0].foto_urls, [])
    assert.equal(res.data[0].comment_count, 0)
  })

  await t.test('höchstens drei; ein geteiltes Tier zählt mit, seine privaten Erinnerungen nie', async () => {
    await entry(home.cookie, nele.id, '2020-10-04', 'Ganz früher')
    const res = await get('/api/timeline/jahrestag?tag=2026-10-04', home.cookie)
    assert.equal(res.data.length, 3)
    const shared = await get('/api/timeline/jahrestag?tag=2026-06-01', home.cookie)
    assert.deepEqual(
      shared.data.map((item) => item.titel),
      ['Benno am Strand']
    )
  })

  await t.test('das andere Zuhause sieht nur seine eigenen', async () => {
    assert.deepEqual((await get('/api/timeline/jahrestag?tag=2026-10-04', other.cookie)).data, [])
    const res = await get('/api/timeline/jahrestag?tag=2026-06-01', other.cookie)
    assert.deepEqual(
      res.data.map((item) => item.titel),
      ['Benno am Strand', 'Benno privat']
    )
  })

  await t.test('an einem Tag ohne frühere Erinnerung: leer', async () => {
    const res = await get('/api/timeline/jahrestag?tag=2026-03-01', home.cookie)
    assert.equal(res.status, 200)
    assert.deepEqual(res.data, [])
  })

  // Review B+ (L2): Grüße je Bereich gezählt, Besuch gesperrt, klassische Familie und Demo lesen.
  await t.test('Grüße zählen je Bereich wie in /recent: der Eigentümer alle, andere ihre eigenen und die des Eigentümers', async () => {
    const third = await createHousehold(base, 'Zuhause Heidekamp')
    db.prepare('INSERT INTO dog_shares (dog_id, family_id) VALUES (?, ?)').run(benno.id, third.data.id)
    const strand = (await get('/api/timeline/jahrestag?tag=2026-06-01', other.cookie)).data.find((item) => item.titel === 'Benno am Strand')
    const greet = (cookie, text) => post(`/api/timeline/${strand.id}/comments`, { autorName: 'Test', text }, cookie)
    assert.equal((await greet(other.cookie, 'vom Eigentümer')).status, 201)
    assert.equal((await greet(home.cookie, 'vom Lindenhof')).status, 201)
    assert.equal((await greet(third.cookie, 'vom Heidekamp')).status, 201)
    const countIn = async (cookie) =>
      (await get('/api/timeline/jahrestag?tag=2026-06-01', cookie)).data.find((item) => item.id === strand.id).comment_count
    assert.equal(await countIn(other.cookie), 3)
    assert.equal(await countIn(home.cookie), 2)
    assert.equal(await countIn(third.cookie), 2)
  })

  await t.test('zu Besuch (Besuchs-Sitzung) gesperrt - die Karte gehört ins eigene Zuhause', async () => {
    const invite = await post('/api/besuche/einladungen', {}, other.cookie)
    assert.equal((await post('/api/besuche/einloesen', { code: invite.data.code }, home.cookie)).status, 201)
    const visit = await post('/api/view', { familyId: other.data.id }, home.cookie)
    assert.equal(visit.data.zuBesuch, true)
    assert.equal((await get('/api/timeline/jahrestag?tag=2026-06-01', getCookie(visit.res))).status, 403)
  })

  await t.test('klassischer Familien-Login liest seine Erinnerungen; die Demo liest auch', async () => {
    const rudel = await createFamily(base, 'Rudel Talblick', 'talblick-passwort')
    const luna = (await post('/api/dogs', { name: 'Luna', geschlecht: 'huendin' }, rudel.cookie)).data
    await entry(rudel.cookie, luna.id, '2024-10-04', 'Luna an der Aare')
    const res = await get('/api/timeline/jahrestag?tag=2026-10-04', rudel.cookie)
    assert.equal(res.status, 200)
    assert.deepEqual(res.data.map((item) => item.titel), ['Luna an der Aare'])

    db.prepare('UPDATE families SET is_demo = 1 WHERE id = ?').run(rudel.data.id)
    const demo = await call(base, '/api/demo', { method: 'POST', body: { as: 'rudel' } })
    assert.equal(demo.status, 200)
    const demoRes = await get('/api/timeline/jahrestag?tag=2026-10-04', getCookie(demo.res))
    assert.equal(demoRes.status, 200)
    assert.deepEqual(demoRes.data.map((item) => item.titel), ['Luna an der Aare'])
  })
})
