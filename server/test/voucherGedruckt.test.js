const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, createFamily, getCookie } = require('./helpers')

// Phase V5: "gedruckt" über alle Drucke hinweg (lib/voucherGedruckt.js) - die Druckseiten der Stapel (Admin und Partner)
// vermerken ihre Codes als gedruckt und sagen, wie viele schon einmal gedruckt waren; die Visitenkarten nehmen sie dann
// nicht mehr als "ungedruckt"; "Kunden-Gutschein weitergeben" (GET /api/vouchers/mine) zeigt die Marke und nennt
// ungedruckte zuerst. Dazu die Grenzen des Visitenkarten-Pools (security-review V5): keine beschrifteten Codes und keine
// mit Beitritt in eine Familie. Demo und Admin-Ansicht vermerken nichts. t.test() bleibt auf einer Ebene.
const ADMIN_TEST_PASSWORD = 'admin-test-gedruckt-1'
const dataDir = useTempDataDir('voucher-gedruckt', { LOGIN_RATE_LIMIT: '300', CODE_RATE_LIMIT: '300' })

test('Gutscheine: gedruckt über Stapel-Druck, Visitenkarten und Weitergabe-Liste', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const config = require('../config')
  const { hashCode, normalizeCode } = require('../lib/codes')
  const { replaceDemoPack } = require('../lib/demoPack')
  replaceDemoPack(db, config.uploadDir)

  const adminLogin = await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: ADMIN_TEST_PASSWORD } })
  const adminCookie = getCookie(adminLogin.res)
  const get = (urlPath, cookie) => call(base, urlPath, { cookie })
  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const put = (urlPath, body, cookie) => call(base, urlPath, { method: 'PUT', body, cookie })
  const takeCodes = (body, cookie) => post('/api/partner-area/visitenkarte/gutscheine', body, cookie)
  const gedrucktAt = (code) => db.prepare('SELECT gedruckt_at FROM vouchers WHERE code_hash = ?').get(hashCode(normalizeCode(code))).gedruckt_at
  const printedCount = () => db.prepare('SELECT COUNT(*) AS c FROM vouchers WHERE gedruckt_at IS NOT NULL').get().c

  async function createPartnerArea(name, slug) {
    const partner = await post('/api/admin/partners', { name, slug, typ: 'hundeschule', status: 'aktiv' }, adminCookie)
    assert.equal(partner.status, 201)
    const area = await post(`/api/admin/partners/${partner.data.id}/area`, undefined, adminCookie)
    const login = await post('/api/login', { secret: area.data.key })
    return { partner: partner.data, familyId: area.data.familyId, cookie: getCookie(login.res) }
  }

  async function adminStack(label, size, extra = {}) {
    const res = await post('/api/admin/voucher-batches', { label, size, ...extra }, adminCookie)
    assert.equal(res.status, 201)
    return res.data
  }

  const school = await createPartnerArea('Hundeschule Uferwiese', 'gd-uferwiese')

  await t.test('Partner-Druckseite: vermerkt ihre Codes als gedruckt, beim zweiten Mal mit schonGedruckt', async () => {
    const stack = await adminStack('Uferwiese-Karten', 3, { partnerId: school.partner.id })
    const first = await get(`/api/partner-area/vouchers/${stack.batch.id}/print`, school.cookie)
    assert.equal(first.status, 200)
    assert.deepEqual(first.data.codes, stack.codes)
    assert.equal(first.data.schonGedruckt, 0)
    for (const code of stack.codes) assert.match(gedrucktAt(code), /^\d{4}-\d{2}-\d{2} /)

    const second = await get(`/api/partner-area/vouchers/${stack.batch.id}/print`, school.cookie)
    assert.equal(second.data.schonGedruckt, 3)
    // Die Visitenkarten nehmen sie nicht mehr als ungedruckt.
    const codes = await takeCodes({ anzahl: 5 }, school.cookie)
    assert.deepEqual(codes.data.codes, [])
    assert.deepEqual(codes.data.gutscheine, { offen: 3, ungedruckt: 0 })
  })

  await t.test('Admin-Druckseite: vermerkt ebenso und zählt schon Gedruckte', async () => {
    const stack = await adminStack('Allgemeine Karten', 2)
    const first = await get(`/api/admin/voucher-batches/${stack.batch.id}/print`, adminCookie)
    assert.equal(first.status, 200)
    assert.equal(first.data.schonGedruckt, 0)
    for (const code of stack.codes) assert.notEqual(gedrucktAt(code), null)
    const second = await get(`/api/admin/voucher-batches/${stack.batch.id}/print`, adminCookie)
    assert.equal(second.data.schonGedruckt, 2)
  })

  await t.test('Demo und Admin-Ansicht vermerken beim Stapel-Druck nichts', async () => {
    const demo = await post('/api/demo', { as: 'partner' })
    const demoCookie = getCookie(demo.res)
    const stacks = await get('/api/partner-area/vouchers', demoCookie)
    const before = printedCount()
    const demoPrint = await get(`/api/partner-area/vouchers/${stacks.data.stapel[0].id}/print`, demoCookie)
    assert.equal(demoPrint.status, 200)
    assert.equal(printedCount(), before)

    const viewStack = await adminStack('Uferwiese Nachschub', 2, { partnerId: school.partner.id })
    const view = await post(`/api/admin/view/${school.familyId}`, undefined, adminCookie)
    const viewPrint = await get(`/api/partner-area/vouchers/${viewStack.batch.id}/print`, getCookie(view.res))
    assert.equal(viewPrint.status, 200)
    assert.equal(printedCount(), before)
    for (const code of viewStack.codes) assert.equal(gedrucktAt(code), null)
  })

  await t.test('"Kunden-Gutschein weitergeben": Marke "gedruckt", ungedruckte zuerst', async () => {
    const shop = await createPartnerArea('Hundeschule Deichblick', 'gd-deichblick')
    const mine = await get('/api/vouchers/mine', shop.cookie)
    assert.equal(mine.data.length, config.voucherQuota)
    assert.ok(mine.data.every((voucher) => voucher.gedruckt === false))
    // Ein Visitenkarten-Druck nimmt einen der Weitergabe-Codes.
    const taken = await takeCodes({ anzahl: 1 }, shop.cookie)
    assert.equal(taken.data.codes.length, 1)
    const after = await get('/api/vouchers/mine', shop.cookie)
    const last = after.data.at(-1)
    assert.equal(last.code, taken.data.codes[0])
    assert.equal(last.gedruckt, true)
    assert.ok(after.data.slice(0, -1).every((voucher) => voucher.gedruckt === false))
  })

  await t.test('Visitenkarten-Pool: keine beschrifteten Codes, keine mit Beitritt in eine Familie', async () => {
    const salon = await createPartnerArea('Hundesalon Kammweg', 'gd-kammweg')
    const mine = await get('/api/vouchers/mine', salon.cookie)
    const labelled = mine.data[0]
    assert.equal((await put(`/api/vouchers/${labelled.id}/label`, { label: 'Für Frau Wiese' }, salon.cookie)).status, 200)
    const rudel = await createFamily(base, 'Familie Kammweg', 'kammweg-passwort-1')
    const joinStack = await adminStack('Kammweg mit Beitritt', 2, { partnerId: salon.partner.id, joinFamilyId: rudel.data.id })

    const res = await takeCodes({ anzahl: 50 }, salon.cookie)
    assert.equal(res.status, 200)
    assert.equal(res.data.codes.includes(labelled.code), false)
    for (const code of joinStack.codes) assert.equal(res.data.codes.includes(code), false)
    assert.equal(res.data.codes.length, config.voucherQuota - 1)
  })
})
