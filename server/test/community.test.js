const test = require('node:test')
const { before } = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, getCookie } = require('./helpers')

// Laufband auf der Startseite: GET /api/community (routes/community.js, lib/community.js) - Zahlen aus der Gemeinschaft
// ohne Demo-Daten, öffentlich und cachebar; dazu „Auf der Startseite vorstellen“ (lib/partnerVorgestellt.js,
// routes/adminCommunity.js) mit höchstens drei Partnern und der Demo-Ausnahme (Einstellung community_demo_partner_erlaubt,
// in dev/staging an). Diese Datei läuft als dev (Vorgabe: Demo-Partner erlaubt).
const ADMIN_TEST_PASSWORD = 'admin-test-community-1'
const dataDir = useTempDataDir('community', { LOGIN_RATE_LIMIT: '300' })

before(async () => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
})

function insertFamily(db, { name, art, isDemo = 0 }) {
  return db.prepare("INSERT INTO families (name, password_hash, art, is_demo) VALUES (?, 'x', ?, ?)").run(name, art, isDemo).lastInsertRowid
}

function insertDog(db, familyId) {
  return db.prepare("INSERT INTO dogs (family_id, name, geschlecht) VALUES (?, 'Bello', 'ruede')").run(familyId).lastInsertRowid
}

function insertEntry(db, { dogId, familyId, fotos = [] }) {
  db.prepare("INSERT INTO timeline_entries (dog_id, family_id, autor_name, datum, titel, foto_urls) VALUES (?, ?, 'A', '2026-10-01', 'T', ?)").run(
    dogId,
    familyId,
    JSON.stringify(fotos)
  )
}

function insertPartner(db, { slug, name, typ = 'hundeschule', status = 'aktiv', gesperrt = 0, isDemo = 0 }) {
  return db
    .prepare('INSERT INTO partners (slug, name, typ, status, gesperrt, is_demo) VALUES (?, ?, ?, ?, ?, ?)')
    .run(slug, name, typ, status, gesperrt, isDemo).lastInsertRowid
}

test('lib/partnerVorgestellt: höchstens drei, Schalter wie erwartet', () => {
  const db = require('../db')
  const { setVorgestellt, parseAn, MAX_VORGESTELLT } = require('../lib/partnerVorgestellt')
  assert.equal(MAX_VORGESTELLT, 3)
  assert.throws(() => parseAn({ an: 'ja' }), (err) => err.status === 400)
  const ids = ['a', 'b', 'c', 'd'].map((x) => insertPartner(db, { slug: `lib-${x}-partner`, name: `Lib ${x}` }))
  assert.deepEqual(setVorgestellt(ids[0], true), { vorgestellt: true, changed: true })
  assert.deepEqual(setVorgestellt(ids[0], true), { vorgestellt: true, changed: false })
  setVorgestellt(ids[1], true)
  setVorgestellt(ids[2], true)
  assert.throws(() => setVorgestellt(ids[3], true), (err) => err.status === 409 && /drei/.test(err.message))
  assert.deepEqual(setVorgestellt(ids[2], false), { vorgestellt: false, changed: true })
  assert.deepEqual(setVorgestellt(ids[3], true), { vorgestellt: true, changed: true })
  for (const id of ids) db.prepare('DELETE FROM partners WHERE id = ?').run(id)
})

test('Community: Zahlen ohne Demo, Cache, vorgestellte Partner, Demo-Ausnahme', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const { clearCommunityCache } = require('../lib/community')
  const get = (urlPath, cookie) => call(base, urlPath, { cookie })
  const put = (urlPath, body, cookie) => call(base, urlPath, { method: 'PUT', body, cookie })
  const fresh = async () => {
    clearCommunityCache()
    return get('/api/community')
  }

  const adminLogin = await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: ADMIN_TEST_PASSWORD } })
  const adminCookie = getCookie(adminLogin.res)

  await t.test('leer: alles 0, öffentlich cachebar ohne Login', async () => {
    const res = await fresh()
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('cache-control'), 'public, max-age=600')
    const { banner, ...zahlen } = res.data
    assert.deepEqual(zahlen, { familien: 0, zuhause: 0, erinnerungen: 0, fotos: 0, partner: 0, spendenCents: 0, partnerVorgestellt: [] })
    assert.equal(banner.partnerDesMonats, false)
  })

  await t.test('zählt echte Daten, nie Demo-Bereiche, Demo-Partner oder Partner-Bereiche', async () => {
    const rudel = insertFamily(db, { name: 'Rudel', art: 'rudel' })
    insertFamily(db, { name: 'Rudel 2', art: 'rudel' })
    const zuhause = insertFamily(db, { name: 'Zuhause', art: 'zuhause' })
    const demo = insertFamily(db, { name: 'Demo', art: 'rudel', isDemo: 1 })
    insertFamily(db, { name: 'Demo-Zuhause', art: 'zuhause', isDemo: 1 })
    insertFamily(db, { name: 'Tierheim-Bereich', art: 'tierheim' })
    const dog = insertDog(db, zuhause)
    insertEntry(db, { dogId: dog, familyId: zuhause, fotos: ['/uploads/a.jpg', '/uploads/b.jpg'] })
    insertEntry(db, { dogId: dog, familyId: rudel })
    const demoDog = insertDog(db, demo)
    insertEntry(db, { dogId: demoDog, familyId: demo, fotos: ['/uploads/c.jpg'] })
    insertPartner(db, { slug: 'echt-aktiv', name: 'Echt aktiv' })
    insertPartner(db, { slug: 'echt-pausiert', name: 'Echt pausiert', status: 'pausiert' })
    insertPartner(db, { slug: 'echt-gesperrt', name: 'Echt gesperrt', gesperrt: 1 })
    insertPartner(db, { slug: 'demo-aktiv', name: 'Demo aktiv', typ: 'hundesalon', isDemo: 1 })
    db.prepare('INSERT INTO finanzierung_quartale (jahr, quartal, einnahmen_spenden_cents) VALUES (2026, 1, 30000), (2026, 2, 20000)').run()

    const res = await fresh()
    const { banner, ...zahlen } = res.data
    assert.ok(banner)
    assert.deepEqual(zahlen, { familien: 2, zuhause: 1, erinnerungen: 2, fotos: 2, partner: 1, spendenCents: 50000, partnerVorgestellt: [] })
  })

  await t.test('Cache: fünf Minuten im Prozess - neue Zeilen erscheinen erst nach dem Leeren', async () => {
    insertFamily(db, { name: 'Rudel 3', art: 'rudel' })
    assert.equal((await get('/api/community')).data.familien, 2)
    assert.equal((await fresh()).data.familien, 3)
  })

  await t.test('Demo-Ausnahme: ohne echten vorgestellten Partner die Demo-Hundeschule (dev: an)', async () => {
    insertPartner(db, { slug: 'hundeschule-pfotenglueck', name: 'Hundeschule Pfotenglück', isDemo: 1 })
    insertPartner(db, { slug: 'tierheim-sonnenhang', name: 'Tierheim Sonnenhang', typ: 'tierheim', isDemo: 1 })
    const res = await fresh()
    assert.deepEqual(res.data.partnerVorgestellt, [{ slug: 'hundeschule-pfotenglueck', name: 'Hundeschule Pfotenglück', typ: 'hundeschule', fotos: [] }])
    // Die Demo-Partner zählen trotzdem nie mit.
    assert.equal(res.data.partner, 1)
  })

  await t.test('Admin: vorstellen nur angemeldet, protokolliert, höchstens drei, nur öffentliche erscheinen', async () => {
    const id = (slug) => db.prepare('SELECT id FROM partners WHERE slug = ?').get(slug).id
    assert.equal((await put(`/api/admin/partners/${id('echt-aktiv')}/vorgestellt`, { an: true })).status, 401)
    const ok = await put(`/api/admin/partners/${id('echt-aktiv')}/vorgestellt`, { an: true }, adminCookie)
    assert.equal(ok.status, 200)
    assert.equal(ok.headers.get('cache-control'), 'no-store')
    assert.deepEqual(ok.data, { id: id('echt-aktiv'), vorgestellt: true })
    assert.deepEqual(db.prepare('SELECT aktion, ziel FROM admin_log ORDER BY id DESC LIMIT 1').get(), { aktion: 'partner-vorgestellt', ziel: `partner:${id('echt-aktiv')}` })
    assert.equal((await put('/api/admin/partners/9999/vorgestellt', { an: true }, adminCookie)).status, 404)
    assert.equal((await put(`/api/admin/partners/${id('echt-aktiv')}/vorgestellt`, { an: 1 }, adminCookie)).status, 400)

    // Pausiert und gesperrt dürfen markiert sein, erscheinen aber nicht; ein vierter -> 409.
    await put(`/api/admin/partners/${id('echt-pausiert')}/vorgestellt`, { an: true }, adminCookie)
    await put(`/api/admin/partners/${id('echt-gesperrt')}/vorgestellt`, { an: true }, adminCookie)
    const vierter = await put(`/api/admin/partners/${id('demo-aktiv')}/vorgestellt`, { an: true }, adminCookie)
    assert.equal(vierter.status, 409)

    // Ein echter vorgestellter Partner verdrängt die Demo-Ausnahme; der Admin-Schalter leert den Cache selbst.
    const res = await get('/api/community')
    assert.deepEqual(res.data.partnerVorgestellt, [{ slug: 'echt-aktiv', name: 'Echt aktiv', typ: 'hundeschule', fotos: [] }])
    // Öffentlich nur slug, name, typ und öffentliche Fotos - keine Ids.
    assert.deepEqual(Object.keys(res.data.partnerVorgestellt[0]).sort(), ['fotos', 'name', 'slug', 'typ'])
    const list = await get('/api/admin/partners', adminCookie)
    assert.equal(list.data.find((p) => p.slug === 'echt-aktiv').vorgestellt, 1)
  })

  await t.test('Einstellung Demo-Partner: lesen, ausschalten (protokolliert) - dann keine Demo-Ausnahme mehr', async () => {
    const id = db.prepare("SELECT id FROM partners WHERE slug = 'echt-aktiv'").get().id
    await put(`/api/admin/partners/${id}/vorgestellt`, { an: false }, adminCookie)
    assert.deepEqual((await get('/api/community')).data.partnerVorgestellt.map((p) => p.slug), ['hundeschule-pfotenglueck'])

    const settings = await get('/api/admin/community', adminCookie)
    assert.equal(settings.status, 200)
    assert.deepEqual(settings.data, { demoPartnerErlaubt: true, vorgestellt: 2, max: 3 })
    assert.equal((await get('/api/admin/community')).status, 401)
    assert.equal((await put('/api/admin/community/demo-partner', { erlaubt: 'nein' }, adminCookie)).status, 400)
    const off = await put('/api/admin/community/demo-partner', { erlaubt: false }, adminCookie)
    assert.deepEqual(off.data, { demoPartnerErlaubt: false })
    assert.deepEqual(db.prepare('SELECT aktion, ziel FROM admin_log ORDER BY id DESC LIMIT 1').get(), {
      aktion: 'community-demo-partner-geaendert',
      ziel: 'einstellung:community-demo-partner'
    })
    assert.deepEqual((await get('/api/community')).data.partnerVorgestellt, [])
  })
})
