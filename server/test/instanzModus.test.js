const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call } = require('./helpers')

// Instanz-Modus (config.instanzModus, lib/instanzModus.js): normale Instanzen bleiben unverändert, nur 'rudel' sperrt.
const dataDir = useTempDataDir('instanzmodus', { INSTANZ_MODUS: '' })

test('Instanz-Modus: Lesen, Sperrliste, normale Instanz unverändert', async (t) => {
  const { readInstanzModus } = require('../config')
  const { isGesperrt, createInstanzSperre } = require('../lib/instanzModus')
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))

  await t.test('nur rudel zählt, Tippfehler sind leer', () => {
    assert.equal(readInstanzModus(' Rudel '), 'rudel')
    assert.equal(readInstanzModus('rudl'), '')
    assert.equal(readInstanzModus(undefined), '')
  })

  await t.test('Sperrliste: Methode und Pfad, Schrägstrich am Ende egal', () => {
    assert.equal(isGesperrt('POST', '/vouchers/redeem/'), true)
    assert.equal(isGesperrt('POST', '/Demo'), true)
    assert.equal(isGesperrt('GET', '/vouchers/mine'), false)
    assert.equal(isGesperrt('POST', '/login'), false)
  })

  await t.test('Middleware lässt im normalen Modus alles durch, im Rudel-Modus 404', () => {
    let weiter = 0
    const res = { status(code) { this.code = code; return this }, json() { return this } }
    createInstanzSperre('')({ method: 'POST', path: '/demo' }, res, () => { weiter += 1 })
    createInstanzSperre('rudel')({ method: 'POST', path: '/login' }, res, () => { weiter += 1 })
    createInstanzSperre('rudel')({ method: 'POST', path: '/demo' }, res, () => { weiter += 1 })
    assert.equal(weiter, 2)
    assert.equal(res.code, 404)
  })

  await t.test('normale Instanz: /api/config meldet leeren Modus, Gutschein-Prüfung erreichbar', async () => {
    assert.equal((await call(base, '/api/config')).data.instanzModus, '')
    const check = await call(base, '/api/vouchers/check', { method: 'POST', body: { code: 'ABCD-EFGH-JKLM' } })
    assert.notEqual(check.status, 404)
  })
})
