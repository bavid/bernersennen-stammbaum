const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, getCookie } = require('./helpers')

// Reiter „Fotos“ im Partner-Bereich: Bannerfotos und Einblicke per Ziehen anordnen - PUT /profile/banner/reihenfolge
// { positions } (lib/partnerBanner.js reorderBanner) und PUT /einblicke/reihenfolge { ids } (lib/einblicke.js
// setEinblickeReihenfolge). Vollständige Umstellung oder 400; fremde Ids 400; Demo 403; Portal und eigene Liste zeigen
// die neue Reihenfolge. Fotos werden direkt über die lib-Funktionen angelegt (kein Upload nötig). Namen sind erfunden.
const ADMIN_TEST_PASSWORD = 'admin-test-foto-reihenfolge-1'
const dataDir = useTempDataDir('foto-reihenfolge', { LOGIN_RATE_LIMIT: '300', CODE_RATE_LIMIT: '300' })
const PORTAL_TEXT = 'Kleine Gruppen, viel Geduld und jede Menge Leckerli – so arbeiten wir mit euren Hunden.'

test('Fotos im Reiter „Fotos“ anordnen: Banner-Positionen und Einblicke', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const { addBanner } = require('../lib/partnerBanner')
  const { insertEinblick } = require('../lib/einblicke')

  const adminLogin = await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: ADMIN_TEST_PASSWORD } })
  const adminCookie = getCookie(adminLogin.res)
  const admin = (urlPath, options = {}) => call(base, urlPath, { ...options, cookie: adminCookie })

  let counter = 0
  async function createPartnerArea(overrides = {}) {
    counter += 1
    const input = { name: `Hundeschule Lindenhof ${counter}`, slug: `hundeschule-lindenhof-${counter}`, typ: 'hundeschule', plz: '10115', portalText: PORTAL_TEXT, status: 'aktiv', ...overrides }
    const partner = await admin('/api/admin/partners', { method: 'POST', body: input })
    assert.equal(partner.status, 201)
    const area = await admin(`/api/admin/partners/${partner.data.id}/area`, { method: 'POST' })
    assert.equal(area.status, 201)
    const login = await call(base, '/api/login', { method: 'POST', body: { secret: area.data.key } })
    return { partner: partner.data, familyId: area.data.familyId, cookie: getCookie(login.res) }
  }
  const school = await createPartnerArea({ name: 'Hundeschule Pfotenweg' })
  const other = await createPartnerArea({ name: 'Hundesalon Fellnase', typ: 'hundesalon' })
  const api = (urlPath, options = {}) => call(base, `/api/partner-area${urlPath}`, { ...options, cookie: school.cookie })
  const partnerRow = { id: school.partner.id, is_demo: 0 }

  for (const [n, alt] of [
    [1, 'Welpen auf der Wiese'],
    [2, 'Training am Platz'],
    [3, 'Spaziergang im Wald']
  ]) {
    addBanner({ partner: partnerRow, fotoUrl: `/uploads/banner-${n}.jpg`, alt })
  }
  const bannerIdsBefore = db.prepare('SELECT id, position FROM partner_banner WHERE partner_id = ? ORDER BY position').all(school.partner.id)

  await t.test('Banner: unvollständig, doppelt, fremd oder falsche Form -> 400, nichts ändert sich', async () => {
    for (const body of [undefined, [], {}, { positions: '3,1,2' }, { positions: [1, 2] }, { positions: [1, 1, 2] }, { positions: [1, 2, 4] }, { positions: ['1', 2, 3] }, { positions: [3, 1, 2], layout: 'drei' }]) {
      const res = await api('/profile/banner/reihenfolge', { method: 'PUT', body })
      assert.equal(res.status, 400, JSON.stringify(body))
    }
    const list = await api('/profile/banner')
    assert.deepEqual(
      list.data.banner.map((item) => item.alt),
      ['Welpen auf der Wiese', 'Training am Platz', 'Spaziergang im Wald']
    )
  })

  await t.test('Banner: [3, 1, 2] rückt das dritte Foto nach vorn - Ids bleiben, Profil und Portal zeigen die neue Reihenfolge', async () => {
    const res = await api('/profile/banner/reihenfolge', { method: 'PUT', body: { positions: [3, 1, 2] } })
    assert.equal(res.status, 200)
    assert.deepEqual(
      res.data.banner.map((item) => [item.position, item.alt]),
      [
        [1, 'Spaziergang im Wald'],
        [2, 'Welpen auf der Wiese'],
        [3, 'Training am Platz']
      ]
    )
    assert.equal(res.data.layout, 'drei')
    const rows = db.prepare('SELECT id, position, foto_url FROM partner_banner WHERE partner_id = ? ORDER BY position').all(school.partner.id)
    assert.deepEqual(
      rows.map((row) => row.id).sort(),
      bannerIdsBefore.map((row) => row.id).sort(),
      'dieselben Zeilen, nur an anderen Stellen'
    )
    assert.equal(rows[0].foto_url, '/uploads/banner-3.jpg')
    const profile = await api('/profile')
    assert.deepEqual(
      profile.data.banner.map((item) => item.alt),
      ['Spaziergang im Wald', 'Welpen auf der Wiese', 'Training am Platz']
    )
    const portal = await call(base, `/api/public/partners/${school.partner.slug}`)
    assert.equal(portal.status, 200)
    assert.deepEqual(
      portal.data.banner.map((item) => item.alt),
      ['Spaziergang im Wald', 'Welpen auf der Wiese', 'Training am Platz']
    )
    // Einzelne Fotos lassen sich an ihrer neuen Stelle weiter bearbeiten.
    const alt = await api('/profile/banner/1', { method: 'PUT', body: { alt: 'Waldspaziergang' } })
    assert.equal(alt.status, 200)
    assert.equal(alt.data.banner[0].alt, 'Waldspaziergang')
  })

  const einblicke = []
  for (const [datum, text] of [
    ['2026-08-14', 'Erste Runde im Parcours'],
    ['2026-09-02', 'Welpenstunde'],
    ['2026-09-20', 'Herbstspaziergang']
  ]) {
    einblicke.push(insertEinblick({ partner: partnerRow, fotoUrl: `/uploads/einblick-${einblicke.length + 1}.jpg`, datum, text }))
  }
  const [aug, sepEarly, sepLate] = einblicke
  const foreign = insertEinblick({ partner: { id: other.partner.id, is_demo: 0 }, fotoUrl: '/uploads/fremd.jpg', datum: '2026-09-01', text: null })

  await t.test('Einblicke: ohne Reihenfolge neueste zuerst; unvollständig, doppelt, fremd -> 400', async () => {
    const list = await api('/einblicke')
    assert.deepEqual(
      list.data.map((item) => [item.id, item.reihenfolge]),
      [
        [sepLate.id, null],
        [sepEarly.id, null],
        [aug.id, null]
      ]
    )
    for (const body of [undefined, {}, { ids: 'x' }, { ids: [aug.id, sepEarly.id] }, { ids: [aug.id, aug.id, sepLate.id] }, { ids: [aug.id, sepEarly.id, foreign.id] }, { ids: [String(aug.id), sepEarly.id, sepLate.id] }]) {
      const res = await api('/einblicke/reihenfolge', { method: 'PUT', body })
      assert.equal(res.status, 400, JSON.stringify(body))
      assert.equal(res.data.error, 'Bitte alle Einblicke genau einmal in der neuen Reihenfolge schicken.')
    }
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM partner_einblicke WHERE reihenfolge IS NOT NULL').get().c, 0)
  })

  await t.test('Einblicke: neue Reihenfolge gilt im Partner-Bereich und auf dem Portal; ein neuer Einblick steht davor', async () => {
    const res = await api('/einblicke/reihenfolge', { method: 'PUT', body: { ids: [aug.id, sepLate.id, sepEarly.id] } })
    assert.equal(res.status, 200)
    assert.deepEqual(
      res.data.map((item) => [item.id, item.reihenfolge]),
      [
        [aug.id, 1],
        [sepLate.id, 2],
        [sepEarly.id, 3]
      ]
    )
    const portal = await call(base, `/api/public/partners/${school.partner.slug}`)
    assert.deepEqual(
      portal.data.einblicke.map((item) => item.text),
      ['Erste Runde im Parcours', 'Herbstspaziergang', 'Welpenstunde']
    )
    assert.equal(db.prepare('SELECT reihenfolge FROM partner_einblicke WHERE id = ?').get(foreign.id).reihenfolge, null, 'fremde Einblicke bleiben unberührt')

    const neu = insertEinblick({ partner: partnerRow, fotoUrl: '/uploads/einblick-4.jpg', datum: '2026-07-01', text: 'Sommerfest' })
    const list = await api('/einblicke')
    assert.deepEqual(
      list.data.map((item) => item.id),
      [neu.id, aug.id, sepLate.id, sepEarly.id],
      'ohne Stelle zuerst, dann die eingeordneten'
    )
    // Danach muss die Umstellung wieder alle vier nennen.
    assert.equal((await api('/einblicke/reihenfolge', { method: 'PUT', body: { ids: [aug.id, sepLate.id, sepEarly.id] } })).status, 400)
    const all = await api('/einblicke/reihenfolge', { method: 'PUT', body: { ids: [sepEarly.id, neu.id, aug.id, sepLate.id] } })
    assert.deepEqual(
      all.data.map((item) => item.id),
      [sepEarly.id, neu.id, aug.id, sepLate.id]
    )
  })

  await t.test('Demo-Partner: beide Umstellungen 403', async () => {
    const demo = await createPartnerArea({ name: 'Hundeschule Demo-Wiese' })
    db.prepare('UPDATE families SET is_demo = 1 WHERE id = ?').run(demo.familyId)
    db.prepare('UPDATE partners SET is_demo = 1 WHERE id = ?').run(demo.partner.id)
    const demoApi = (urlPath, options = {}) => call(base, `/api/partner-area${urlPath}`, { ...options, cookie: demo.cookie })
    assert.equal((await demoApi('/profile/banner/reihenfolge', { method: 'PUT', body: { positions: [] } })).status, 403)
    assert.equal((await demoApi('/einblicke/reihenfolge', { method: 'PUT', body: { ids: [] } })).status, 403)
  })
})
