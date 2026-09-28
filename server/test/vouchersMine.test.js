const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, createFamily, createHousehold, getCookie } = require('./helpers')

const dataDir = useTempDataDir('vouchersMine', { LOGIN_RATE_LIMIT: '300', CODE_RATE_LIMIT: '300' })

test('GET /api/vouchers/mine: Kontingent auffüllen, Rudel-Gutscheine treten bei, Demo-Schein-Liste', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const config = require('../config')
  const { normalizeCode } = require('../lib/codes')
  const { DEMO_VOUCHERS } = require('../lib/vouchers')

  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const mine = (cookie) => call(base, '/api/vouchers/mine', { cookie })

  await t.test('kein Login -> 401', async () => {
    const res = await mine()
    assert.equal(res.status, 401)
  })

  await t.test('Zuhause: Kontingent wird bis auf voucherQuota aufgefüllt, joins: false', async () => {
    const household = await createHousehold(base, 'Zuhause Gutscheine')
    const res = await mine(household.cookie)
    assert.equal(res.status, 200)
    assert.equal(res.data.length, config.voucherQuota)
    for (const voucher of res.data) {
      assert.equal(voucher.status, 'offen')
      assert.equal(voucher.joins, false)
      assert.match(voucher.code, /^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/)
      assert.equal(voucher.hint, voucher.code.slice(-4))
      assert.equal(voucher.redeemed_at, null)
    }
  })

  await t.test('Rudel: Gutscheine tragen joins: true und lassen dem Rudel beitreten', async () => {
    const rudel = await createFamily(base, 'Familie Weitergabe', 'weitergabe-pw-1')
    const res = await mine(rudel.cookie)
    assert.equal(res.status, 200)
    assert.equal(res.data.length, config.voucherQuota)
    assert.ok(res.data.every((voucher) => voucher.joins === true))

    const redeemRes = await post('/api/vouchers/redeem', { code: res.data[0].code, name: 'Zuhause Beitritt Mine' })
    assert.equal(redeemRes.status, 201)
    assert.equal(redeemRes.data.memberships.length, 1)
    assert.equal(redeemRes.data.memberships[0].id, rudel.data.id)
  })

  await t.test('Kontingent bleibt bei voucherQuota, auch wenn einer eingelöst ist', async () => {
    const household = await createHousehold(base, 'Zuhause Kontingent')
    const first = await mine(household.cookie)
    const codeToRedeem = first.data[0].code

    const redeemRes = await post('/api/vouchers/redeem', { code: codeToRedeem, name: 'Zuhause Kontingent Beitritt' })
    assert.equal(redeemRes.status, 201)

    const second = await mine(household.cookie)
    assert.equal(second.status, 200)
    assert.equal(second.data.length, config.voucherQuota)
    const statuses = second.data.map((voucher) => voucher.status).sort()
    assert.deepEqual(statuses, ['eingelöst', 'offen', 'offen'])
    const redeemedEntry = second.data.find((voucher) => voucher.status === 'eingelöst')
    assert.equal(redeemedEntry.code, null)
    assert.ok(redeemedEntry.redeemed_at)
  })

  await t.test('neueste zuerst', async () => {
    const household = await createHousehold(base, 'Zuhause Reihenfolge')
    const res = await mine(household.cookie)
    const ids = res.data.map((voucher) => voucher.id)
    assert.deepEqual(
      ids,
      [...ids].sort((a, b) => b - a)
    )
  })

  await t.test('Demo: feste Schein-Liste, keine echten Gutscheine in der DB', async () => {
    const rudel = await createFamily(base, 'Familie Demo Mine', 'demo-mine-pw-1')
    db.prepare('UPDATE families SET is_demo = 1 WHERE id = ?').run(rudel.data.id)
    const demoLogin = await post('/api/demo')
    const demoCookie = getCookie(demoLogin.res)

    const res = await mine(demoCookie)
    assert.equal(res.status, 200)
    assert.deepEqual(res.data, DEMO_VOUCHERS)

    const created = db.prepare('SELECT COUNT(*) AS c FROM vouchers WHERE issued_by_family_id = ?').get(rudel.data.id).c
    assert.equal(created, 0)
  })

  await t.test('Die Schein-Codes der Demo lassen sich nicht einlösen (normalizeCode lehnt sie ab)', () => {
    for (const voucher of DEMO_VOUCHERS) {
      if (voucher.code) assert.equal(normalizeCode(voucher.code), null)
    }
  })
})
