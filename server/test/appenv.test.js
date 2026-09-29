const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call } = require('./helpers')

const dataDir = useTempDataDir('appenv', { APP_ENV: 'staging' })

test('readAppEnv accepts known environments and falls back to the runtime', () => {
  const { readAppEnv } = require('../config')
  assert.equal(readAppEnv('staging', true), 'staging')
  assert.equal(readAppEnv('dev', false), 'dev')
  assert.equal(readAppEnv('', true), 'production')
  assert.equal(readAppEnv(undefined, false), 'dev')
  assert.equal(readAppEnv('quatsch', true), 'production')
})

test('/api/config tells the client which environment it runs in', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const res = await call(base, '/api/config')
  assert.equal(res.status, 200)
  assert.equal(res.data.appEnv, 'staging')
  // Phase 5 Task 1: publicUrl (PUBLIC_URL) für die QR-Ziele der Druckseite - ohne Angabe null.
  assert.equal(res.data.publicUrl, null)
})
