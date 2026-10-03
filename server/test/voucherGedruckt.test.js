const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, createFamily, getCookie } = require('./helpers')

// Phase V5: "gedruckt" über alle Drucke hinweg (lib/voucherGedruckt.js) - die Druckseiten der Stapel (Admin und Partner)
// vermerken ihre Codes als gedruckt (seit Audit V7a erst mit der Meldung per POST, GET liest nur) und sagen, wie viele
// schon einmal gedruckt waren; die Visitenkarten nehmen sie dann
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

  // Audit V7a: GET liest nur - vermerkt wird erst, wenn die Druckseite den Druck per POST …/print/gedruckt meldet.
  const markPrinted = (urlPath, ids, cookie) => post(`${urlPath}/gedruckt`, { ids }, cookie)

  await t.test('Partner-Druckseite: GET vermerkt nichts, die Meldung per POST vermerkt die Codes, danach schonGedruckt', async () => {
    const stack = await adminStack('Uferwiese-Karten', 3, { partnerId: school.partner.id })
    const printUrl = `/api/partner-area/vouchers/${stack.batch.id}/print`
    const first = await get(printUrl, school.cookie)
    assert.equal(first.status, 200)
    assert.deepEqual(first.data.codes, stack.codes)
    assert.equal(first.data.ids.length, 3)
    assert.equal(first.data.schonGedruckt, 0)
    for (const code of stack.codes) assert.equal(gedrucktAt(code), null, 'GET ändert nichts')
    assert.equal((await get(printUrl, school.cookie)).data.schonGedruckt, 0)

    const marked = await markPrinted(printUrl, first.data.ids, school.cookie)
    assert.equal(marked.status, 200)
    assert.deepEqual(marked.data, { gedruckt: 3 })
    assert.equal(marked.headers.get('cache-control'), 'no-store')
    for (const code of stack.codes) assert.match(gedrucktAt(code), /^\d{4}-\d{2}-\d{2} /)

    const second = await get(printUrl, school.cookie)
    assert.equal(second.data.schonGedruckt, 3)
    // Die Visitenkarten nehmen sie nicht mehr als ungedruckt.
    const codes = await takeCodes({ anzahl: 5 }, school.cookie)
    assert.deepEqual(codes.data.codes, [])
    assert.deepEqual(codes.data.gutscheine, { offen: 3, ungedruckt: 0 })
  })

  await t.test('Meldung "gedruckt": nur druckbare Ids des eigenen Stapels, ungültige Angaben 400, fremde Stapel 404', async () => {
    const own = await adminStack('Uferwiese Meldung', 2, { partnerId: school.partner.id })
    const other = await createPartnerArea('Hundeschule Nebenan', 'gd-nebenan')
    const foreign = await adminStack('Nebenan-Karten', 2, { partnerId: other.partner.id })
    const ownUrl = `/api/partner-area/vouchers/${own.batch.id}/print`
    const foreignIds = (await get(`/api/partner-area/vouchers/${foreign.batch.id}/print`, other.cookie)).data.ids

    // Fremde Ids im eigenen Stapel zählen nicht; den fremden Stapel gibt es für diesen Partner nicht.
    assert.deepEqual((await markPrinted(ownUrl, foreignIds, school.cookie)).data, { gedruckt: 0 })
    assert.equal((await markPrinted(`/api/partner-area/vouchers/${foreign.batch.id}/print`, foreignIds, school.cookie)).status, 404)
    for (const code of foreign.codes) assert.equal(gedrucktAt(code), null)
    for (const body of [undefined, {}, { ids: 'alle' }, { ids: [1.5] }, { ids: [-1] }, { ids: ['1'] }, { ids: Array(1001).fill(1) }]) {
      const res = await post(`${ownUrl}/gedruckt`, body, school.cookie)
      assert.equal(res.status, 400, JSON.stringify(body)?.slice(0, 40))
    }
    for (const code of own.codes) assert.equal(gedrucktAt(code), null)
  })

  await t.test('Admin-Druckseite: GET vermerkt nichts, die Meldung per POST vermerkt und zählt schon Gedruckte', async () => {
    const stack = await adminStack('Allgemeine Karten', 2)
    const printUrl = `/api/admin/voucher-batches/${stack.batch.id}/print`
    const first = await get(printUrl, adminCookie)
    assert.equal(first.status, 200)
    assert.equal(first.data.schonGedruckt, 0)
    for (const code of stack.codes) assert.equal(gedrucktAt(code), null, 'GET ändert nichts')

    assert.deepEqual((await markPrinted(printUrl, first.data.ids, adminCookie)).data, { gedruckt: 2 })
    for (const code of stack.codes) assert.notEqual(gedrucktAt(code), null)
    const second = await get(printUrl, adminCookie)
    assert.equal(second.data.schonGedruckt, 2)
    assert.equal((await markPrinted(printUrl, first.data.ids)).status, 401, 'ohne Admin-Sitzung')
    assert.equal((await markPrinted('/api/admin/voucher-batches/999999/print', [1], adminCookie)).status, 404)
    assert.equal((await post(`${printUrl}/gedruckt`, { ids: null }, adminCookie)).status, 400)
  })

  await t.test('Demo und Admin-Ansicht vermerken beim Stapel-Druck nichts', async () => {
    const demo = await post('/api/demo', { as: 'partner' })
    const demoCookie = getCookie(demo.res)
    const stacks = await get('/api/partner-area/vouchers', demoCookie)
    const before = printedCount()
    const demoUrl = `/api/partner-area/vouchers/${stacks.data.stapel[0].id}/print`
    const demoPrint = await get(demoUrl, demoCookie)
    assert.equal(demoPrint.status, 200)
    assert.equal((await markPrinted(demoUrl, demoPrint.data.ids, demoCookie)).status, 403)
    assert.equal(printedCount(), before)

    const viewStack = await adminStack('Uferwiese Nachschub', 2, { partnerId: school.partner.id })
    const view = await post(`/api/admin/view/${school.familyId}`, undefined, adminCookie)
    const viewUrl = `/api/partner-area/vouchers/${viewStack.batch.id}/print`
    const viewPrint = await get(viewUrl, getCookie(view.res))
    assert.equal(viewPrint.status, 200)
    assert.equal((await markPrinted(viewUrl, viewPrint.data.ids, getCookie(view.res))).status, 403)
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
