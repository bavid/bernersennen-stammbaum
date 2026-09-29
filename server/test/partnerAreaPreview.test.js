const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, createFamily, createHousehold, getCookie } = require('./helpers')

// Phase P Task 3c: Vorschau-Daten für die "Kundensicht" (/api/partner-area/preview/*) - das eigene Portal,
// "Entdecken" aus Sicht der Demo-Kundschaft mit der eigenen Karte zuerst und der eigene Steckbrief, jeweils
// auch als Entwurf. t.test() bleibt auf einer Ebene.
const ADMIN_TEST_PASSWORD = 'admin-test-partner-preview-1'
const dataDir = useTempDataDir('partner-preview', { LOGIN_RATE_LIMIT: '300', CODE_RATE_LIMIT: '300' })

const PORTAL_TEXT = 'So sieht es bei uns aus: kleine Gruppen, viel Geduld und jede Menge Leckerli für alle.'
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xd9])

test('Kundensicht: Vorschau-Daten für Portal, Entdecken und Steckbrief', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const config = require('../config')
  const { replaceDemoPack } = require('../lib/demoPack')
  replaceDemoPack(db, config.uploadDir)

  const adminLogin = await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: ADMIN_TEST_PASSWORD } })
  const adminCookie = getCookie(adminLogin.res)
  const get = (urlPath, cookie) => call(base, urlPath, { cookie })
  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const put = (urlPath, body, cookie) => call(base, urlPath, { method: 'PUT', body, cookie })
  const previewDiscover = (body, cookie) => post('/api/partner-area/preview/discover', body, cookie)
  const fetchStatus = async (urlPath, cookie) => (await fetch(`${base}${urlPath}`, { headers: cookie ? { Cookie: cookie } : {} })).status

  let counter = 0
  async function createPartnerArea(overrides = {}) {
    counter += 1
    const input = { name: `Vorschau Partner ${counter}`, slug: `vorschau-partner-${counter}`, typ: 'hundeschule', plz: '10115', portalText: PORTAL_TEXT, status: 'entwurf', ...overrides }
    const partner = await post('/api/admin/partners', input, adminCookie)
    assert.equal(partner.status, 201)
    const area = await post(`/api/admin/partners/${partner.data.id}/area`, undefined, adminCookie)
    assert.equal(area.status, 201)
    const login = await post('/api/login', { secret: area.data.key })
    return { partner: partner.data, familyId: area.data.familyId, cookie: getCookie(login.res) }
  }

  async function postEinblick(cookie, datum) {
    const form = new FormData()
    form.append('datum', datum)
    form.append('einwilligung', 'true')
    form.append('foto', new Blob([JPEG], { type: 'image/jpeg' }), 'e.jpg')
    const res = await fetch(`${base}/api/partner-area/einblicke`, { method: 'POST', headers: { Cookie: cookie }, body: form })
    assert.equal(res.status, 201)
    return res.json()
  }

  async function uploadPhoto(cookie) {
    const form = new FormData()
    form.append('file', new Blob([JPEG], { type: 'image/jpeg' }), 'tier.jpg')
    const res = await fetch(`${base}/api/uploads`, { method: 'POST', headers: { Cookie: cookie }, body: form })
    return (await res.json()).url
  }

  async function createDog(cookie, name, { vermittlungStatus = 'in_vermittlung', published = false, withPhoto = true } = {}) {
    const fotoUrl = withPhoto ? await uploadPhoto(cookie) : undefined
    const dog = await post('/api/dogs', { name, geschlecht: 'ruede', tierart: 'hund', vermittlungStatus, ...(fotoUrl ? { fotoUrl } : {}) }, cookie)
    assert.equal(dog.status, 201)
    let slug = null
    if (published) {
      const steckbrief = await put(`/api/dogs/${dog.data.id}/steckbrief`, { published: true }, cookie)
      assert.equal(steckbrief.status, 200)
      slug = steckbrief.data.public_slug
    }
    return { id: dog.data.id, slug, fotoUrl }
  }

  const partnerIdsOf = (cards) => cards.filter((card) => card.kind !== 'promotion').map((card) => card.id)

  await t.test('aus Zuhause oder Rudel 403, ohne Sitzung 401', async () => {
    const household = await createHousehold(base, 'Familie Vorschaulos')
    const rudel = await createFamily(base, 'Rudel Vorschaulos', 'rudel-vorschau-pw')
    for (const cookie of [household.cookie, rudel.cookie]) {
      assert.equal((await get('/api/partner-area/preview/portal', cookie)).status, 403)
      assert.equal((await previewDiscover({}, cookie)).status, 403)
      assert.equal((await get('/api/partner-area/preview/animals/1', cookie)).status, 403)
    }
    assert.equal((await get('/api/partner-area/preview/portal')).status, 401)
  })

  await t.test('Portal-Vorschau: auch als Entwurf, ohne ausgeblendete Einblicke - das öffentliche Portal bleibt 404', async () => {
    const { partner, cookie } = await createPartnerArea({ portalTitel: 'Willkommen', farbe: '#1f5f8b' })
    const shown = await postEinblick(cookie, '2026-09-01')
    const hidden = await postEinblick(cookie, '2026-09-02')
    await post(`/api/admin/einblicke/${hidden.id}/ausblenden`, { ausgeblendet: true }, adminCookie)

    assert.equal((await get(`/api/public/partners/${partner.slug}`)).status, 404)
    const preview = await get('/api/partner-area/preview/portal', cookie)
    assert.equal(preview.status, 200)
    assert.equal(preview.data.vorschau, true)
    assert.equal(preview.data.status, 'entwurf')
    assert.equal(preview.data.slug, partner.slug)
    assert.equal(preview.data.portal_titel, 'Willkommen')
    assert.equal(preview.data.portal_text, PORTAL_TEXT)
    assert.equal(preview.data.farbe, '#1f5f8b')
    assert.deepEqual(preview.data.einblicke.map((e) => e.id), [shown.id])
    // Fotos über /uploads: ein Entwurf gibt über /public-media nichts frei, der eigene Bereich sieht sie trotzdem
    assert.equal(preview.data.einblicke[0].fotoUrl, shown.fotoUrl)
    assert.equal(await fetchStatus(shown.fotoUrl, cookie), 200)
    assert.equal(await fetchStatus(`/public-media/${shown.fotoUrl.split('/').pop()}`), 404)

    // Dieselbe Form wie das öffentliche Portal, sobald veröffentlicht
    assert.equal((await post('/api/partner-area/profile/publish', { aktiv: true }, cookie)).status, 200)
    const publicPortal = await get(`/api/public/partners/${partner.slug}`)
    assert.equal(publicPortal.status, 200)
    const previewKeys = new Set(Object.keys((await get('/api/partner-area/preview/portal', cookie)).data))
    for (const key of Object.keys(publicPortal.data)) assert.ok(previewKeys.has(key), `Vorschau enthält ${key}`)
    assert.deepEqual(publicPortal.data.einblicke.map((e) => e.id), [shown.id])

    // Auch gesperrt bleibt die Vorschau erreichbar
    await put(`/api/admin/partners/${partner.id}`, { name: partner.name, typ: partner.typ, plz: '10115', portalText: PORTAL_TEXT, gesperrt: true }, adminCookie)
    const locked = await get('/api/partner-area/preview/portal', cookie)
    assert.equal(locked.status, 200)
    assert.equal(locked.data.status, 'pausiert')
    assert.equal((await get(`/api/public/partners/${partner.slug}`)).status, 404)
  })

  await t.test('Portal-Vorschau Tierheim: dieselben Tiere wie das öffentliche Portal', async () => {
    const shelter = await createPartnerArea({ typ: 'tierheim', status: 'aktiv' })
    const listed = await createDog(shelter.cookie, 'Benno', { published: true })
    const paused = await createDog(shelter.cookie, 'Anton', { published: true, vermittlungStatus: 'pausiert' })
    await createDog(shelter.cookie, 'Carlo', { published: false })

    const publicAnimals = (await get(`/api/public/partners/${shelter.partner.slug}/animals`)).data
    const preview = (await get('/api/partner-area/preview/portal', shelter.cookie)).data
    assert.deepEqual(preview.tiere.map((tier) => tier.slug), publicAnimals.map((tier) => tier.slug))
    assert.deepEqual(preview.tiere.map((tier) => tier.slug).sort(), [listed.slug, paused.slug].sort())
    assert.equal(preview.tiere.find((tier) => tier.slug === listed.slug).fotoUrl, listed.fotoUrl)

    const school = await createPartnerArea()
    assert.deepEqual((await get('/api/partner-area/preview/portal', school.cookie)).data.tiere, [])
  })

  await t.test('Entdecken-Vorschau: eigene Karte zuerst mit vorschau, auch als Entwurf; sonst Demo-Sicht', async () => {
    const { partner, cookie } = await createPartnerArea({ name: 'Hundeschule Vorschaustern', slug: 'vorschaustern' })
    const teaser = await postEinblick(cookie, '2026-09-10')

    const res = await previewDiscover({}, cookie)
    assert.equal(res.status, 200)
    const [own, ...rest] = res.data.hundeschulen
    assert.equal(own.id, partner.id)
    assert.equal(own.vorschau, true)
    assert.equal(own.kind, 'partner')
    assert.equal(own.name, 'Hundeschule Vorschaustern')
    assert.equal(own.teaserFoto, teaser.fotoUrl, 'Teaser über /uploads - der Entwurf ist nicht öffentlich')
    assert.ok(!partnerIdsOf(rest).includes(partner.id))
    // Der Rest ist die Demo-Sicht: nur Demo-Partner, keine echten
    const demoIds = new Set(db.prepare('SELECT id FROM partners WHERE is_demo = 1').all().map((row) => row.id))
    assert.ok(partnerIdsOf(rest).length > 0)
    assert.ok(partnerIdsOf(rest).every((id) => demoIds.has(id)))
    assert.ok(res.data.begleiter.partner.every((card) => demoIds.has(card.id)))
    assert.equal(res.data.vorschauHinweis, undefined)

    // Mit PLZ: Entfernung auch für die eigene Karte
    const near = await previewDiscover({ plz: '20095', radius: 10 }, cookie)
    assert.equal(near.status, 200)
    assert.equal(near.data.hundeschulen[0].id, partner.id)
    assert.ok(near.data.hundeschulen[0].distanceKm > 200)
    assert.equal(near.data.hundeschulen[0].ausserhalb, true)
    assert.equal((await previewDiscover({ plz: '00000', radius: 10 }, cookie)).status, 400)
    assert.equal((await previewDiscover({ plz: '10115', radius: 7 }, cookie)).status, 400)
  })

  await t.test('Entdecken-Vorschau Tierheim: eigene Karte und eigene gelistete Tiere zuerst, keine Duplikate', async () => {
    const shelter = await createPartnerArea({ typ: 'tierheim', status: 'aktiv', spendenUrl: 'https://example.org/spenden' })
    const listed = await createDog(shelter.cookie, 'Emil', { published: true })
    await createDog(shelter.cookie, 'Fritz', { published: true, vermittlungStatus: 'pausiert' })
    await createDog(shelter.cookie, 'Gustav', { published: false })

    const res = (await previewDiscover({}, shelter.cookie)).data
    assert.equal(res.begleiter.partner[0].id, shelter.partner.id)
    assert.equal(res.begleiter.partner[0].vorschau, true)
    assert.deepEqual(res.begleiter.tiere.slice(0, 1).map((tier) => tier.slug), [listed.slug], 'nur gelistete eigene Tiere, vorn')
    assert.equal(res.begleiter.tiere[0].fotoUrl, listed.fotoUrl)
    assert.equal(res.unterstuetzen.partnerSpenden[0].id, shelter.partner.id)
    assert.equal(res.unterstuetzen.partnerSpenden[0].vorschau, true)
    assert.ok(!res.hundeschulen.some((card) => card.kind === 'partner' && card.id === shelter.partner.id))

    // Das Demo-Tierheim selbst: es steckt schon in der Demo-Sicht - trotzdem nur einmal, vorn
    const demoLogin = await post('/api/demo', { as: 'tierheim' })
    assert.equal(demoLogin.status, 200)
    const demoCookie = getCookie(demoLogin.res)
    const demoPartnerId = demoLogin.data.partner.id
    const demo = await previewDiscover({}, demoCookie)
    assert.equal(demo.status, 200, 'die Vorschau ist lesend und bleibt für Demo-Sitzungen offen')
    assert.equal(demo.data.begleiter.partner[0].id, demoPartnerId)
    assert.equal(demo.data.begleiter.partner.filter((card) => card.id === demoPartnerId).length, 1)
    assert.equal(demo.data.unterstuetzen.partnerSpenden.filter((card) => card.id === demoPartnerId).length, 1)
    const slugs = demo.data.begleiter.tiere.map((tier) => tier.slug)
    assert.equal(new Set(slugs).size, slugs.length, 'kein Tier doppelt')
    const ownSlugs = db
      .prepare("SELECT d.public_slug FROM dogs d JOIN families f ON f.id = d.family_id WHERE f.partner_id = ? AND d.public_slug IS NOT NULL AND d.vermittlung_status IN ('in_vermittlung', 'reserviert')")
      .all(demoPartnerId)
      .map((row) => row.public_slug)
    assert.ok(ownSlugs.length > 0)
    assert.deepEqual(new Set(slugs.slice(0, ownSlugs.length)), new Set(ownSlugs))
  })

  await t.test('Entdecken-Vorschau: Salon/Betreuung im Abschnitt salon (Phase P2 Task 9), Futter/Sonstige nur mit Hinweis', async () => {
    for (const typ of ['hundesalon', 'betreuung']) {
      const { partner, cookie } = await createPartnerArea({ typ })
      const res = (await previewDiscover({}, cookie)).data
      assert.equal(res.salon[0].id, partner.id, typ)
      assert.equal(res.salon[0].vorschau, true)
      assert.ok(!res.hundeschulen.some((card) => card.kind === 'partner' && card.id === partner.id), typ)
    }
    for (const typ of ['futter', 'sonstige']) {
      const { partner, cookie } = await createPartnerArea({ typ })
      const res = (await previewDiscover({}, cookie)).data
      assert.equal(res.vorschauHinweis, 'Euer Profil erscheint in der Partnerliste und auf eurem Portal.')
      const allCards = [...res.hundeschulen, ...res.begleiter.partner, ...res.unterstuetzen.partnerSpenden]
      assert.ok(!allCards.some((card) => card.id === partner.id && card.kind !== 'promotion'), typ)
    }
  })

  await t.test('Steckbrief-Vorschau: eigenes Tier auch unveröffentlicht, fremdes oder unbekanntes 404', async () => {
    const shelter = await createPartnerArea({ typ: 'tierheim', status: 'entwurf', kontaktEmail: 'team@example.org' })
    const dog = await createDog(shelter.cookie, 'Hugo', { published: false })
    const entry = (titel, isPublic) => post('/api/timeline', { dogId: dog.id, autorName: 'Team', datum: '2026-09-01', titel, isPublic }, shelter.cookie)
    assert.equal((await entry('Erster Spaziergang', true)).status, 201)
    assert.equal((await entry('Tierarzt intern', false)).status, 201)

    const res = await get(`/api/partner-area/preview/animals/${dog.id}`, shelter.cookie)
    assert.equal(res.status, 200)
    assert.equal(res.data.vorschau, true)
    assert.equal(res.data.name, 'Hugo')
    assert.equal(res.data.vermittlung_status, 'in_vermittlung')
    assert.equal(res.data.fotoUrl, dog.fotoUrl)
    assert.deepEqual(res.data.entries.map((entry) => entry.titel), ['Erster Spaziergang'])
    assert.equal(res.data.shelter.slug, shelter.partner.slug)
    assert.equal(res.data.shelter.kontakt_email, 'team@example.org')

    const other = await createPartnerArea({ typ: 'tierheim', status: 'aktiv' })
    const foreignDog = await createDog(other.cookie, 'Ida', { published: true })
    assert.equal((await get(`/api/partner-area/preview/animals/${foreignDog.id}`, shelter.cookie)).status, 404)
    assert.equal((await get('/api/partner-area/preview/animals/999999', shelter.cookie)).status, 404)
    assert.equal((await get('/api/partner-area/preview/animals/abc', shelter.cookie)).status, 404)

    // Der öffentliche Steckbrief hat dieselbe Form
    const published = await get(`/api/public/animals/${foreignDog.slug}`)
    assert.equal(published.status, 200)
    const previewKeys = new Set(Object.keys(res.data))
    for (const key of Object.keys(published.data)) assert.ok(previewKeys.has(key), `Vorschau enthält ${key}`)
  })
})
