const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call } = require('./helpers')

// Öffentliches Entdecken: eigenes Limit je IP (ENTDECKEN_RATE_LIMIT, routes/publicEntdecken.js) - GET und POST zählen gemeinsam.
const dataDir = useTempDataDir('public-entdecken-limit', { ENTDECKEN_RATE_LIMIT: '3' })

test('Öffentliches Entdecken: nach dem Limit 429 mit Hinweis', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))

  assert.equal((await call(base, '/api/public/entdecken')).status, 200)
  assert.equal((await call(base, '/api/public/entdecken', { method: 'POST', body: { plz: '10115', radius: 25 } })).status, 200)
  assert.equal((await call(base, '/api/public/entdecken?q=hund')).status, 200)
  const limited = await call(base, '/api/public/entdecken')
  assert.equal(limited.status, 429)
  assert.match(limited.data.error, /Zu viele Anfragen/)
})
