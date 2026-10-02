const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, createHousehold } = require('./helpers')

const dataDir = useTempDataDir('security-v2', { LOGIN_RATE_LIMIT: '400', CODE_RATE_LIMIT: '400' })

// Nachbesserungen aus dem security-review Phase V2/V2b (Besuche, „Erlebt mit“, eigene Einladungen).
test('security-review Phase V2: Schlüssel, Bestätigung nach Änderung, Notizen, Demo-Grenze', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')

  const get = (urlPath, cookie) => call(base, urlPath, { cookie })
  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const put = (urlPath, body, cookie) => call(base, urlPath, { method: 'PUT', body, cookie })

  const issuer = await createHousehold(base, 'Zuhause Ausgabe')

  await t.test('MEDIUM-1: ein selbst angelegter Gutschein wird nicht der Schlüssel des neuen Zuhauses', async () => {
    const code = (await get('/api/vouchers/mine', issuer.cookie)).data[0].code
    const redeem = await post('/api/vouchers/redeem', { code, name: 'Zuhause Eingeladen' })
    assert.equal(redeem.status, 201)
    assert.notEqual(redeem.data.key, code)
    assert.equal((await post('/api/login', { secret: code })).status, 401, 'die Ausgeberin kommt mit dem Code nicht hinein')
    assert.equal((await post('/api/login', { secret: redeem.data.key })).data.id, redeem.data.id)

    // Gedruckte Karten des Admins bleiben "Karte = Schlüssel"
    const { createBatch } = require('../lib/vouchers')
    const { codes } = createBatch(db, { label: 'Karten', kind: 'admin', size: 1 })
    const card = await post('/api/vouchers/redeem', { code: codes[0], name: 'Zuhause Karte' })
    assert.equal(card.data.key.replace(/-/g, ''), codes[0])
  })

  await t.test('MEDIUM-2: ändert die Autorin einen bestätigten Eintrag, muss die andere Seite neu zustimmen', async () => {
    const author = await createHousehold(base, 'Zuhause Autorin')
    const owner = await createHousehold(base, 'Zuhause Besitzer')
    const invite = await post('/api/besuche/einladungen', {}, author.cookie)
    await post('/api/besuche/einloesen', { code: invite.data.code }, owner.cookie)
    const balu = (await post('/api/dogs', { name: 'Balu', geschlecht: 'ruede' }, author.cookie)).data
    const wilma = (await post('/api/dogs', { name: 'Wilma', geschlecht: 'huendin' }, owner.cookie)).data
    const entryBody = { dogId: balu.id, autorName: 'A', datum: '2026-05-01', titel: 'Harmlos', erlebtMit: [wilma.id] }
    const entry = (await post('/api/timeline', entryBody, author.cookie)).data
    const requestId = (await get('/api/erlebt-mit/offen', owner.cookie)).data[0].requestId
    await post(`/api/erlebt-mit/${requestId}/bestaetigen`, {}, owner.cookie)
    assert.ok((await get(`/api/timeline?dogId=${wilma.id}`, owner.cookie)).data.some((e) => e.gespiegelt))

    // Nur die Markierungsliste neu speichern (gleicher Inhalt): bleibt bestätigt
    await put(`/api/timeline/${entry.id}`, { autorName: 'A', datum: '2026-05-01', titel: 'Harmlos', erlebtMit: [wilma.id] }, author.cookie)
    assert.equal(db.prepare('SELECT status FROM erlebt_mit WHERE id = ?').get(requestId).status, 'bestaetigt')

    const changed = await put(`/api/timeline/${entry.id}`, { autorName: 'A', datum: '2026-05-01', titel: 'Ganz anders' }, author.cookie)
    assert.equal(changed.status, 200)
    assert.equal(changed.data.erlebt_mit[0].status, 'offen')
    assert.ok(!(await get(`/api/timeline?dogId=${wilma.id}`, owner.cookie)).data.some((e) => e.gespiegelt), 'nicht mehr gespiegelt')
    const again = (await get('/api/erlebt-mit/offen', owner.cookie)).data
    assert.deepEqual(again.map((r) => r.titel), ['Ganz anders'])
  })

  await t.test('LOW-5: die eigene Notiz verschwindet mit dem Zuhause, das sie geschrieben hat', async () => {
    const writer = await createHousehold(base, 'Zuhause Notiz')
    const voucher = (await get('/api/vouchers/mine', writer.cookie)).data[0]
    await put(`/api/vouchers/${voucher.id}/label`, { label: 'Tante Ilse' }, writer.cookie)
    await post('/api/vouchers/redeem', { code: voucher.code, name: 'Zuhause durch Notiz' })
    const { deleteFamily } = require('../lib/families')
    deleteFamily(db, writer.data.id)
    assert.equal(db.prepare('SELECT label FROM vouchers WHERE id = ?').get(voucher.id).label, null)
  })

  await t.test('LOW-6: eine Verbindung über die Demo-Grenze zählt für „Erlebt mit“ nicht', async () => {
    const real = await createHousehold(base, 'Zuhause Echt')
    const demo = await createHousehold(base, 'Zuhause Demo Grenze')
    db.prepare('UPDATE families SET is_demo = 1 WHERE id = ?').run(demo.data.id)
    db.prepare('INSERT INTO besuche (gast_family_id, gastgeber_family_id) VALUES (?, ?)').run(real.data.id, demo.data.id)
    const { CONNECTED_HOMES_SQL } = require('../lib/visits')
    const connected = db.prepare(`SELECT 1 FROM families WHERE id = @other AND id IN ${CONNECTED_HOMES_SQL}`)
    assert.equal(connected.get({ homeId: real.data.id, other: demo.data.id }), undefined)
    assert.equal(connected.get({ homeId: demo.data.id, other: real.data.id }), undefined)
  })
})
