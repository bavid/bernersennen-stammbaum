const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, createHousehold, getCookie } = require('./helpers')
const { addDays, berlinNow } = require('../lib/terminSerien')

// Phase V4a: Anzeigen mit mehreren Terminen (promotions.zeitraeume) - der Partner gibt bis zu zwölf Tage oder Zeiträume
// an; eine Änderung folgt denselben Regeln wie Titel und Text (erneute Freigabe, außer der Partner ist
// vertrauenswürdig). Öffentlich nur, was heute oder später noch läuft. t.test() bleibt auf einer Ebene.
const ADMIN_TEST_PASSWORD = 'admin-test-post-zeitraeume-1'
const dataDir = useTempDataDir('post-zeitraeume', { LOGIN_RATE_LIMIT: '300', CODE_RATE_LIMIT: '300' })

const today = berlinNow().datum
const inDays = (days) => addDays(today, days)

test('Anzeigen mit mehreren Terminen', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))

  const adminLogin = await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: ADMIN_TEST_PASSWORD } })
  const adminCookie = getCookie(adminLogin.res)
  const get = (urlPath, cookie) => call(base, urlPath, { cookie })
  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const put = (urlPath, body, cookie) => call(base, urlPath, { method: 'PUT', body, cookie })

  async function createPartnerArea(slug, overrides = {}) {
    const input = { name: `Partner ${slug}`, slug, typ: 'hundeschule', plz: '10115', status: 'aktiv', ...overrides }
    const partner = await post('/api/admin/partners', input, adminCookie)
    assert.equal(partner.status, 201)
    const area = await post(`/api/admin/partners/${partner.data.id}/area`, undefined, adminCookie)
    const login = await post('/api/login', { secret: area.data.key })
    return { partner: partner.data, cookie: getCookie(login.res) }
  }

  const schule = await createPartnerArea('zeitraum-schule')
  const zeitraeume = [{ von: inDays(40), bis: inDays(45) }, { von: inDays(-20) }, { von: inDays(10) }, { von: inDays(10) }]
  const body = { titel: 'Tag der offenen Tür', text: 'Schnuppern, Kaffee und Kuchen.', bereich: 'hundeschule', zeitraeume }
  let postId

  await t.test('anlegen: geprüft, sortiert, doppelte einmal - der Partner sieht alle', async () => {
    const res = await post('/api/partner-area/posts', body, schule.cookie)
    assert.equal(res.status, 201)
    postId = res.data.id
    assert.deepEqual(res.data.zeitraeume, [
      { von: inDays(-20), bis: null },
      { von: inDays(10), bis: null },
      { von: inDays(40), bis: inDays(45) }
    ])
    const tooMany = await post('/api/partner-area/posts', { ...body, zeitraeume: Array.from({ length: 13 }, (_, i) => ({ von: inDays(i + 1) })) }, schule.cookie)
    assert.equal(tooMany.status, 400)
    assert.equal(tooMany.data.error, 'Höchstens 12 Termine je Beitrag')
    const broken = await post('/api/partner-area/posts', { ...body, zeitraeume: [{ von: inDays(5), bis: inDays(4) }] }, schule.cookie)
    assert.equal(broken.status, 400)
    assert.equal(broken.data.error, 'Termin 1: das Ende darf nicht vor dem Beginn liegen')
  })

  await t.test('Admin sieht die Termine beim Freigeben', async () => {
    const pending = await get('/api/admin/promotions?freigabe=eingereicht', adminCookie)
    const row = pending.data.find((item) => item.id === postId)
    assert.equal(row.zeitraeume.length, 3)
    assert.equal((await post(`/api/admin/promotions/${postId}/freigeben`, undefined, adminCookie)).status, 200)
  })

  await t.test('öffentlich nur kommende Termine - Portal und Karte in Entdecken', async () => {
    const portal = await get(`/api/public/partners/${schule.partner.slug}/posts`)
    const card = portal.data.find((item) => item.id === postId)
    assert.deepEqual(card.zeitraeume, [{ von: inDays(10), bis: null }, { von: inDays(40), bis: inDays(45) }])
    const household = await createHousehold(base, 'Familie Zeitraum')
    const discover = await post('/api/discover', {}, household.cookie)
    const partnerCard = discover.data.hundeschulen.find((item) => item.kind === 'partner' && item.id === schule.partner.id)
    assert.deepEqual(partnerCard.anzeigen[0].zeitraeume, card.zeitraeume)
  })

  await t.test('Termine ändern: wie jede Änderung erneut zur Prüfung', async () => {
    const res = await put(`/api/partner-area/posts/${postId}`, { ...body, zeitraeume: [{ von: inDays(12) }] }, schule.cookie)
    assert.equal(res.status, 200)
    assert.equal(res.data.freigabe, 'eingereicht')
    assert.deepEqual(res.data.zeitraeume, [{ von: inDays(12), bis: null }])
    assert.ok((await get(`/api/public/partners/${schule.partner.slug}/posts`)).data.every((item) => item.id !== postId))
  })

  await t.test('eine Änderung des Admins lässt die Termine stehen', async () => {
    const res = await put(`/api/admin/promotions/${postId}`, { titel: 'Tag der offenen Tür (geprüft)', bereich: 'hundeschule', kennzeichnung: 'Anzeige' }, adminCookie)
    assert.equal(res.status, 200)
    assert.deepEqual(res.data.zeitraeume, [{ von: inDays(12), bis: null }])
  })

  await t.test('vertrauenswürdig: geänderte Termine bleiben online', async () => {
    const trusted = await createPartnerArea('zeitraum-salon', { typ: 'hundesalon' })
    require('../db').prepare('UPDATE partners SET vertrauenswuerdig = 1 WHERE id = ?').run(trusted.partner.id)
    const created = await post('/api/partner-area/posts', { titel: 'Krallen-Aktion', bereich: 'salon', zeitraeume: [{ von: inDays(3) }] }, trusted.cookie)
    await post(`/api/admin/promotions/${created.data.id}/freigeben`, undefined, adminCookie)
    const res = await put(`/api/partner-area/posts/${created.data.id}`, { titel: 'Krallen-Aktion', bereich: 'salon', zeitraeume: [{ von: inDays(4), bis: inDays(6) }] }, trusted.cookie)
    assert.equal(res.data.freigabe, 'freigegeben')
    const portal = await get(`/api/public/partners/${trusted.partner.slug}/posts`)
    assert.deepEqual(portal.data[0].zeitraeume, [{ von: inDays(4), bis: inDays(6) }])
  })
})
