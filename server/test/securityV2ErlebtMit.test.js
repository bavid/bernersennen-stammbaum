const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, createHousehold } = require('./helpers')

const dataDir = useTempDataDir('security-v2-erlebt', { LOGIN_RATE_LIMIT: '400', CODE_RATE_LIMIT: '400', WRITE_RATE_LIMIT: '1000' })

// security-review Phase V2, zweite Runde: „Erlebt mit“ (L-1 getrennt, L-2 Autor-Name, L-3 Grenze und „alle ablehnen“).
test('security-review V2 (Runde 2): Erlebt mit', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const { MAX_OPEN_PER_HOME } = require('../lib/erlebtMit')

  const get = (urlPath, cookie) => call(base, urlPath, { cookie })
  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const put = (urlPath, body, cookie) => call(base, urlPath, { method: 'PUT', body, cookie })
  const del = (urlPath, cookie) => call(base, urlPath, { method: 'DELETE', cookie })

  async function connectedPair(authorName, ownerName) {
    const author = await createHousehold(base, authorName)
    const owner = await createHousehold(base, ownerName)
    const invite = await post('/api/besuche/einladungen', {}, author.cookie)
    await post('/api/besuche/einloesen', { code: invite.data.code }, owner.cookie)
    const balu = (await post('/api/dogs', { name: 'Balu', geschlecht: 'ruede' }, author.cookie)).data
    const wilma = (await post('/api/dogs', { name: 'Wilma', geschlecht: 'huendin' }, owner.cookie)).data
    return { author, owner, balu, wilma }
  }
  const entry = (dogId, titel, erlebtMit) => ({ dogId, autorName: 'Nissen', datum: '2026-05-01', titel, erlebtMit })

  await t.test('L-1: nach dem Trennen sieht die Autorin den Namen des Tiers nicht mehr', async () => {
    const { author, owner, balu, wilma } = await connectedPair('Zuhause Autorin L1', 'Zuhause Besitzer L1')
    const created = (await post('/api/timeline', entry(balu.id, 'Gemeinsam', [wilma.id]), author.cookie)).data
    assert.equal(created.erlebt_mit[0].name, 'Wilma')
    await db.prepare("UPDATE dogs SET name = 'Neuer Name' WHERE id = ?").run(wilma.id)
    await del(`/api/besuche/bei/${author.data.id}`, owner.cookie)
    const timeline = (await get(`/api/timeline?dogId=${balu.id}`, author.cookie)).data
    const tags = timeline.find((e) => e.id === created.id).erlebt_mit
    assert.deepEqual(tags.map(({ getrennt, name, dogId, zuhause }) => ({ getrennt, name, dogId, zuhause })), [
      { getrennt: true, name: undefined, dogId: undefined, zuhause: undefined }
    ])
  })

  await t.test('L-2: ein anderer Autor-Name macht eine Bestätigung wieder zur Anfrage', async () => {
    const { author, owner, balu, wilma } = await connectedPair('Zuhause Autorin L2', 'Zuhause Besitzer L2')
    const created = (await post('/api/timeline', entry(balu.id, 'Ausflug', [wilma.id]), author.cookie)).data
    const requestId = (await get('/api/erlebt-mit/offen', owner.cookie)).data[0].requestId
    await post(`/api/erlebt-mit/${requestId}/bestaetigen`, {}, owner.cookie)
    await put(`/api/timeline/${created.id}`, { autorName: 'Jemand anderes', datum: '2026-05-01', titel: 'Ausflug' }, author.cookie)
    assert.equal(db.prepare('SELECT status FROM erlebt_mit WHERE id = ?').get(requestId).status, 'offen')
  })

  await t.test('L-3: höchstens 20 offene Anfragen je Zuhause an ein anderes (409); „alle ablehnen“', async () => {
    assert.equal(MAX_OPEN_PER_HOME, 20)
    const { author, owner, balu, wilma } = await connectedPair('Zuhause Autorin L3', 'Zuhause Besitzer L3')
    for (let i = 0; i < MAX_OPEN_PER_HOME; i += 1) {
      assert.equal((await post('/api/timeline', entry(balu.id, `Runde ${i}`, [wilma.id]), author.cookie)).status, 201)
    }
    const tooMany = await post('/api/timeline', entry(balu.id, 'Eine zu viel', [wilma.id]), author.cookie)
    assert.equal(tooMany.status, 409)
    assert.match(tooMany.data.error, /20 offene „Erlebt mit“-Anfragen an „Zuhause Besitzer L3“/)
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM timeline_entries WHERE titel = 'Eine zu viel'").get().c, 0, 'nichts halb gespeichert')
    // Ohne Markierung geht der Eintrag weiter
    assert.equal((await post('/api/timeline', entry(balu.id, 'Ohne Markierung', []), author.cookie)).status, 201)

    assert.equal((await get('/api/erlebt-mit/offen', owner.cookie)).data.length, MAX_OPEN_PER_HOME)
    assert.equal((await post(`/api/erlebt-mit/ablehnen-von/${author.data.id}`, {}, author.cookie)).status, 404, 'nur die Besitzer')
    const rejected = await post(`/api/erlebt-mit/ablehnen-von/${author.data.id}`, {}, owner.cookie)
    assert.deepEqual(rejected.data, { abgelehnt: MAX_OPEN_PER_HOME, offen: 0 })
    assert.deepEqual((await get('/api/erlebt-mit/offen', owner.cookie)).data, [])
    assert.equal((await post(`/api/erlebt-mit/ablehnen-von/${author.data.id}`, {}, owner.cookie)).status, 404)
    // Abgelehnte zählen nicht mehr zur Grenze
    assert.equal((await post('/api/timeline', entry(balu.id, 'Wieder möglich', [wilma.id]), author.cookie)).status, 201)
  })
})
