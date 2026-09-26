const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call } = require('./helpers')

const dataDir = useTempDataDir('admin-disabled')
delete process.env.ADMIN_PASSWORD_HASH

test('without ADMIN_PASSWORD_HASH there is no admin access at all', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  assert.equal((await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: '' } })).status, 404)
  assert.equal((await call(base, '/api/admin/overview')).status, 404)
})
