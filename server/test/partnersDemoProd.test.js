const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, createFamily } = require('./helpers')

// appEnv wird beim ersten require('../config') fest eingelesen (siehe config.js) - für "läuft wirklich
// wie in Produktion" braucht es deshalb eine eigene Testdatei mit APP_ENV=production von Anfang an
// (wie schon appenv.test.js/cookieIsolation.test.js es für 'staging' machen).
const dataDir = useTempDataDir('partners-demo-prod', { APP_ENV: 'production' })

test('Partner: Demo-Partner erscheinen in Produktion nicht in der echten Liste, auch nicht mit ?demo=1', async (t) => {
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

  await t.test('?demo=1 wird in Produktion nicht beachtet: Demo-Partner bleibt verborgen', async () => {
    const list = await call(base, '/api/public/partners?demo=1')
    assert.ok(!list.data.some((p) => p.slug === 'demo-tierheim-prod'))

    const portal = await call(base, '/api/public/partners/demo-tierheim-prod?demo=1')
    assert.equal(portal.status, 404)
  })

  await t.test('Umkreissuche berücksichtigt die gleiche Demo-Regel', async () => {
    const nearWithoutDemo = await call(base, '/api/public/partners?plz=10115&radius=10')
    assert.ok(!nearWithoutDemo.data.some((p) => p.slug === 'demo-tierheim-prod'))

    const nearWithDemo = await call(base, '/api/public/partners?plz=10115&radius=10&demo=1')
    assert.ok(!nearWithDemo.data.some((p) => p.slug === 'demo-tierheim-prod'))
  })

  // Finding 2 (Abschluss-Review Phase 2): "Zum Portal" für einen Demo-Partner (z. B. aus /umgebung
  // heraus) 404te in Produktion für eine angemeldete Demo-Familie, weil demoAllowed() dort nur ?demo=1
  // oder appEnv dev/staging kannte. Eine gültige Demo-Familien-Sitzung muss ohne ?demo=1 durchkommen -
  // eine anonyme Anfrage dagegen weiterhin 404 bekommen (kein 401, siehe middleware/auth.js optionalSession).
  await t.test('mit gültiger Demo-Familien-Sitzung (ohne ?demo=1): Portal und Liste bleiben erreichbar', async () => {
    const demoFamily = await createFamily(base, 'Demo-Familie Portal-Zugriff', 'demo-familie-portal-zugriff-1')
    db.prepare('UPDATE families SET is_demo = 1 WHERE id = ?').run(demoFamily.data.id)

    const list = await call(base, '/api/public/partners', { cookie: demoFamily.cookie })
    assert.ok(list.data.some((p) => p.slug === 'demo-tierheim-prod'))

    const portal = await call(base, '/api/public/partners/demo-tierheim-prod', { cookie: demoFamily.cookie })
    assert.equal(portal.status, 200)

    const near = await call(base, '/api/public/partners?plz=10115&radius=10', { cookie: demoFamily.cookie })
    assert.ok(near.data.some((p) => p.slug === 'demo-tierheim-prod'))

    // eine normale (nicht-Demo) Familiensitzung bekommt weiterhin kein Demo-Partner-Portal
    const realFamily = await createFamily(base, 'Echte Familie Portal-Zugriff', 'echte-familie-portal-zugriff-1')
    const realPortal = await call(base, '/api/public/partners/demo-tierheim-prod', { cookie: realFamily.cookie })
    assert.equal(realPortal.status, 404)

    // anonym bleibt es bei 404, nie 401 - optionalSession darf anonyme Anfragen nicht ablehnen
    const anonPortal = await call(base, '/api/public/partners/demo-tierheim-prod')
    assert.equal(anonPortal.status, 404)
  })
})
