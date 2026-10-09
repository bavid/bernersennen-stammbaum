const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call } = require('./helpers')

// Laufband in Produktion (appEnv wird beim ersten require('../config') fest eingelesen - darum eine eigene Datei wie
// partnersDemoProd.test.js): ohne Eintrag ist die Demo-Ausnahme aus - kein Demo-Partner im Laufband, bis der Admin einen
// echten Partner vorstellt; eingeschaltet erscheint die Demo-Hundeschule.
const dataDir = useTempDataDir('community-prod', { APP_ENV: 'production' })

test('Community in Produktion: Demo-Partner erst nach ausdrücklichem Einschalten', async (t) => {
  assert.equal(require('../config').appEnv, 'production')
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const community = require('../lib/community')
  db.prepare(
    "INSERT INTO partners (slug, name, typ, status, is_demo) VALUES ('hundeschule-pfotenglueck', 'Hundeschule Pfotenglück', 'hundeschule', 'aktiv', 1)"
  ).run()

  assert.equal(community.readDemoPartnerErlaubt(), false)
  community.clearCommunityCache()
  const res = await call(base, '/api/community')
  assert.equal(res.status, 200)
  assert.deepEqual(res.data.partnerVorgestellt, [])
  assert.equal(res.data.partner, 0)

  assert.deepEqual(community.setDemoPartnerErlaubt(true), { demoPartnerErlaubt: true, changed: true })
  assert.deepEqual((await call(base, '/api/community')).data.partnerVorgestellt.map((p) => p.slug), ['hundeschule-pfotenglueck'])
})
