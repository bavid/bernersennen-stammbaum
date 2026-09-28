const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call } = require('./helpers')

// GET /api/config liefert zusaetzlich legal { name, address, email, phone } aus IMPRESSUM_* (Task 7).
// Ohne gesetzte Umgebungsvariablen bleiben alle vier Felder leere Strings - nie erfundene Angaben.
const dataDir = useTempDataDir('legal-empty')

test('config.legal: ohne IMPRESSUM_* bleiben alle Felder leere Strings', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const res = await call(base, '/api/config')
  assert.equal(res.status, 200)
  assert.deepEqual(res.data.legal, { name: '', address: '', email: '', phone: '' })
})

test('readLegal() wandelt literales \\n in der Adresse in echte Zeilenumbrueche um', () => {
  const { readLegal } = require('../config')
  const legal = readLegal({
    IMPRESSUM_NAME: 'Tierheim Sonnenhang e.V.',
    IMPRESSUM_ADRESSE: 'Musterstraße 1\\n12345 Musterstadt',
    IMPRESSUM_EMAIL: 'kontakt@example.org',
    IMPRESSUM_TELEFON: '+49 30 1234567'
  })
  assert.deepEqual(legal, {
    name: 'Tierheim Sonnenhang e.V.',
    address: 'Musterstraße 1\n12345 Musterstadt',
    email: 'kontakt@example.org',
    phone: '+49 30 1234567'
  })
})

test('readLegal() ohne Angaben liefert leere Strings statt undefined/null', () => {
  const { readLegal } = require('../config')
  assert.deepEqual(readLegal({}), { name: '', address: '', email: '', phone: '' })
})
