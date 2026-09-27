const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, createFamily, getCookie } = require('./helpers')

const dataDir = useTempDataDir('demo')

test('demo families are read-only, however you get in', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')

  await t.test('without a demo family, /api/demo says so', async () => {
    const res = await call(base, '/api/demo', { method: 'POST' })
    assert.equal(res.status, 404)
  })

  const rudel = await createFamily(base, 'Rudel Demo', 'demo-passwort')
  db.prepare('UPDATE families SET is_demo = 1 WHERE id = ?').run(rudel.data.id)

  await t.test('reads still work on the session from creation', async () => {
    const res = await call(base, '/api/dogs', { cookie: rudel.cookie })
    assert.equal(res.status, 200)
  })

  await t.test('writes are blocked even though the login itself was a normal one', async () => {
    const res = await call(base, '/api/dogs', {
      method: 'POST',
      cookie: rudel.cookie,
      body: { name: 'Hermes', geschlecht: 'ruede' }
    })
    assert.equal(res.status, 403)
    assert.match(res.data.error, /Demo-Modus/)
  })

  await t.test('/api/me reports isDemo', async () => {
    const res = await call(base, '/api/me', { cookie: rudel.cookie })
    assert.equal(res.data.isDemo, true)
  })

  await t.test('/api/demo logs in without a password', async () => {
    const res = await call(base, '/api/demo', { method: 'POST' })
    assert.equal(res.status, 200)
    assert.equal(res.data.id, rudel.data.id)
    assert.equal(res.data.isDemo, true)
    const demoCookie = getCookie(res.res)

    const dogs = await call(base, '/api/dogs', { cookie: demoCookie })
    assert.equal(dogs.status, 200)

    const write = await call(base, '/api/dogs', { method: 'POST', cookie: demoCookie, body: { name: 'X', geschlecht: 'ruede' } })
    assert.equal(write.status, 403)
  })

  await t.test('a normal family is unaffected', async () => {
    const other = await createFamily(base, 'Rudel B', 'passwortB')
    const write = await call(base, '/api/dogs', {
      method: 'POST',
      cookie: other.cookie,
      body: { name: 'Bella', geschlecht: 'huendin' }
    })
    assert.equal(write.status, 201)
  })
})
