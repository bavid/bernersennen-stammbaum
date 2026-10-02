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
  const { DEMO_VOUCHERS, DEMO_VOUCHER_ARCHIVE } = require('../lib/vouchers')

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

  // Phase V2b: der eingelöste steht nicht mehr in der Liste, sondern im Archiv (?archiv=1).
  await t.test('Kontingent bleibt bei voucherQuota, auch wenn einer eingelöst ist - der steht dann im Archiv', async () => {
    const household = await createHousehold(base, 'Zuhause Kontingent')
    const first = await mine(household.cookie)
    const codeToRedeem = first.data[0].code

    const redeemRes = await post('/api/vouchers/redeem', { code: codeToRedeem, name: 'Zuhause Kontingent Beitritt' })
    assert.equal(redeemRes.status, 201)

    const second = await mine(household.cookie)
    assert.equal(second.status, 200)
    assert.deepEqual(second.data.map((voucher) => voucher.status), ['offen', 'offen'])
    const archive = await call(base, '/api/vouchers/mine?archiv=1', { cookie: household.cookie })
    assert.equal(archive.data.length, 1)
    const redeemedEntry = archive.data[0]
    assert.equal(redeemedEntry.status, 'eingelöst')
    assert.equal(redeemedEntry.code, null)
    assert.ok(redeemedEntry.redeemed_at)
    assert.equal(redeemedEntry.neueChronik, true)
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

  await t.test('Übergabe-Gutscheine (dog_id gesetzt) zählen weder mit noch erscheinen sie in /mine', async () => {
    // security-review Phase T Finding 4: ein Übergabe-Gutschein (siehe routes/dogs.js POST
    // /:id/handover, lib/vouchers.js createBatch mit dogId) ist keine Weitergabe-Einladung - er darf
    // weder das Kontingent aus ensureVoucherQuota auffüllen noch in dieser Liste auftauchen.
    const household = await createHousehold(base, 'Zuhause Übergabe-Ausschluss')
    const dog = await post('/api/dogs', { name: 'Filou', geschlecht: 'ruede' }, household.cookie)
    assert.equal(dog.status, 201)

    const before = await mine(household.cookie)
    assert.equal(before.data.length, config.voucherQuota)

    const { createBatch } = require('../lib/vouchers')
    const { batchId } = createBatch(db, {
      label: 'Übergabe Filou',
      kind: 'partner',
      size: 1,
      issuedByFamilyId: household.data.id,
      dogId: dog.data.id
    })
    const handoverVoucherId = db.prepare('SELECT id FROM vouchers WHERE batch_id = ?').get(batchId).id

    const after = await mine(household.cookie)
    assert.equal(after.data.length, config.voucherQuota, 'der Übergabe-Gutschein füllt das Kontingent nicht zusätzlich auf')
    assert.equal(
      after.data.some((voucher) => voucher.id === handoverVoucherId),
      false,
      'der Übergabe-Gutschein taucht nicht in der Liste auf'
    )

    // In der DB stehen weiterhin genau voucherQuota Weitergabe-Gutscheine PLUS der eine
    // Übergabe-Gutschein - ensureVoucherQuota hat also nicht "nachgelegt", weil dieser nie mitzählte.
    const totalIssued = db.prepare('SELECT COUNT(*) AS c FROM vouchers WHERE issued_by_family_id = ?').get(household.data.id).c
    assert.equal(totalIssued, config.voucherQuota + 1)
  })

  await t.test('Demo: feste Schein-Liste, keine echten Gutscheine in der DB', async () => {
    const rudel = await createFamily(base, 'Familie Demo Mine', 'demo-mine-pw-1')
    db.prepare('UPDATE families SET is_demo = 1 WHERE id = ?').run(rudel.data.id)
    const demoLogin = await post('/api/demo')
    const demoCookie = getCookie(demoLogin.res)

    const res = await mine(demoCookie)
    assert.equal(res.status, 200)
    assert.deepEqual(res.data, DEMO_VOUCHERS)
    const archive = await call(base, '/api/vouchers/mine?archiv=1', { cookie: demoCookie })
    assert.deepEqual(archive.data, DEMO_VOUCHER_ARCHIVE)
    // Phase V2b: zwei beschriftete offene, drei eingelöste
    assert.equal(DEMO_VOUCHERS.filter((voucher) => voucher.status === 'offen' && voucher.label).length, 2)
    assert.equal(DEMO_VOUCHER_ARCHIVE.filter((voucher) => voucher.status === 'eingelöst').length, 3)

    const created = db.prepare('SELECT COUNT(*) AS c FROM vouchers WHERE issued_by_family_id = ?').get(rudel.data.id).c
    assert.equal(created, 0)
  })

  await t.test('Die Schein-Codes der Demo lassen sich nicht einlösen (normalizeCode lehnt sie ab)', () => {
    for (const voucher of [...DEMO_VOUCHERS, ...DEMO_VOUCHER_ARCHIVE]) {
      if (voucher.code) assert.equal(normalizeCode(voucher.code), null)
    }
  })
})
