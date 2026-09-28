const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call } = require('./helpers')

// Gegenstueck zu legal.test.js (dort der leere Fall): mit gesetzten IMPRESSUM_* liefert /api/config sie
// zurueck, die Adresse mit literalem \n als echtem Zeilenumbruch (siehe .env - dort kann kein echter
// Zeilenumbruch stehen).
const dataDir = useTempDataDir('legal-set', {
  IMPRESSUM_NAME: 'Tierheim Sonnenhang e.V.',
  IMPRESSUM_ADRESSE: 'Musterstraße 1\\n12345 Musterstadt',
  IMPRESSUM_EMAIL: 'kontakt@example.org',
  IMPRESSUM_TELEFON: '+49 30 1234567'
})

test('config.legal: gesetzte IMPRESSUM_* kommen bei /api/config an, Adresse mit echtem Zeilenumbruch', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const res = await call(base, '/api/config')
  assert.equal(res.status, 200)
  assert.deepEqual(res.data.legal, {
    name: 'Tierheim Sonnenhang e.V.',
    address: 'Musterstraße 1\n12345 Musterstadt',
    email: 'kontakt@example.org',
    phone: '+49 30 1234567'
  })
})
