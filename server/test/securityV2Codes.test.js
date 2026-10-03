const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, createFamily, createHousehold, getCookie } = require('./helpers')

const ADMIN_TEST_PASSWORD = 'admin-test-codes-v2'
const dataDir = useTempDataDir('security-v2-codes', { LOGIN_RATE_LIMIT: '400', CODE_RATE_LIMIT: '400' })

// security-review Phase V2, zweite Runde: persönliche Codes, Austritt, Start-Codes, Admin-Ansicht, beschädigte Codes.
test('security-review V2 (Runde 2): Codes', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const config = require('../config')

  const get = (urlPath, cookie) => call(base, urlPath, { cookie })
  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const del = (urlPath, cookie) => call(base, urlPath, { method: 'DELETE', cookie })
  const admin = getCookie((await post('/api/admin/login', { username: 'admin', password: ADMIN_TEST_PASSWORD })).res)
  const openOf = (groupId) =>
    db.prepare("SELECT id FROM vouchers WHERE join_family_id = ? AND redeemed_at IS NULL AND revoked_at IS NULL").pluck().all(groupId)

  async function createShelter(name, slug) {
    const partner = await post('/api/admin/partners', { name, typ: 'tierheim', plz: '10115', status: 'aktiv', slug }, admin)
    const shelter = await post(`/api/admin/partners/${partner.data.id}/shelter`, undefined, admin)
    return { ...shelter.data, cookie: getCookie((await post('/api/login', { secret: shelter.data.key })).res) }
  }

  await t.test('M-1: ein Übergabe-Code ist nach dem Einlösen kein Schlüssel; Admin-Karten bleiben es', async () => {
    const shelter = await createShelter('Tierheim Codes', 'tierheim-codes')
    const dog = (await post('/api/dogs', { name: 'Oskar', geschlecht: 'ruede', tierart: 'hund', vermittlungStatus: 'reserviert' }, shelter.cookie)).data
    const handover = await post(`/api/dogs/${dog.id}/handover`, {}, shelter.cookie)
    assert.equal(handover.status, 201)
    const redeem = await post('/api/vouchers/redeem', { code: handover.data.code, name: 'Zuhause Oskar' })
    assert.equal(redeem.status, 201)
    assert.notEqual(redeem.data.key, handover.data.code)
    assert.equal(redeem.data.fromOthers, false, 'frischer Schlüssel - den kennt nur das neue Zuhause')
    assert.equal((await post('/api/login', { secret: handover.data.code })).status, 401, 'das Tierheim kommt nicht ins neue Zuhause')

    const batch = await post('/api/admin/voucher-batches', { label: 'Karten Herbst', size: 1 }, admin)
    const card = batch.data.codes[0]
    const cardRedeem = await post('/api/vouchers/redeem', { code: card, name: 'Zuhause Karte Herbst' })
    assert.equal(cardRedeem.data.key, card, 'Karte = Schlüssel')
    assert.equal(cardRedeem.data.fromOthers, true, 'wer die Karte weitergab, kennt den Schlüssel')
  })

  await t.test('Punkt 10: die Start-Codes einer Familie zählen für niemandes Obergrenze', async () => {
    const deputy = await createHousehold(base, 'Zuhause Stellvertretung Start')
    const rudel = await createFamily(base, 'Familie Start', 'familie-start-pw-1')
    db.prepare("INSERT INTO family_members (member_family_id, group_family_id, rolle) VALUES (?, ?, 'stellvertretung')").run(deputy.data.id, rudel.data.id)
    const inRudel = getCookie((await post('/api/view', { familyId: rudel.data.id }, deputy.cookie)).res)
    const list = (await get('/api/vouchers/mine', inRudel)).data
    assert.equal(list.length, config.voucherQuota)
    assert.ok(list.every((voucher) => voucher.eigen === false))
    assert.equal((await get('/api/vouchers/grenze', deputy.cookie)).data.offen, 0)
  })

  await t.test('M-2: wer geht, nimmt seine Einladungen mit; eine Stellvertretung alle der Familie', async () => {
    const leader = await createHousehold(base, 'Zuhause Leitung Austritt')
    const deputy = await createHousehold(base, 'Zuhause Stellvertretung Austritt')
    const member = await createHousehold(base, 'Zuhause Mitglied Austritt')
    const rudel = await createFamily(base, 'Familie Austritt', 'familie-austritt-pw-1')
    db.prepare(
      `INSERT INTO family_members (member_family_id, group_family_id, rolle) VALUES (?, ?, 'leitung'), (?, ?, 'stellvertretung'), (?, ?, 'mitglied')`
    ).run(leader.data.id, rudel.data.id, deputy.data.id, rudel.data.id, member.data.id, rudel.data.id)
    const leaderIn = getCookie((await post('/api/view', { familyId: rudel.data.id }, leader.cookie)).res)
    const deputyIn = getCookie((await post('/api/view', { familyId: rudel.data.id }, deputy.cookie)).res)

    const starters = (await get('/api/vouchers/mine', leaderIn)).data.map((voucher) => voucher.id)
    const leaderOwn = (await post('/api/vouchers', {}, leaderIn)).data.id
    const deputyOwn = (await post('/api/vouchers', {}, deputyIn)).data.id
    // Admin-Karte für die Familie: kannte niemand im Klartext - bleibt
    const adminCard = (await post('/api/admin/voucher-batches', { label: 'Familie Austritt Karte', size: 1, joinFamilyId: rudel.data.id }, admin)).data
    const adminCardId = db.prepare('SELECT id FROM vouchers WHERE batch_id = ?').get(adminCard.batch.id).id

    // Die Stellvertretung geht: alle offenen Codes der Familie werden zurückgezogen, die Admin-Karte bleibt
    assert.equal((await del(`/api/memberships/${rudel.data.id}`, deputy.cookie)).status, 200)
    const open = openOf(rudel.data.id)
    for (const id of [...starters, leaderOwn, deputyOwn]) assert.ok(!open.includes(id), `Code ${id} zurückgezogen`)
    assert.ok(open.includes(adminCardId))
    // Die Start-Codes entstehen neu
    const refilled = (await get('/api/vouchers/mine', leaderIn)).data.filter((voucher) => voucher.status === 'offen')
    assert.equal(refilled.length, config.voucherQuota)

    // Ein Mitglied, das selbst einen Code hatte (früher Stellvertretung, dann herabgestuft), nimmt nur den eigenen mit
    db.prepare("UPDATE family_members SET rolle = 'stellvertretung' WHERE member_family_id = ?").run(member.data.id)
    const memberIn = getCookie((await post('/api/view', { familyId: rudel.data.id }, member.cookie)).res)
    const memberOwn = (await post('/api/vouchers', {}, memberIn)).data.id
    db.prepare("UPDATE family_members SET rolle = 'mitglied' WHERE member_family_id = ?").run(member.data.id)
    const before = openOf(rudel.data.id).length
    assert.equal((await del(`/api/family/members/${member.data.id}`, leaderIn)).status, 204)
    const after = openOf(rudel.data.id)
    assert.ok(!after.includes(memberOwn))
    assert.equal(after.length, before - 1)
  })

  await t.test('M-2 (Audit V7a): wer von der Stellvertretung zum Mitglied herabgestuft wird, nimmt alle Einladungen mit', async () => {
    const leader = await createHousehold(base, 'Zuhause Leitung Herabstufung')
    const deputy = await createHousehold(base, 'Zuhause Stellvertretung Herabstufung')
    const rudel = await createFamily(base, 'Familie Herabstufung', 'familie-herabstufung-pw-1')
    db.prepare(`INSERT INTO family_members (member_family_id, group_family_id, rolle) VALUES (?, ?, 'leitung'), (?, ?, 'stellvertretung')`).run(
      leader.data.id,
      rudel.data.id,
      deputy.data.id,
      rudel.data.id
    )
    const leaderIn = getCookie((await post('/api/view', { familyId: rudel.data.id }, leader.cookie)).res)
    const deputyIn = getCookie((await post('/api/view', { familyId: rudel.data.id }, deputy.cookie)).res)
    const put = (urlPath, body, cookie) => call(base, urlPath, { method: 'PUT', body, cookie })

    const starters = (await get('/api/vouchers/mine', deputyIn)).data.map((voucher) => voucher.id)
    const deputyOwn = (await post('/api/vouchers', {}, deputyIn)).data.id
    const adminCard = (await post('/api/admin/voucher-batches', { label: 'Familie Herabstufung Karte', size: 1, joinFamilyId: rudel.data.id }, admin)).data
    const adminCardId = db.prepare('SELECT id FROM vouchers WHERE batch_id = ?').get(adminCard.batch.id).id

    // Rollenwechsel innerhalb von "sieht alle Codes" (Stellvertretung -> Leitung) zieht nichts zurück
    assert.equal((await put(`/api/family/members/${deputy.data.id}`, { rolle: 'leitung' }, leaderIn)).status, 200)
    assert.equal((await put(`/api/family/members/${deputy.data.id}`, { rolle: 'stellvertretung' }, leaderIn)).status, 200)
    for (const id of [...starters, deputyOwn]) assert.ok(openOf(rudel.data.id).includes(id), `Code ${id} bleibt offen`)

    // Herabstufen zum Mitglied: alle offenen Codes der Familie sind zurückgezogen, die Admin-Karte bleibt
    assert.equal((await put(`/api/family/members/${deputy.data.id}`, { rolle: 'mitglied' }, leaderIn)).status, 200)
    const open = openOf(rudel.data.id)
    for (const id of [...starters, deputyOwn]) assert.ok(!open.includes(id), `Code ${id} zurückgezogen`)
    assert.ok(open.includes(adminCardId))
    const refilled = (await get('/api/vouchers/mine', leaderIn)).data.filter((voucher) => voucher.status === 'offen')
    assert.equal(refilled.length, config.voucherQuota, 'die Start-Codes entstehen neu')
  })

  await t.test('L-5: der Admin sieht persönliche Codes nur als Hinweis und druckt sie nicht', async () => {
    const home = await createHousehold(base, 'Zuhause Admin-Sicht')
    const own = (await get('/api/vouchers/mine', home.cookie)).data[0]
    const batchId = db.prepare('SELECT batch_id FROM vouchers WHERE id = ?').get(own.id).batch_id
    const detail = await get(`/api/admin/voucher-batches/${batchId}`, admin)
    const row = detail.data.vouchers.find((voucher) => voucher.id === own.id)
    assert.equal(row.code, null)
    assert.equal(row.persoenlich, true)
    assert.equal(row.hint, own.hint)
    assert.ok(detail.data.vouchers.every((voucher) => voucher.code === null))
    const print = await get(`/api/admin/voucher-batches/${batchId}/print`, admin)
    assert.deepEqual(print.data.codes, [])

    const cards = await post('/api/admin/voucher-batches', { label: 'Karten Admin-Sicht', size: 1 }, admin)
    const cardDetail = await get(`/api/admin/voucher-batches/${cards.data.batch.id}`, admin)
    assert.match(cardDetail.data.vouchers[0].code, /^[0-9A-Z]{4}-/)
  })

  await t.test('INFO: ein beschädigter Geheimtext bricht /mine nicht ab; abgelaufene verlieren ihn beim Lesen', async () => {
    const home = await createHousehold(base, 'Zuhause Kaputt')
    const list = (await get('/api/vouchers/mine', home.cookie)).data
    db.prepare("UPDATE vouchers SET code_cipher = 'kaputt' WHERE id = ?").run(list[0].id)
    db.prepare("UPDATE vouchers SET expires_at = datetime('now', '-1 minute') WHERE id = ?").run(list[1].id)
    const res = await get('/api/vouchers/mine', home.cookie)
    assert.equal(res.status, 200)
    const broken = res.data.find((voucher) => voucher.id === list[0].id)
    assert.equal(broken.code, null)
    assert.equal(broken.codeFehler, true)
    assert.equal(db.prepare('SELECT code_cipher FROM vouchers WHERE id = ?').get(list[1].id).code_cipher, null)
  })
})
