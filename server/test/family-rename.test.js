const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, createFamily } = require('./helpers')

const dataDir = useTempDataDir('family-rename')

test('a pack can rename itself', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))

  const a = await createFamily(base, 'Rudel A', 'passwortA')
  const b = await createFamily(base, 'Rudel B', 'passwortB')
  const rename = (cookie, name) => call(base, '/api/family', { method: 'PUT', cookie, body: { name } })

  await t.test('renames only the own pack, trimmed', async () => {
    const res = await rename(a.cookie, '  BernerSennen Familie Sonnenhang  ')
    assert.equal(res.status, 200)
    assert.equal(res.data.name, 'BernerSennen Familie Sonnenhang')
    assert.equal((await call(base, '/api/me', { cookie: a.cookie })).data.name, 'BernerSennen Familie Sonnenhang')
    assert.equal((await call(base, '/api/me', { cookie: b.cookie })).data.name, 'Rudel B')
  })

  await t.test('rejects empty and overlong names', async () => {
    assert.equal((await rename(a.cookie, '   ')).status, 400)
    assert.equal((await rename(a.cookie, 'x'.repeat(81))).status, 400)
  })

  await t.test('requires a session', async () => {
    assert.equal((await rename('', 'Neu')).status, 401)
  })

  await t.test('the password keeps working after renaming', async () => {
    const login = await call(base, '/api/login', { method: 'POST', body: { password: 'passwortA' } })
    assert.equal(login.data.name, 'BernerSennen Familie Sonnenhang')
  })
})
