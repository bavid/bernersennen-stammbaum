const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, createFamily, createHousehold } = require('./helpers')

const dataDir = useTempDataDir('rundgang', { LOGIN_RATE_LIMIT: '300', CODE_RATE_LIMIT: '300' })

// Rundgang (lib/profil.js rundgang_status, PUT /api/profil/rundgang): je Zuhause bzw. Familien-Login, in /me als rundgang.
test('Rundgang: Stand je Identität, Prüfung, Demo gesperrt', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const home = await createHousehold(base, 'Zuhause am Deich')
  const other = await createHousehold(base, 'Zuhause Fremdweg')
  const rudel = await createFamily(base, 'Familie Sonnenhang', 'sonnenhang-pass-1')
  const put = (cookie, body) => call(base, '/api/profil/rundgang', { method: 'PUT', cookie, body })
  const rundgangOf = async (cookie) => (await call(base, '/api/me', { cookie })).data.rundgang

  await t.test('neu, gespeichert je Identität, ungültig 400, Demo 403', async () => {
    assert.equal(await rundgangOf(home.cookie), 'neu')
    assert.equal(await rundgangOf(rudel.cookie), 'neu')

    const res = await put(home.cookie, { status: 'aus' })
    assert.equal(res.status, 200)
    assert.deepEqual(res.data, { rundgang: 'aus' })
    assert.equal(await rundgangOf(home.cookie), 'aus')
    assert.equal(await rundgangOf(other.cookie), 'neu')

    assert.equal((await put(rudel.cookie, { status: 'fertig' })).status, 200)
    assert.equal(await rundgangOf(rudel.cookie), 'fertig')

    for (const body of [{ status: 'quatsch' }, {}, { status: 1 }, null]) {
      assert.equal((await put(home.cookie, body)).status, 400, JSON.stringify(body))
    }
    assert.equal(await rundgangOf(home.cookie), 'aus')
    assert.equal((await put(null, { status: 'neu' })).status, 401)

    const homeId = home.data.home?.id ?? home.data.id
    db.prepare('UPDATE families SET is_demo = 1 WHERE id = ?').run(homeId)
    assert.equal((await put(home.cookie, { status: 'neu' })).status, 403)
    db.prepare('UPDATE families SET is_demo = 0 WHERE id = ?').run(homeId)
  })
})
