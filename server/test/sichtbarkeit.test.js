const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, createHousehold, createFamily } = require('./helpers')

// „Wer sieht was“ (lib/sichtbarkeit.js, GET /api/sichtbarkeit/uebersicht): je eigenem Tier private/geteilte Erinnerungen
// und das mitlesende Tierheim - nur lesen, nur eigene Daten, no-store.

const dataDir = useTempDataDir('sichtbarkeit')

test('Wer sieht was – Übersicht', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')

  const home = await createHousehold(base, 'Zuhause Kiefernweg')
  const other = await createHousehold(base, 'Zuhause Lindenhof')
  const post = (path, body, cookie = home.cookie) => call(base, path, { method: 'POST', body, cookie })
  const get = (path, cookie = home.cookie) => call(base, path, { cookie })

  const benno = (await post('/api/dogs', { name: 'Benno', geschlecht: 'ruede' })).data
  const wilma = (await post('/api/dogs', { name: 'Wilma', geschlecht: 'huendin' })).data
  const lotte = (await post('/api/dogs', { name: 'Lotte', geschlecht: 'huendin' }, other.cookie)).data
  const entry = (dogId, extra = {}) => ({ dogId, autorName: 'Pepper', datum: '2026-09-01', titel: 'Am See', ...extra })
  await post('/api/timeline', entry(benno.id, { privat: true }))
  await post('/api/timeline', entry(benno.id, { privat: true }))
  await post('/api/timeline', entry(benno.id))
  await post('/api/timeline', entry(lotte.id, { privat: true }), other.cookie)

  await t.test('zählt je eigenem Tier private und geteilte Erinnerungen, nichts Fremdes, no-store', async () => {
    const res = await get('/api/sichtbarkeit/uebersicht')
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('cache-control'), 'no-store')
    assert.deepEqual(res.data.tiere, [
      { id: benno.id, privat: 2, geteilt: 1, tierheim: null },
      { id: wilma.id, privat: 0, geteilt: 0, tierheim: null }
    ])
    const fremd = await get('/api/sichtbarkeit/uebersicht', other.cookie)
    assert.deepEqual(fremd.data.tiere, [{ id: lotte.id, privat: 1, geteilt: 0, tierheim: null }])
  })

  await t.test('abgebendes Tierheim: Name und ob es mitliest', async () => {
    db.prepare("INSERT INTO families (name, password_hash, art) VALUES ('Tierheim Flocke', 'x', 'tierheim')").run()
    const shelterId = db.prepare("SELECT id FROM families WHERE name = 'Tierheim Flocke'").get().id
    db.prepare('INSERT INTO dog_transfers (dog_id, from_family_id, to_family_id) VALUES (?, ?, ?)').run(wilma.id, shelterId, home.data.familyId ?? null)
    let res = await get('/api/sichtbarkeit/uebersicht')
    assert.deepEqual(res.data.tiere[1].tierheim, { name: 'Tierheim Flocke', liestMit: false })
    db.prepare('INSERT INTO dog_shares (dog_id, family_id) VALUES (?, ?)').run(wilma.id, shelterId)
    res = await get('/api/sichtbarkeit/uebersicht')
    assert.deepEqual(res.data.tiere[1].tierheim, { name: 'Tierheim Flocke', liestMit: true })
  })

  await t.test('ohne Anmeldung 401, außerhalb des eigenen Zuhauses 403 - beides no-store', async () => {
    const anon = await call(base, '/api/sichtbarkeit/uebersicht')
    assert.equal(anon.status, 401)
    assert.equal(anon.headers.get('cache-control'), 'no-store')
    const rudel = await createFamily(base, 'Familie Sonnenhang', 'rudel-passwort-123')
    const res = await get('/api/sichtbarkeit/uebersicht', rudel.cookie)
    assert.equal(res.status, 403)
    assert.equal(res.data.tiere, undefined)
  })
})
