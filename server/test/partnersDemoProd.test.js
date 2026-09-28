const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call } = require('./helpers')

// appEnv wird beim ersten require('../config') fest eingelesen (siehe config.js) - für "läuft wirklich
// wie in Produktion" braucht es deshalb eine eigene Testdatei mit APP_ENV=production von Anfang an
// (wie schon appenv.test.js/cookieIsolation.test.js es für 'staging' machen).
const dataDir = useTempDataDir('partners-demo-prod', { APP_ENV: 'production' })

test('Partner: Demo-Partner erscheinen in Produktion nicht in der echten Liste, nur mit ?demo=1', async (t) => {
  const config = require('../config')
  assert.equal(config.appEnv, 'production')

  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')

  db.prepare(
    `INSERT INTO partners (slug, name, typ, status, plz, ort, lat, lon, is_demo)
     VALUES ('demo-tierheim-prod', 'Demo-Tierheim', 'tierheim', 'aktiv', '10115', 'Berlin', 52.532, 13.385, 1)`
  ).run()
  db.prepare(
    `INSERT INTO partners (slug, name, typ, status, plz, ort, lat, lon, is_demo)
     VALUES ('echter-partner-prod', 'Echter Partner', 'tierheim', 'aktiv', '10115', 'Berlin', 52.532, 13.385, 0)`
  ).run()

  await t.test('ohne ?demo=1: Demo-Partner fehlt in Liste und Portal, echter Partner bleibt', async () => {
    const list = await call(base, '/api/public/partners')
    assert.equal(list.status, 200)
    assert.ok(!list.data.some((p) => p.slug === 'demo-tierheim-prod'))
    assert.ok(list.data.some((p) => p.slug === 'echter-partner-prod'))

    const portal = await call(base, '/api/public/partners/demo-tierheim-prod')
    assert.equal(portal.status, 404)
  })

  await t.test('mit ?demo=1: Demo-Partner erscheint wieder', async () => {
    const list = await call(base, '/api/public/partners?demo=1')
    assert.ok(list.data.some((p) => p.slug === 'demo-tierheim-prod'))

    const portal = await call(base, '/api/public/partners/demo-tierheim-prod?demo=1')
    assert.equal(portal.status, 200)
  })

  await t.test('Umkreissuche berücksichtigt die gleiche Demo-Regel', async () => {
    const nearWithoutDemo = await call(base, '/api/public/partners?plz=10115&radius=10')
    assert.ok(!nearWithoutDemo.data.some((p) => p.slug === 'demo-tierheim-prod'))

    const nearWithDemo = await call(base, '/api/public/partners?plz=10115&radius=10&demo=1')
    assert.ok(nearWithDemo.data.some((p) => p.slug === 'demo-tierheim-prod'))
  })
})
