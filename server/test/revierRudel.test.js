const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call } = require('./helpers')

// Phase M: in einer Rudel-Instanz (INSTANZ_MODUS=rudel) gibt es „Mein Revier“ nicht - 404 wie ein unbekannter Pfad.
const dataDir = useTempDataDir('revier-rudel', { INSTANZ_MODUS: 'rudel' })

test('Rudel-Instanz: Mein Revier antwortet 404', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  for (const [method, path] of [['POST', '/api/revier/radar'], ['GET', '/api/revier/einstellungen'], ['GET', '/api/revier/feed']]) {
    const res = await call(base, path, { method, body: method === 'POST' ? { plz: '21037', umkreis: 5 } : undefined })
    assert.equal(res.status, 404, `${method} ${path}`)
    assert.equal(res.headers.get('x-robots-tag'), 'noindex')
  }
})
