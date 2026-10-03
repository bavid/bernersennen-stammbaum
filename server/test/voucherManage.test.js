const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, createFamily, createHousehold, getCookie } = require('./helpers')

const dataDir = useTempDataDir('voucher-manage', { LOGIN_RATE_LIMIT: '400', CODE_RATE_LIMIT: '400' })

test('Phase V2b: eigene Einladungen verwalten - höchstens 5 offen, Beschriftung, Löschen, Archiv', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const config = require('../config')
  const { MAX_OPEN_CODES, LIMIT_MESSAGE } = require('../lib/voucherManage')

  const get = (urlPath, cookie) => call(base, urlPath, { cookie })
  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const put = (urlPath, body, cookie) => call(base, urlPath, { method: 'PUT', body, cookie })
  const del = (urlPath, cookie) => call(base, urlPath, { method: 'DELETE', cookie })
  const mine = (cookie, archiv = false) => get(`/api/vouchers/mine${archiv ? '?archiv=1' : ''}`, cookie)
  const openCount = (list) => list.filter((voucher) => voucher.status === 'offen').length

  const home = await createHousehold(base, 'Zuhause Codes')
  const other = await createHousehold(base, 'Zuhause Nachbar')

  await t.test('Obergrenze: Gutscheine und Besuchs-Einladungen zusammen höchstens 5 offen (409)', async () => {
    assert.equal(MAX_OPEN_CODES, 5)
    const first = await mine(home.cookie)
    assert.equal(openCount(first.data), config.voucherQuota)
    assert.ok(first.data.every((voucher) => voucher.eigen === true))

    assert.equal((await post('/api/besuche/einladungen', {}, home.cookie)).status, 201)
    assert.equal((await post('/api/vouchers', {}, home.cookie)).status, 201)
    assert.deepEqual((await get('/api/vouchers/grenze', home.cookie)).data, { offen: 5, max: 5, frei: 0 })

    const tooMany = await post('/api/vouchers', {}, home.cookie)
    assert.equal(tooMany.status, 409)
    assert.equal(tooMany.data.error, LIMIT_MESSAGE)
    assert.equal((await post('/api/besuche/einladungen', {}, home.cookie)).status, 409)
    assert.equal(openCount((await mine(home.cookie)).data), 5)
  })

  await t.test('eingelöst oder abgelaufen gibt einen Platz frei', async () => {
    const list = (await mine(home.cookie)).data
    const passOn = list.find((voucher) => voucher.status === 'offen' && !voucher.besuch)
    assert.equal((await post('/api/vouchers/redeem', { code: passOn.code, name: 'Zuhause Neu durch Code' })).status, 201)
    assert.equal((await get('/api/vouchers/grenze', home.cookie)).data.frei, 1)
    const created = await post('/api/vouchers', {}, home.cookie)
    assert.equal(created.status, 201)
    assert.equal(created.data.status, 'offen')
    assert.match(created.data.code, /^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/)

    const visit = list.find((voucher) => voucher.besuch)
    db.prepare("UPDATE vouchers SET expires_at = datetime('now', '-1 minute') WHERE id = ?").run(visit.id)
    assert.equal((await get('/api/vouchers/grenze', home.cookie)).data.frei, 1)
    assert.equal((await mine(home.cookie)).data.find((voucher) => voucher.id === visit.id).status, 'abgelaufen')
  })

  await t.test('Löschen zieht den Code zurück und blendet ihn aus - ohne dass das Kontingent nachschiebt', async () => {
    const before = (await mine(home.cookie)).data
    const target = before.find((voucher) => voucher.status === 'offen')
    assert.equal((await del(`/api/vouchers/${target.id}`, home.cookie)).status, 204)
    const after = (await mine(home.cookie)).data
    assert.equal(after.some((voucher) => voucher.id === target.id), false)
    assert.equal(after.length, before.length - 1, 'kein neuer Code als Ersatz')
    const row = db.prepare('SELECT revoked_at, ausgeblendet_at, code_cipher FROM vouchers WHERE id = ?').get(target.id)
    assert.ok(row.revoked_at && row.ausgeblendet_at)
    assert.equal(row.code_cipher, null)
    assert.equal((await post('/api/vouchers/check', { code: target.code })).data.status, 'widerrufen')
    assert.equal((await del(`/api/vouchers/${target.id}`, home.cookie)).status, 404)

    // abgelaufene lassen sich ebenfalls löschen; eingelöste nicht; fremde nicht
    const expired = after.find((voucher) => voucher.status === 'abgelaufen')
    assert.equal((await del(`/api/vouchers/${expired.id}`, home.cookie)).status, 204)
    const redeemed = (await mine(home.cookie, true)).data[0]
    assert.equal((await del(`/api/vouchers/${redeemed.id}`, home.cookie)).status, 404)
    const own = (await mine(home.cookie)).data.find((voucher) => voucher.status === 'offen')
    assert.equal((await del(`/api/vouchers/${own.id}`, other.cookie)).status, 404)
  })

  await t.test('Beschriftung: nur der Ersteller setzt und sieht sie, höchstens 60 Zeichen', async () => {
    const target = (await mine(home.cookie)).data.find((voucher) => voucher.status === 'offen')
    const res = await put(`/api/vouchers/${target.id}/label`, { label: '  Tante   Ilse ' }, home.cookie)
    assert.deepEqual(res.data, { id: target.id, label: 'Tante Ilse' })
    assert.equal((await mine(home.cookie)).data.find((voucher) => voucher.id === target.id).label, 'Tante Ilse')
    assert.equal((await put(`/api/vouchers/${target.id}/label`, { label: 'x'.repeat(61) }, home.cookie)).status, 400)
    assert.equal((await put(`/api/vouchers/${target.id}/label`, { label: 5 }, home.cookie)).status, 400)
    assert.equal((await put(`/api/vouchers/${target.id}/label`, { label: 'Gekapert' }, other.cookie)).status, 404)
    assert.equal((await put(`/api/vouchers/${target.id}/label`, { label: '' }, home.cookie)).data.label, null)
  })

  await t.test('Archiv: eingelöste mit neueChronik; eine Besuchs-Einladung eines bestehenden Zuhauses zählt nicht', async () => {
    const visit = await post('/api/besuche/einladungen', {}, other.cookie)
    await post('/api/besuche/einloesen', { code: visit.data.code }, home.cookie)
    const archive = (await mine(other.cookie, true)).data
    assert.equal(archive.length, 1)
    assert.equal(archive[0].besuch, true)
    assert.equal(archive[0].neueChronik, false)
    assert.ok((await mine(home.cookie, true)).data.every((voucher) => voucher.neueChronik === true))
  })

  // Start-Codes einer Familie gehören der Familie (security-review V2, Punkt 10); selbst angelegte Familien-
  // Einladungen gehören ihrem Ersteller und zählen für dessen Obergrenze.
  await t.test('Familien-Einladungen zählen mit; Beschriftung je Ersteller; nach dem Verlassen zählen sie nicht mehr', async () => {
    const leader = await createHousehold(base, 'Zuhause Leitung Codes')
    const deputy = await createHousehold(base, 'Zuhause Stellvertretung Codes')
    const rudel = await createFamily(base, 'Familie Codes', 'familie-codes-pw-1')
    db.prepare("INSERT INTO family_members (member_family_id, group_family_id, rolle) VALUES (?, ?, 'leitung'), (?, ?, 'stellvertretung')").run(
      leader.data.id,
      rudel.data.id,
      deputy.data.id,
      rudel.data.id
    )
    const deputyInRudel = getCookie((await post('/api/view', { familyId: rudel.data.id }, deputy.cookie)).res)
    const leaderInRudel = getCookie((await post('/api/view', { familyId: rudel.data.id }, leader.cookie)).res)

    const starters = (await mine(deputyInRudel)).data
    assert.equal(starters.length, config.voucherQuota)
    assert.ok(starters.every((voucher) => voucher.joins && voucher.eigen === false))
    assert.equal((await put(`/api/vouchers/${starters[0].id}/label`, { label: 'x' }, deputyInRudel)).status, 404)
    assert.equal((await get('/api/vouchers/grenze', deputy.cookie)).data.offen, 0)

    const own = (await post('/api/vouchers', {}, deputyInRudel)).data
    assert.equal(own.eigen, true)
    await put(`/api/vouchers/${own.id}/label`, { label: 'Für die Nachbarn' }, deputyInRudel)
    const leaderView = (await mine(leaderInRudel)).data.find((voucher) => voucher.id === own.id)
    assert.equal(leaderView.eigen, false)
    assert.equal(leaderView.label, null)

    // Eine eigene Familien-Einladung und vier Besuchs-Einladungen: die Stellvertretung ist voll - auch in der Familie.
    for (let i = 0; i < 4; i += 1) assert.equal((await post('/api/besuche/einladungen', {}, deputy.cookie)).status, 201)
    assert.equal((await post('/api/vouchers', {}, deputyInRudel)).status, 409)
    // Die Leitung darf die Einladung der Stellvertretung löschen (Moderation)
    assert.equal((await del(`/api/vouchers/${own.id}`, leaderInRudel)).status, 204)
    assert.equal((await post('/api/vouchers', {}, deputyInRudel)).status, 201)

    db.prepare('DELETE FROM family_members WHERE member_family_id = ? AND group_family_id = ?').run(deputy.data.id, rudel.data.id)
    assert.equal((await get('/api/vouchers/grenze', deputy.cookie)).data.offen, 4)
  })

  await t.test('Partner-Bereiche haben keine Obergrenze; die Demo zeigt ihre Schein-Zahlen und schreibt nichts', async () => {
    const partnerArea = await createFamily(base, 'Partner Codes', 'partner-codes-pw-1', { art: 'partner' })
    assert.deepEqual((await get('/api/vouchers/grenze', partnerArea.cookie)).data, { offen: 0, max: null, frei: null })

    const demo = await createHousehold(base, 'Zuhause Demo Codes')
    db.prepare('UPDATE families SET is_demo = 1 WHERE id = ?').run(demo.data.id)
    assert.deepEqual((await get('/api/vouchers/grenze', demo.cookie)).data, { offen: 2, max: 5, frei: 3 })
    assert.equal((await post('/api/vouchers', {}, demo.cookie)).status, 403)
    assert.equal((await del('/api/vouchers/1', demo.cookie)).status, 403)
    assert.equal((await put('/api/vouchers/1/label', { label: 'x' }, demo.cookie)).status, 403)
  })

  await t.test('zu Besuch sind alle Code-Wege gesperrt', async () => {
    const guestView = getCookie((await post('/api/view', { familyId: other.data.id }, home.cookie)).res)
    assert.equal((await mine(guestView)).status, 403)
    assert.equal((await get('/api/vouchers/grenze', guestView)).status, 403)
    assert.equal((await post('/api/vouchers', {}, guestView)).status, 403)
  })
})
