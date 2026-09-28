const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, createHousehold, getCookie } = require('./helpers')

// Phase P: Partner geben Kunden-Gutscheine an ihre Kundschaft weiter (GET /api/vouchers/mine im Partner-
// bzw. Tierheim-Bereich). Diese Gutscheine tragen die partner_id des Bereichs, das eingelöste Zuhause
// damit families.partner_id als Herkunft - wie bei Admin-Partner-Stapeln (lib/vouchers.js
// ensureVoucherQuota/redeemVoucher). Ein Zuhause gibt seine Herkunft NICHT an eigene Gutscheine weiter.
const ADMIN_TEST_PASSWORD = 'admin-test-voucher-attribution-1'
const dataDir = useTempDataDir('partnerVoucherAttribution', { LOGIN_RATE_LIMIT: '300', CODE_RATE_LIMIT: '300' })

test('Weitergabe-Gutscheine eines Partner-Bereichs werden dem Partner zugerechnet', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const config = require('../config')

  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const mine = (cookie) => call(base, '/api/vouchers/mine', { cookie })
  const adminLogin = await post('/api/admin/login', { username: 'admin', password: ADMIN_TEST_PASSWORD })
  const adminCookie = getCookie(adminLogin.res)

  let counter = 0
  // Partner per Admin anlegen, Bereich dazu, mit dem Schlüssel anmelden.
  async function createPartnerArea(typ) {
    counter += 1
    const partner = await post(
      '/api/admin/partners',
      { name: `Weitergabe Partner ${counter}`, slug: `weitergabe-partner-${counter}`, typ, status: 'aktiv' },
      adminCookie
    )
    assert.equal(partner.status, 201)
    const area = await post(`/api/admin/partners/${partner.data.id}/area`, undefined, adminCookie)
    assert.equal(area.status, 201)
    const login = await post('/api/login', { secret: area.data.key })
    assert.equal(login.status, 200)
    return { partnerId: partner.data.id, familyId: area.data.familyId, cookie: getCookie(login.res) }
  }

  const voucherPartnerIds = (familyId) =>
    db
      .prepare('SELECT partner_id FROM vouchers WHERE issued_by_family_id = ? ORDER BY id')
      .all(familyId)
      .map((row) => row.partner_id)
  const familyPartnerId = (familyId) => db.prepare('SELECT partner_id FROM families WHERE id = ?').get(familyId).partner_id

  await t.test('Partner-Bereich (Hundeschule): Gutscheine tragen die partner_id, das eingelöste Zuhause auch', async () => {
    const area = await createPartnerArea('hundeschule')
    const res = await mine(area.cookie)
    assert.equal(res.status, 200)
    assert.equal(res.data.length, config.voucherQuota)
    assert.ok(res.data.every((voucher) => voucher.joins === false))
    assert.deepEqual(voucherPartnerIds(area.familyId), Array(config.voucherQuota).fill(area.partnerId))

    const redeemed = await post('/api/vouchers/redeem', { code: res.data[0].code, name: 'Zuhause Kundschaft' })
    assert.equal(redeemed.status, 201)
    assert.equal(redeemed.data.art, 'zuhause')
    assert.deepEqual(redeemed.data.memberships, [])
    assert.equal(familyPartnerId(redeemed.data.id), area.partnerId)
  })

  await t.test('Tierheim-Bereich: ebenso dem Tierheim-Partner zugerechnet', async () => {
    const area = await createPartnerArea('tierheim')
    const res = await mine(area.cookie)
    assert.equal(res.status, 200)
    assert.deepEqual(voucherPartnerIds(area.familyId), Array(config.voucherQuota).fill(area.partnerId))

    const redeemed = await post('/api/vouchers/redeem', { code: res.data[0].code, name: 'Zuhause Tierheim-Kundschaft' })
    assert.equal(redeemed.status, 201)
    assert.equal(familyPartnerId(redeemed.data.id), area.partnerId)
  })

  await t.test('ein Zuhause mit Partner-Herkunft gibt diese nicht an seine eigenen Gutscheine weiter', async () => {
    const area = await createPartnerArea('hundesalon')
    const partnerVouchers = await mine(area.cookie)
    const redeemed = await post('/api/vouchers/redeem', { code: partnerVouchers.data[0].code, name: 'Zuhause mit Herkunft' })
    assert.equal(redeemed.status, 201)
    assert.equal(familyPartnerId(redeemed.data.id), area.partnerId)

    const householdVouchers = await mine(getCookie(redeemed.res))
    assert.equal(householdVouchers.status, 200)
    assert.deepEqual(voucherPartnerIds(redeemed.data.id), Array(config.voucherQuota).fill(null))

    const next = await post('/api/vouchers/redeem', { code: householdVouchers.data[0].code, name: 'Zuhause ohne Herkunft' })
    assert.equal(next.status, 201)
    assert.equal(familyPartnerId(next.data.id), null)
  })

  await t.test('ein gewöhnliches Zuhause: keine partner_id an den Gutscheinen', async () => {
    const household = await createHousehold(base, 'Zuhause Gewöhnlich')
    const res = await mine(household.cookie)
    assert.equal(res.status, 200)
    assert.deepEqual(voucherPartnerIds(household.data.id), Array(config.voucherQuota).fill(null))
  })
})
