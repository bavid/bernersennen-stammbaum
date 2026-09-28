const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, createFamily, getCookie } = require('./helpers')

const ADMIN_TEST_PASSWORD = 'admin-test-passwort-2'
const dataDir = useTempDataDir('adminVouchers')

test('Admin-Gutschein-Stapel: anlegen, auflisten, Details, zurückziehen', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
  const { server, base } = await startApp()
  // Erst nach ADMIN_PASSWORD_HASH und startApp() requiren, siehe admin.test.js.
  const db = require('../db')
  t.after(() => cleanup(dataDir, server))

  const login = await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: ADMIN_TEST_PASSWORD } })
  const adminCookie = getCookie(login.res)

  const post = (urlPath, body, cookie = adminCookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const get = (urlPath, cookie = adminCookie) => call(base, urlPath, { cookie })
  const redeem = (code, name) => post('/api/vouchers/redeem', { code, name }, undefined)

  await t.test('Stapel anlegen: Bezeichnung Pflicht, Anzahl 1-200', async () => {
    const noLabel = await post('/api/admin/voucher-batches', { size: 5 })
    assert.equal(noLabel.status, 400)

    const zeroSize = await post('/api/admin/voucher-batches', { label: 'Zu wenig', size: 0 })
    assert.equal(zeroSize.status, 400)

    const tooBig = await post('/api/admin/voucher-batches', { label: 'Zu viel', size: 201 })
    assert.equal(tooBig.status, 400)

    const asText = await post('/api/admin/voucher-batches', { label: 'Als Text', size: '5' })
    assert.equal(asText.status, 400)

    const created = await post('/api/admin/voucher-batches', { label: 'Testkarten', size: 5 })
    assert.equal(created.status, 201)
    assert.equal(created.data.batch.label, 'Testkarten')
    assert.equal(created.data.batch.size, 5)
    assert.ok(created.data.batch.id)
    assert.ok(created.data.batch.created_at)
    assert.equal(created.data.codes.length, 5)
    for (const code of created.data.codes) assert.match(code, /^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/)
  })

  await t.test('Stapel mit joinFamilyId: nur ein bestehendes, nicht-Demo-Rudel ist ein gültiges Ziel', async () => {
    const badJoin = await post('/api/admin/voucher-batches', { label: 'Ungültiges Ziel', size: 1, joinFamilyId: 999999 })
    assert.equal(badJoin.status, 400)

    const rudel = await createFamily(base, 'Familie Admin-Ziel', 'admin-ziel-pw-1')
    const zuhause = await createFamily(base, 'Nicht-Rudel-Ziel', 'admin-nichtrudel-pw-1', { art: 'zuhause' })
    const demoRudel = await createFamily(base, 'Familie Admin Demo-Ziel', 'admin-demo-ziel-pw-1')
    db.prepare('UPDATE families SET is_demo = 1 WHERE id = ?').run(demoRudel.data.id)

    const demoTarget = await post('/api/admin/voucher-batches', { label: 'Demo-Ziel', size: 1, joinFamilyId: demoRudel.data.id })
    assert.equal(demoTarget.status, 400)

    const zuhauseTarget = await post('/api/admin/voucher-batches', { label: 'Zuhause-Ziel', size: 1, joinFamilyId: zuhause.data.id })
    assert.equal(zuhauseTarget.status, 400)

    const ok = await post('/api/admin/voucher-batches', { label: 'Einladung Admin-Ziel', size: 1, joinFamilyId: rudel.data.id })
    assert.equal(ok.status, 201)

    const redeemRes = await redeem(ok.data.codes[0], 'Zuhause Admin-Beitritt')
    assert.equal(redeemRes.status, 201)
    assert.equal(redeemRes.data.memberships.length, 1)
    assert.equal(redeemRes.data.memberships[0].id, rudel.data.id)
  })

  await t.test('Liste zeigt Zähler je Stapel', async () => {
    const list = await get('/api/admin/voucher-batches')
    assert.equal(list.status, 200)
    const testkarten = list.data.find((batch) => batch.label === 'Testkarten')
    assert.equal(testkarten.kind, 'admin')
    assert.equal(testkarten.size, 5)
    assert.equal(testkarten.open, 5)
    assert.equal(testkarten.redeemed, 0)
    assert.equal(testkarten.revoked, 0)
  })

  await t.test('Details zeigen Codes solange offen, Status und wer eingelöst hat', async () => {
    const created = await post('/api/admin/voucher-batches', { label: 'Detailstapel', size: 2 })
    const detail = await get(`/api/admin/voucher-batches/${created.data.batch.id}`)
    assert.equal(detail.status, 200)
    assert.equal(detail.data.batch.label, 'Detailstapel')
    assert.equal(detail.data.vouchers.length, 2)
    assert.ok(detail.data.vouchers.every((voucher) => voucher.status === 'offen' && voucher.code))

    const redeemRes = await redeem(detail.data.vouchers[0].code, 'Zuhause Detail-Beitritt')
    assert.equal(redeemRes.status, 201)

    const afterRedeem = await get(`/api/admin/voucher-batches/${created.data.batch.id}`)
    const redeemedVoucher = afterRedeem.data.vouchers.find((voucher) => voucher.id === detail.data.vouchers[0].id)
    assert.equal(redeemedVoucher.status, 'eingelöst')
    assert.equal(redeemedVoucher.code, null)
    assert.equal(redeemedVoucher.redeemed_by_name, 'Zuhause Detail-Beitritt')

    const missing = await get('/api/admin/voucher-batches/999999')
    assert.equal(missing.status, 404)
  })

  await t.test('Zurückziehen: offener Gutschein -> danach 410 beim Einlösen; eingelöster -> 409', async () => {
    const created = await post('/api/admin/voucher-batches', { label: 'Zum Zurückziehen', size: 2 })
    const [openCode, toRedeemCode] = created.data.codes

    const detail = await get(`/api/admin/voucher-batches/${created.data.batch.id}`)
    const openVoucherId = detail.data.vouchers.find((voucher) => voucher.code === openCode).id
    const toRedeemVoucherId = detail.data.vouchers.find((voucher) => voucher.code === toRedeemCode).id

    const revoked = await post(`/api/admin/vouchers/${openVoucherId}/revoke`)
    assert.equal(revoked.status, 200)
    assert.equal(revoked.data.status, 'widerrufen')

    // idempotent: nochmal zurückziehen bleibt folgenlos
    const revokedAgain = await post(`/api/admin/vouchers/${openVoucherId}/revoke`)
    assert.equal(revokedAgain.status, 200)
    assert.equal(revokedAgain.data.status, 'widerrufen')

    const redeemAfterRevoke = await redeem(openCode, 'Zuhause Widerrufen')
    assert.equal(redeemAfterRevoke.status, 410)
    assert.match(redeemAfterRevoke.data.error, /zurückgezogen/)

    await redeem(toRedeemCode, 'Zuhause Vor Widerruf')
    const revokeRedeemed = await post(`/api/admin/vouchers/${toRedeemVoucherId}/revoke`)
    assert.equal(revokeRedeemed.status, 409)

    const revokeMissing = await post('/api/admin/vouchers/999999/revoke')
    assert.equal(revokeMissing.status, 404)
  })

  await t.test('kein Zugriff ohne Admin', async () => {
    const family = await createFamily(base, 'Familie Kein Admin-Zugriff', 'kein-admin-pw-1')
    assert.equal((await post('/api/admin/voucher-batches', { label: 'X', size: 1 }, family.cookie)).status, 401)
    assert.equal((await get('/api/admin/voucher-batches', family.cookie)).status, 401)
    assert.equal((await get('/api/admin/voucher-batches/1', family.cookie)).status, 401)
    assert.equal((await post('/api/admin/vouchers/1/revoke', undefined, family.cookie)).status, 401)

    // undefined würde den Default-Parameter (adminCookie) greifen lassen - explizit null erzwingt "ohne Cookie"
    assert.equal((await post('/api/admin/voucher-batches', { label: 'X', size: 1 }, null)).status, 401)
  })
})
