const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, createHousehold, getCookie } = require('./helpers')

// Phase P2 Task 9: eigener Abschnitt "salon" in "Entdecken" für Hundesalons und Betreuung - Partner-Karten
// mit demselben Umkreis/Fallback wie hundeschulen (fallback.salon) und freigegebene Beiträge mit bereich
// 'salon'. Dazu die Kundensicht der Partner (/preview/discover). t.test() bleibt auf einer Ebene; POST
// /api/discover und /preview/discover teilen sich 30 Anfragen je IP - dieser Test bleibt darunter.
const ADMIN_TEST_PASSWORD = 'admin-test-discover-salon-1'
const dataDir = useTempDataDir('discover-salon', { LOGIN_RATE_LIMIT: '300', CODE_RATE_LIMIT: '300' })

const PORTAL_TEXT = 'Bei uns bekommt euer Hund Zeit, Ruhe und eine Pflege, die zu seinem Fell passt.'
const MUENCHEN = { lat: 48.137, lon: 11.575 }
const ROM = { lat: 41.9, lon: 12.5 }

test('Entdecken: Abschnitt salon für Hundesalons und Betreuung', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const { lookupPlz } = require('../lib/geo')
  const berlin = lookupPlz('10115')

  const adminLogin = await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: ADMIN_TEST_PASSWORD } })
  const adminCookie = getCookie(adminLogin.res)
  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const household = await createHousehold(base, 'Familie Salonsuche')
  const discover = async (body = {}) => {
    const res = await post('/api/discover', body, household.cookie)
    assert.equal(res.status, 200)
    return res.data
  }
  const partnerSlugs = (cards) => cards.filter((card) => card.kind === 'partner').map((card) => card.slug)
  // Phase V1: Anzeigen eines Partners stehen auf seiner Karte (anzeigen), nur die übrigen als eigene Karten.
  const shownPromotions = (cards) => cards.flatMap((card) => (card.kind === 'promotion' ? [card] : card.anzeigen || []))
  const promotionIds = (cards) => shownPromotions(cards).map((card) => card.id)

  let counter = 0
  function insertPartner(typ, { lat = berlin.lat, lon = berlin.lon, name } = {}) {
    counter += 1
    const slug = `salon-test-${counter}`
    db.prepare(
      `INSERT INTO partners (slug, name, typ, status, lat, lon) VALUES (?, ?, ?, 'aktiv', ?, ?)`
    ).run(slug, name || `Partner ${counter}`, typ, lat, lon)
    return slug
  }

  async function createPartnerArea(typ, overrides = {}) {
    counter += 1
    const input = { name: `Salon Bereich ${counter}`, slug: `salon-bereich-${counter}`, typ, plz: '10115', portalText: PORTAL_TEXT, status: 'aktiv', ...overrides }
    const partner = await post('/api/admin/partners', input, adminCookie)
    assert.equal(partner.status, 201)
    const area = await post(`/api/admin/partners/${partner.data.id}/area`, undefined, adminCookie)
    const login = await post('/api/login', { secret: area.data.key })
    return { partner: partner.data, cookie: getCookie(login.res) }
  }

  const salonA = insertPartner('hundesalon', { name: 'Salon Anker' })
  const sitter = insertPartner('betreuung', { name: 'Betreuung Birke' })
  const school = insertPartner('hundeschule', { name: 'Hundeschule Clara' })
  const salonMuenchen = insertPartner('hundesalon', { ...MUENCHEN, name: 'Salon München' })
  const salonRom = insertPartner('betreuung', { ...ROM, name: 'Betreuung Rom' })

  await t.test('ohne PLZ: Hundesalons und Betreuung stehen in salon, nicht mehr bei den Hundeschulen', async () => {
    const res = await discover()
    assert.deepEqual(res.fallback, { hundeschulen: false, salon: false, begleiter: false })
    assert.deepEqual(new Set(partnerSlugs(res.salon)), new Set([salonA, sitter, salonMuenchen, salonRom]))
    assert.deepEqual(partnerSlugs(res.hundeschulen), [school])
    assert.ok(res.salon.every((card) => card.kind === 'partner' || card.kind === 'promotion'))
    const names = res.salon.filter((card) => card.kind === 'partner').map((card) => card.name)
    assert.deepEqual(names, names.slice().sort((a, b) => a.localeCompare(b, 'de')), 'nach Name')
  })

  await t.test('Umkreis-Fallback wie bei den Hundeschulen: weniger als 5 im Radius -> die nächsten außerhalb', async () => {
    const res = await discover({ plz: '10115', radius: 10 })
    assert.equal(res.fallback.salon, true)
    const cards = res.salon.filter((card) => card.kind === 'partner')
    const inRadius = cards.filter((card) => card.ausserhalb === false)
    assert.deepEqual(new Set(inRadius.map((card) => card.slug)), new Set([salonA, sitter]))
    assert.ok(inRadius.every((card) => card.distanceKm < 1))
    const outside = cards.filter((card) => card.ausserhalb === true)
    assert.deepEqual(outside.map((card) => card.slug), [salonMuenchen, salonRom], 'nach Entfernung')
    assert.deepEqual(cards.slice(0, 2), inRadius, 'im Radius zuerst, dann die ergänzten')

    for (let i = 0; i < 3; i += 1) insertPartner('hundesalon', { name: `Salon Nah ${i}` })
    insertPartner('hundeschule', { ...ROM, name: 'Hundeschule Rom' })
    const full = await discover({ plz: '10115', radius: 10 })
    assert.equal(full.fallback.salon, false, '5 im Radius -> kein Fallback')
    assert.ok(!full.salon.some((card) => card.ausserhalb === true))
    assert.equal(full.fallback.hundeschulen, true, 'die Hundeschulen haben ihren eigenen Fallback')
  })

  await t.test('Beiträge mit bereich salon: erst nach der Freigabe in salon, nie bei den Hundeschulen', async () => {
    const area = await createPartnerArea('hundesalon')
    const created = await post('/api/partner-area/posts', { titel: 'Herbst-Pflegetag', bereich: 'salon', url: 'https://example.org/pflegetag' }, area.cookie)
    assert.equal(created.status, 201)
    const id = created.data.id

    let res = await discover()
    assert.ok(!promotionIds(res.salon).includes(id))
    assert.equal((await post(`/api/admin/promotions/${id}/freigeben`, undefined, adminCookie)).status, 200)

    res = await discover()
    const partnerCard = res.salon.find((c) => c.kind === 'partner' && c.id === area.partner.id)
    const card = partnerCard.anzeigen.find((c) => c.id === id)
    assert.ok(card, 'freigegebener Salon-Beitrag steht auf der Karte des Salons')
    assert.equal(card.kennzeichnung, 'Anzeige')
    assert.equal(card.clickUrl, `/r/promotion/${id}`)
    assert.ok(!res.salon.some((c) => c.kind === 'promotion' && c.id === id), 'keine eigene Karte mehr')
    assert.ok(!promotionIds(res.hundeschulen).includes(id))
  })

  await t.test('Kundensicht: eigene Karte und eigene Salon-Beiträge vorn in salon, für Hundesalon und Betreuung', async () => {
    for (const typ of ['hundesalon', 'betreuung']) {
      const area = await createPartnerArea(typ, { status: 'entwurf' })
      const own = (await post('/api/partner-area/posts', { titel: `Eigener Beitrag ${typ}`, bereich: 'salon' }, area.cookie)).data
      const res = await post('/api/partner-area/preview/discover', {}, area.cookie)
      assert.equal(res.status, 200)
      const [ownCard] = res.data.salon
      const [ownPost] = ownCard.anzeigen
      assert.equal(ownCard.kind, 'partner')
      assert.equal(ownCard.id, area.partner.id, typ)
      assert.equal(ownCard.vorschau, true)
      assert.equal(ownPost.kind, 'promotion')
      assert.equal(ownPost.id, own.id)
      assert.equal(ownPost.vorschau, true)
      assert.equal(ownPost.freigabe, 'eingereicht')
      assert.equal(ownPost.clickUrl, null)
      assert.ok(!res.data.hundeschulen.some((card) => card.kind === 'partner' && card.id === area.partner.id))
      assert.equal(res.data.vorschauHinweis, undefined)
      assert.equal(typeof res.data.fallback.salon, 'boolean')
    }
  })
})
