const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, createHousehold, getCookie } = require('./helpers')

// Phase P Task 1: Admin-Sperre (partners.gesperrt). Jeder öffentliche Weg behandelt einen gesperrten
// Partner wie "nicht aktiv" - Liste, Umkreis (public + lib/places), Portal, Entdecken, Steckbrief, Portal-
// Tiere, Happy Ends, öffentliche Fotos und die Klick-Weiterleitung. t.test() bleibt auf einer Ebene.
const ADMIN_TEST_PASSWORD = 'admin-test-partner-lock-1'
const dataDir = useTempDataDir('partner-lock', { LOGIN_RATE_LIMIT: '200', CODE_RATE_LIMIT: '200' })

async function uploadPng(base, cookie) {
  const form = new FormData()
  form.append('file', new Blob(['PNG'], { type: 'image/png' }), 'a.png')
  const res = await fetch(`${base}/api/uploads`, { method: 'POST', headers: { Cookie: cookie }, body: form })
  return (await res.json()).url
}

test('Gesperrte Partner verschwinden aus allen öffentlichen Wegen, Status wird pausiert', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const { searchPlaces } = require('../lib/places')
  const { lookupPlz } = require('../lib/geo')

  const adminLogin = await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: ADMIN_TEST_PASSWORD } })
  const adminCookie = getCookie(adminLogin.res)
  const post = (urlPath, body, cookie = adminCookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const put = (urlPath, body, cookie = adminCookie) => call(base, urlPath, { method: 'PUT', body, cookie })
  const get = (urlPath, cookie) => call(base, urlPath, { cookie })

  const household = await createHousehold(base, 'Familie Sperrtest')
  const discover = async () => (await post('/api/discover', { plz: '10115', radius: 10 }, household.cookie)).data

  const schoolInput = { name: 'Hundeschule Riegel', slug: 'hundeschule-riegel', typ: 'hundeschule', plz: '10115', status: 'aktiv', website: 'https://example.org/riegel' }
  const shelterInput = { name: 'Tierheim Riegel', slug: 'tierheim-riegel', typ: 'tierheim', plz: '10115', status: 'aktiv', website: 'https://example.org/tierheim' }

  const school = (await post('/api/admin/partners', schoolInput)).data
  const shelterPartner = (await post('/api/admin/partners', shelterInput)).data
  const shelterArea = (await post(`/api/admin/partners/${shelterPartner.id}/area`)).data
  const shelterLogin = await post('/api/login', { secret: shelterArea.key }, null)
  const shelterCookie = getCookie(shelterLogin.res)

  // Ein veröffentlichtes Tier mit eigenem Foto
  const photoUrl = await uploadPng(base, shelterCookie)
  const photoFile = photoUrl.split('/').pop()
  const dog = (await post('/api/dogs', { name: 'Fibi', geschlecht: 'huendin', tierart: 'hund', vermittlungStatus: 'in_vermittlung', fotoUrl: photoUrl }, shelterCookie)).data
  const animalSlug = (await put(`/api/dogs/${dog.id}/steckbrief`, { published: true }, shelterCookie)).data.public_slug
  assert.ok(animalSlug)

  // Empfehlungen (promotions): eine hängt am Partner, eine an gar keinem - nur die erste verschwindet mit
  // ihrem Partner (Review zu Phase P Task 1).
  function insertPromotion(titel, partnerId) {
    return db
      .prepare(
        `INSERT INTO promotions (partner_id, bereich, kennzeichnung, titel, url, aktiv, is_demo)
         VALUES (?, 'hundeschule', 'Empfehlung', ?, 'https://example.org/empfehlung', 1, 0)`
      )
      .run(partnerId, titel).lastInsertRowid
  }
  const schoolPromotionId = insertPromotion('Welpenkurs im Park', school.id)
  const freePromotionId = insertPromotion('Ratgeber Leinenführigkeit', null)

  async function promotionRedirectStatus(id) {
    return (await fetch(`${base}/r/promotion/${id}`, { redirect: 'manual' })).status
  }

  async function nearSlugs() {
    return (await post('/api/public/partners/near', { plz: '10115', radius: 10 }, null)).data.map((p) => p.slug)
  }

  async function placesPartnerIds() {
    const center = lookupPlz('10115')
    const { results } = await searchPlaces(
      db,
      { lat: center.lat, lon: center.lon, radiusKm: 10, isDemo: false, homeId: household.data.id },
      { providers: { fixture: async () => [], overpass: async () => [] } }
    )
    return results.filter((r) => r.quelle === 'partner').map((r) => r.slug)
  }

  async function assertVisible(expected) {
    const list = (await get('/api/public/partners')).data.map((p) => p.slug)
    assert.equal(list.includes('hundeschule-riegel'), expected.school, 'öffentliche Liste')
    assert.equal(list.includes('tierheim-riegel'), expected.shelter, 'öffentliche Liste (Tierheim)')
    assert.equal((await nearSlugs()).includes('hundeschule-riegel'), expected.school, 'Umkreis /near')
    assert.equal((await placesPartnerIds()).includes('hundeschule-riegel'), expected.school, 'lib/places')
    assert.equal((await get('/api/public/partners/hundeschule-riegel')).status, expected.school ? 200 : 404, 'Portal')

    const found = await discover()
    assert.equal(found.hundeschulen.some((c) => c.slug === 'hundeschule-riegel'), expected.school, 'Entdecken hundeschulen')
    assert.equal(found.begleiter.partner.some((c) => c.slug === 'tierheim-riegel'), expected.shelter, 'Entdecken begleiter.partner')
    assert.equal(found.begleiter.tiere.some((c) => c.slug === animalSlug), expected.shelter, 'Entdecken begleiter.tiere')
    const promotionIds = found.hundeschulen.filter((c) => c.kind === 'promotion').map((c) => c.id)
    assert.equal(promotionIds.includes(schoolPromotionId), expected.school, 'Empfehlung des Partners in Entdecken')
    assert.ok(promotionIds.includes(freePromotionId), 'Empfehlung ohne Partner bleibt in Entdecken')
    assert.equal(await promotionRedirectStatus(schoolPromotionId), expected.school ? 302 : 404, 'Klick-Weiterleitung Empfehlung')
    assert.equal(await promotionRedirectStatus(freePromotionId), 302, 'Klick-Weiterleitung Empfehlung ohne Partner')

    const shelterStatus = expected.shelter ? 200 : 404
    assert.equal((await get(`/api/public/animals/${animalSlug}`)).status, shelterStatus, 'Steckbrief')
    assert.equal((await get('/api/public/partners/tierheim-riegel/animals')).status, shelterStatus, 'Portal-Tiere')
    assert.equal((await get('/api/public/partners/tierheim-riegel/happy-ends')).status, shelterStatus, 'Happy Ends')
    assert.equal((await fetch(`${base}/public-media/${photoFile}`)).status, shelterStatus, 'öffentliches Foto')
    const redirect = await fetch(`${base}/r/partner-website/${school.id}`, { redirect: 'manual' })
    assert.equal(redirect.status, expected.school ? 302 : 404, 'Klick-Weiterleitung')
  }

  await t.test('vorher: beide Partner überall sichtbar', async () => {
    await assertVisible({ school: true, shelter: true })
  })

  await t.test('PUT gesperrt: true setzt status pausiert, obwohl der Datensatz aktiv mitschickt', async () => {
    const locked = await put(`/api/admin/partners/${school.id}`, { ...schoolInput, gesperrt: true })
    assert.equal(locked.status, 200)
    assert.equal(locked.data.gesperrt, 1)
    assert.equal(locked.data.status, 'pausiert')

    // Solange gesperrt, bleibt es pausiert - auch wenn ein Update ohne gesperrt-Feld wieder aktiv verlangt
    const stillLocked = await put(`/api/admin/partners/${school.id}`, schoolInput)
    assert.equal(stillLocked.data.gesperrt, 1)
    assert.equal(stillLocked.data.status, 'pausiert')

    assert.equal((await put(`/api/admin/partners/${school.id}`, { ...schoolInput, gesperrt: 'ja' })).status, 400)
    assert.equal((await put(`/api/admin/partners/${shelterPartner.id}`, { ...shelterInput, gesperrt: true })).status, 200)
  })

  await t.test('gesperrt: aus Liste, Umkreis, Portal, Entdecken, Steckbrief, Fotos und Weiterleitung verschwunden', async () => {
    await assertVisible({ school: false, shelter: false })

    // Der Admin sieht das Portal weiterhin als Vorschau
    const preview = await get('/api/public/partners/hundeschule-riegel', adminCookie)
    assert.equal(preview.status, 200)
    assert.equal(preview.data.preview, true)

    // GET /api/admin/partners und me.partner melden die Sperre
    const row = (await get('/api/admin/partners', adminCookie)).data.find((p) => p.id === school.id)
    assert.equal(row.gesperrt, 1)
    assert.equal((await get('/api/me', shelterCookie)).data.partner.gesperrt, true)
  })

  await t.test('Verteidigungslinie: gesperrt=1 mit status aktiv (Rohdaten) bleibt trotzdem verborgen', async () => {
    db.prepare("UPDATE partners SET status = 'aktiv' WHERE id IN (?, ?)").run(school.id, shelterPartner.id)
    await assertVisible({ school: false, shelter: false })
  })

  await t.test('Entsperren und wieder aktivieren: alles wieder sichtbar', async () => {
    const unlocked = await put(`/api/admin/partners/${school.id}`, { ...schoolInput, gesperrt: false })
    assert.equal(unlocked.data.gesperrt, 0)
    assert.equal(unlocked.data.status, 'aktiv')
    await put(`/api/admin/partners/${shelterPartner.id}`, { ...shelterInput, gesperrt: false })
    await assertVisible({ school: true, shelter: true })
  })
})
