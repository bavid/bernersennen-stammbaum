const test = require('node:test')
const { before } = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, getCookie } = require('./helpers')

// Band „Mit dabei“ einstellen (lib/communityBanner.js, routes/adminCommunity.js GET/PUT /api/admin/community/banner):
// Partner des Monats mit „bis“, Auswahl der Zahlen, eigener kurzer Eintrag mit internem Link - und GET /api/community
// liefert Fotos des vorgestellten Partners (nur schon öffentliche: Bannerfotos, Einblicke, Logo).
const ADMIN_TEST_PASSWORD = 'admin-test-community-banner-1'
const dataDir = useTempDataDir('community-banner', { LOGIN_RATE_LIMIT: '300' })

before(async () => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
})

const UUID = (n) => `0000000${n}-0000-4000-8000-000000000000`

function insertPartner(db, { slug, name, status = 'aktiv', isDemo = 0, logo = null }) {
  return db
    .prepare("INSERT INTO partners (slug, name, typ, status, gesperrt, is_demo, logo_file) VALUES (?, ?, 'hundeschule', ?, 0, ?, ?)")
    .run(slug, name, status, isDemo, logo).lastInsertRowid
}

function insertFotos(db, partnerId, { banner = 0, einblicke = 0, ausgeblendet = 0 }) {
  for (let i = 1; i <= banner; i += 1) {
    db.prepare('INSERT INTO partner_banner (partner_id, position, foto_url) VALUES (?, ?, ?)').run(partnerId, i, `/uploads/${UUID(i)}.jpg`)
  }
  for (let i = 1; i <= einblicke; i += 1) {
    db.prepare("INSERT INTO partner_einblicke (partner_id, foto_url, datum, einwilligung, ausgeblendet) VALUES (?, ?, '2026-09-0' || ?, 1, ?)").run(
      partnerId,
      `/uploads/${UUID(i + 4)}.jpg`,
      i,
      i === 1 ? ausgeblendet : 0
    )
  }
}

test('lib/communityBanner: Prüfung der Angaben', () => {
  const { validateBannerConfig, CHIP_KEYS } = require('../lib/communityBanner')
  const ok = { partnerId: null, bis: null, chips: ['partner', 'familien'], text: 'Neu: Wir waren hier', link: '/partner-werden' }
  assert.deepEqual(validateBannerConfig(ok), { ...ok, chips: ['familien', 'partner'] })
  assert.deepEqual(CHIP_KEYS, ['familien', 'zuhause', 'erinnerungen', 'fotos', 'spenden', 'partner'])
  const bad = (changes) => assert.throws(() => validateBannerConfig({ ...ok, ...changes }), (err) => err.status === 400, JSON.stringify(changes))
  for (const link of ['https://evil', '//x', '/\\evil', 'javascript:alert(1)', 'partner', '/a b', `/${'a'.repeat(250)}`]) bad({ link })
  bad({ text: 'x'.repeat(81) })
  bad({ text: '<b>fett</b>' })
  bad({ text: '', link: '/finanzierung' })
  bad({ chips: ['familien', 'tiere'] })
  bad({ chips: 'familien' })
  bad({ bis: '31.12.2026' })
  bad({ partnerId: 'abc' })
  bad({ partnerId: 999999 })
  assert.throws(() => validateBannerConfig(null), (err) => err.status === 400)
  assert.equal(validateBannerConfig({ ...ok, text: 'x'.repeat(80) }).text.length, 80)
})

test('Band „Mit dabei“: Admin stellt ein, /api/community liefert Partner des Monats mit Fotos', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const { clearCommunityCache } = require('../lib/community')
  const get = (urlPath, cookie) => call(base, urlPath, { cookie })
  const put = (urlPath, body, cookie) => call(base, urlPath, { method: 'PUT', body, cookie })
  const fresh = async () => {
    clearCommunityCache()
    return (await get('/api/community')).data
  }
  const adminLogin = await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: ADMIN_TEST_PASSWORD } })
  const admin = getCookie(adminLogin.res)

  const benno = insertPartner(db, { slug: 'hundeschule-benno', name: 'Hundeschule Benno', logo: 'logo-benno.png' })
  const wilma = insertPartner(db, { slug: 'salon-wilma', name: 'Salon Wilma' })
  const pausiert = insertPartner(db, { slug: 'salon-lotte', name: 'Salon Lotte', status: 'pausiert' })
  insertFotos(db, benno, { banner: 2, einblicke: 5, ausgeblendet: 1 })

  await t.test('ohne Einstellung: Vorgabe - alle Zahlen, kein eigener Eintrag, kein Partner des Monats', async () => {
    const data = await fresh()
    assert.deepEqual(data.banner, { partnerDesMonats: false, chips: ['familien', 'zuhause', 'erinnerungen', 'fotos', 'spenden', 'partner'], hinweis: null })
    assert.deepEqual(data.partnerVorgestellt, [])
  })

  await t.test('Admin-Routen: 401 ohne Anmeldung, 400 bei fremdem Link oder nicht öffentlichem Partner', async () => {
    assert.equal((await get('/api/admin/community/banner')).status, 401)
    assert.equal((await put('/api/admin/community/banner', { chips: [] })).status, 401)
    // Ohne Admin-Passwort gibt es den Admin-Bereich gar nicht (404).
    const config = require('../config')
    const hash = config.adminPasswordHash
    config.adminPasswordHash = ''
    try {
      assert.equal((await get('/api/admin/community/banner', admin)).status, 404)
    } finally {
      config.adminPasswordHash = hash
    }
    const gueltig = { partnerId: benno, bis: null, chips: ['familien'], text: 'Neu: Wir waren hier', link: null }
    for (const link of ['https://evil', '//x']) {
      const res = await put('/api/admin/community/banner', { ...gueltig, link }, admin)
      assert.equal(res.status, 400, link)
      assert.match(res.data.error, /Pfad/)
    }
    assert.equal((await put('/api/admin/community/banner', { ...gueltig, partnerId: pausiert }, admin)).status, 400)
    assert.equal((await put('/api/admin/community/banner', { ...gueltig, text: 'x'.repeat(81) }, admin)).status, 400)
  })

  await t.test('GET: Stand, öffentliche Partner zur Auswahl (ohne pausierte), Zahlen-Schlüssel', async () => {
    const res = await get('/api/admin/community/banner', admin)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('cache-control'), 'no-store')
    assert.equal(res.data.banner.partnerId, null)
    assert.deepEqual(res.data.partners.map((p) => p.slug), ['hundeschule-benno', 'salon-wilma'])
    assert.equal(res.data.maxText, 80)
    assert.equal(res.data.partners[0].fotos.length, 5)
    assert.deepEqual(Object.keys(res.data.vorschau).sort(), ['vorgestellt', 'zahlen'])
    assert.equal(res.data.vorschau.zahlen.partner, 2)
  })

  await t.test('PUT: Partner des Monats mit Fotos (Banner, Einblicke ohne ausgeblendete, höchstens fünf), protokolliert', async () => {
    const body = { partnerId: benno, bis: '2999-12-31', chips: ['partner', 'familien'], text: 'Neu: Wir waren hier', link: '/partner-werden' }
    const res = await put('/api/admin/community/banner', body, admin)
    assert.equal(res.status, 200)
    assert.deepEqual(res.data.banner, { ...body, chips: ['familien', 'partner'] })
    assert.deepEqual(db.prepare('SELECT aktion, ziel FROM admin_log ORDER BY id DESC LIMIT 1').get(), {
      aktion: 'community-banner-geaendert',
      ziel: 'einstellung:community-banner'
    })
    // Der Admin-Schalter leert den Zwischenspeicher selbst.
    const data = (await get('/api/community')).data
    assert.deepEqual(data.banner, { partnerDesMonats: true, chips: ['familien', 'partner'], hinweis: { text: 'Neu: Wir waren hier', link: '/partner-werden' } })
    const [monat] = data.partnerVorgestellt
    assert.deepEqual(Object.keys(monat).sort(), ['fotos', 'name', 'slug', 'typ'])
    assert.equal(monat.slug, 'hundeschule-benno')
    assert.equal(monat.fotos.length, 5)
    assert.deepEqual(monat.fotos.slice(0, 2), [`/public-media/${UUID(1)}.jpg`, `/public-media/${UUID(2)}.jpg`])
    assert.ok(monat.fotos.every((url) => url.startsWith('/public-media/')))
    assert.ok(!monat.fotos.includes(`/public-media/${UUID(5)}.jpg`), 'ausgeblendeter Einblick bleibt draußen')
  })

  await t.test('Partner des Monats steht vor den übrigen Vorgestellten; Logo als letztes Foto', async () => {
    db.prepare('UPDATE partners SET vorgestellt = 1 WHERE id = ?').run(wilma)
    db.prepare("UPDATE partners SET logo_file = 'logo-wilma.png' WHERE id = ?").run(wilma)
    const data = await fresh()
    assert.deepEqual(data.partnerVorgestellt.map((p) => p.slug), ['hundeschule-benno', 'salon-wilma'])
    assert.deepEqual(data.partnerVorgestellt[1].fotos, ['/partner-media/logo-wilma.png'])
  })

  await t.test('abgelaufen („bis“ gestern) oder nicht mehr öffentlich: zurück zu den Vorgestellten', async () => {
    await put('/api/admin/community/banner', { partnerId: benno, bis: '2020-01-01', chips: ['familien'], text: null, link: null }, admin)
    let data = (await get('/api/community')).data
    assert.equal(data.banner.partnerDesMonats, false)
    assert.deepEqual(data.partnerVorgestellt.map((p) => p.slug), ['salon-wilma'])
    assert.equal(data.banner.hinweis, null)

    await put('/api/admin/community/banner', { partnerId: benno, bis: null, chips: ['familien'], text: null, link: null }, admin)
    db.prepare("UPDATE partners SET status = 'pausiert' WHERE id = ?").run(benno)
    data = await fresh()
    assert.equal(data.banner.partnerDesMonats, false)
    assert.deepEqual(data.partnerVorgestellt.map((p) => p.slug), ['salon-wilma'])
  })
})
