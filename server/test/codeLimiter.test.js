const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call } = require('./helpers')

// Kleines Limit, damit der Test es schnell erreicht (Standard ist 20 / 15 min, siehe abuse.js)
const dataDir = useTempDataDir('codeLimiter', { CODE_RATE_LIMIT: '3' })

test('codeLimiter greift nach wenigen Versuchen', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))

  const check = () => call(base, '/api/vouchers/check', { method: 'POST', body: { code: 'ZZZZ-ZZZZ-ZZZZ' } })

  const statuses = []
  for (let i = 0; i < 5; i += 1) {
    statuses.push((await check()).status)
  }

  assert.deepEqual(statuses.slice(0, 3), [200, 200, 200])
  assert.equal(statuses[3], 429)
  assert.equal(statuses[4], 429)
})
