const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, getCookie } = require('./helpers')

const dataDir = useTempDataDir('demorevier', { LOGIN_RATE_LIMIT: '200', CODE_RATE_LIMIT: '200' })

// Phase M „Mein Revier“ in der Demo (lib/demoRevier.js): öffentliche Profile rund um „Zuhause am Deich“, dessen eigenes
// Profil und Folgen - idempotent beim Auffrischen, echte Profile bleiben unberührt, die Demo landet weiter am Deich.
test('Demo: Mein Revier', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const { uploadDir } = require('../config')
  const { replaceDemoPack } = require('../lib/demoPack')

  const realId = db.prepare("INSERT INTO families (name, password_hash, art) VALUES ('Zuhause Echt', 'x', 'zuhause')").run().lastInsertRowid
  db.prepare("INSERT INTO revier_profile (family_id, slug, aktiv, plz, zustimmung_at) VALUES (?, 'echtslug', 1, '21037', datetime('now'))").run(realId)

  replaceDemoPack(db, uploadDir)
  const second = replaceDemoPack(db, uploadDir)
  const login = await call(base, '/api/demo', { method: 'POST', body: {} })
  const cookie = getCookie(login.res)

  await t.test('Demo-Login landet weiter in „Zuhause am Deich“', () => {
    assert.equal(login.data.id, second.household.familyId)
  })

  await t.test('idempotent: sechs Demo-Profile, das echte bleibt', () => {
    const rows = db.prepare('SELECT p.slug, f.is_demo FROM revier_profile p JOIN families f ON f.id = p.family_id').all()
    assert.equal(rows.filter((row) => row.is_demo).length, 6)
    assert.ok(rows.some((row) => row.slug === 'echtslug' && !row.is_demo))
  })

  await t.test('Radar zeigt die Demo-Profile in allen Stufen, nie das echte', async () => {
    const res = await call(base, '/api/revier/radar', { method: 'POST', body: { umkreis: 25 }, cookie })
    assert.equal(res.status, 200)
    assert.equal(res.data.profile.length, 5)
    assert.deepEqual([...new Set(res.data.profile.map((p) => p.band))], ['unter5', '5-10', '10-25'])
    assert.ok(res.data.profile.every((p) => p.tiere.length > 0 && p.neueste))
  })

  await t.test('Feed „Aus deinem Revier“ und eigene Einstellungen', async () => {
    const feed = await call(base, '/api/revier/feed', { cookie })
    assert.ok(feed.data.eintraege.length >= 3)
    const settings = await call(base, '/api/revier/einstellungen', { cookie })
    assert.equal(settings.data.aktiv, true)
    assert.equal(settings.data.follower, 3)
    assert.deepEqual(settings.data.tiere.filter((tier) => tier.sichtbar).map((tier) => tier.name).sort(), ['Balu', 'Mira'])
    const vorschau = await call(base, '/api/revier/vorschau', { cookie })
    assert.equal(vorschau.data.eintraege.length, 2)
  })

  await t.test('Demo bleibt nur lesend', async () => {
    const slug = (await call(base, '/api/revier/folge', { cookie })).data.profile[0].slug
    assert.equal((await call(base, `/api/revier/p/${slug}/folgen`, { method: 'DELETE', cookie })).status, 403)
    assert.equal((await call(base, '/api/revier/einstellungen', { method: 'PUT', body: { aktiv: false }, cookie })).status, 403)
  })
})
