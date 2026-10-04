const test = require('node:test')
const assert = require('node:assert/strict')
const Database = require('better-sqlite3')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, getCookie } = require('./helpers')

// Feedback-Runde: Banner-Layouts (Ein Foto, halb/halb, groß links, drei Fotos) - bis zu drei Bannerfotos, das Layout je
// Partner (lib/partnerBanner.js, PUT /api/partner-area/profile/banner/layout), im Profil, im Portal und in der
// Kundensicht. Dazu der Umbau alter Tabellen (Positionen 1-2 -> 1-3). t.test() bleibt auf einer Ebene. Namen erfunden.
const ADMIN_TEST_PASSWORD = 'admin-test-banner-layout-1'
const dataDir = useTempDataDir('partner-banner-layout', { LOGIN_RATE_LIMIT: '300', CODE_RATE_LIMIT: '300' })

function jpegSegment(marker, payload) {
  const length = Buffer.alloc(2)
  length.writeUInt16BE(payload.length + 2, 0)
  return Buffer.concat([Buffer.from([0xff, marker]), length, payload])
}

function jpeg() {
  const sof = Buffer.alloc(15)
  sof[0] = 8
  sof.writeUInt16BE(900, 1)
  sof.writeUInt16BE(1600, 3)
  sof[5] = 3
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    jpegSegment(0xc0, sof),
    jpegSegment(0xda, Buffer.from([0x00, 0x01, 0x02])),
    Buffer.from([0x12, 0x34]),
    Buffer.from([0xff, 0xd9])
  ])
}

const OLD_TABLE = `
  CREATE TABLE partner_banner (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partner_id INTEGER NOT NULL,
    position INTEGER NOT NULL CHECK (position IN (1, 2)),
    foto_url TEXT NOT NULL,
    alt TEXT,
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (partner_id, position)
  );
  CREATE INDEX idx_partner_banner_foto ON partner_banner(foto_url);`

test('Banner-Layouts: Auswahl, bis zu drei Fotos, Portal und Umbau alter Tabellen', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const banner = require('../lib/partnerBanner')

  await t.test('Layouts: feste Liste mit Zahl der Fotos, Vorgabe aus der Zahl der Fotos, Prüfung', () => {
    assert.deepEqual(banner.BANNER_LAYOUTS, { eins: 1, halb: 2, 'gross-links': 2, drei: 3 })
    assert.equal(banner.MAX_BANNER, 3)
    assert.deepEqual([0, 1, 2, 3].map(banner.defaultLayout), ['eins', 'eins', 'gross-links', 'drei'])
    assert.equal(banner.validateLayoutUpdate({ layout: 'halb' }), 'halb')
    for (const body of [{ layout: 'vier' }, { layout: '' }, {}, { layout: 'halb', extra: 1 }, null, ['halb'], { layout: 2 }]) {
      assert.throws(() => banner.validateLayoutUpdate(body), (err) => err.status === 400, JSON.stringify(body))
    }
    assert.deepEqual(['1', '2', '3', '4', '0', 'x'].map(banner.parsePosition), [1, 2, 3, null, null, null])
  })

  await t.test('Umbau: alte Tabelle (Positionen 1-2) behält ihre Zeilen und nimmt danach auch Position 3 - nur einmal', () => {
    const old = new Database(':memory:')
    old.exec(OLD_TABLE)
    old.prepare("INSERT INTO partner_banner (partner_id, position, foto_url, alt) VALUES (7, 1, '/uploads/a.jpg', 'Wiese'), (7, 2, '/uploads/b.jpg', NULL)").run()
    assert.throws(() => old.prepare("INSERT INTO partner_banner (partner_id, position, foto_url) VALUES (7, 3, '/uploads/c.jpg')").run())
    assert.equal(banner.widenBannerPositions(old), true)
    assert.deepEqual(old.prepare('SELECT partner_id, position, foto_url, alt FROM partner_banner ORDER BY position').all(), [
      { partner_id: 7, position: 1, foto_url: '/uploads/a.jpg', alt: 'Wiese' },
      { partner_id: 7, position: 2, foto_url: '/uploads/b.jpg', alt: null }
    ])
    old.prepare("INSERT INTO partner_banner (partner_id, position, foto_url) VALUES (7, 3, '/uploads/c.jpg')").run()
    assert.throws(() => old.prepare("INSERT INTO partner_banner (partner_id, position, foto_url) VALUES (7, 4, '/uploads/d.jpg')").run())
    assert.throws(() => old.prepare("INSERT INTO partner_banner (partner_id, position, foto_url) VALUES (7, 3, '/uploads/e.jpg')").run(), /UNIQUE/)
    assert.ok(old.prepare("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'idx_partner_banner_foto'").get(), 'Index wieder da')
    assert.equal(banner.widenBannerPositions(old), false, 'schon umgebaut')
    old.close()
  })

  const adminLogin = await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: ADMIN_TEST_PASSWORD } })
  const adminCookie = getCookie(adminLogin.res)
  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const put = (urlPath, body, cookie) => call(base, urlPath, { method: 'PUT', body, cookie })
  const del = (urlPath, cookie) => call(base, urlPath, { method: 'DELETE', cookie })

  async function upload(cookie, alt) {
    const form = new FormData()
    form.append('alt', alt)
    form.append('foto', new Blob([jpeg()], { type: 'image/jpeg' }), 'banner.jpg')
    const res = await fetch(`${base}/api/partner-area/profile/banner`, { method: 'POST', headers: { Cookie: cookie }, body: form })
    return { status: res.status, data: await res.json() }
  }

  const partner = await post('/api/admin/partners', { name: 'Hundeschule Birkenweg', slug: 'hundeschule-birkenweg', typ: 'hundeschule', plz: '10115', status: 'aktiv' }, adminCookie)
  const area = await post(`/api/admin/partners/${partner.data.id}/area`, undefined, adminCookie)
  const cookie = getCookie((await post('/api/login', { secret: area.data.key })).res)
  const LAYOUT = '/api/partner-area/profile/banner/layout'

  await t.test('drei Fotos an Position 1-3, ein viertes -> 409; ohne gewähltes Layout folgt die Vorgabe der Zahl', async () => {
    assert.equal((await call(base, '/api/partner-area/profile', { cookie })).data.bannerLayout, 'eins')
    const one = await upload(cookie, 'Erstes')
    assert.equal(one.data.layout, 'eins')
    const two = await upload(cookie, 'Zweites')
    assert.equal(two.data.layout, 'gross-links')
    const three = await upload(cookie, 'Drittes')
    assert.equal(three.status, 201)
    assert.deepEqual(three.data.banner.map((row) => row.position), [1, 2, 3])
    assert.equal(three.data.layout, 'drei')
    const full = await upload(cookie, 'Viertes')
    assert.equal(full.status, 409)
    assert.match(full.data.error, /Höchstens 3 Bannerfotos/)
  })

  await t.test('Layout wählen: gespeichert je Partner, im Profil, im Portal und in der Kundensicht; Unsinn -> 400', async () => {
    const res = await put(LAYOUT, { layout: 'halb' }, cookie)
    assert.equal(res.status, 200)
    assert.equal(res.data.layout, 'halb')
    assert.equal(res.data.banner.length, 3, 'das dritte Foto bleibt gespeichert, auch wenn das Layout nur zwei zeigt')
    assert.equal((await call(base, '/api/partner-area/profile', { cookie })).data.bannerLayout, 'halb')
    const portal = await call(base, `/api/public/partners/${partner.data.slug}`)
    assert.equal(portal.data.bannerLayout, 'halb')
    assert.equal(portal.data.banner.length, 3)
    assert.equal((await call(base, '/api/partner-area/preview/portal', { cookie })).data.bannerLayout, 'halb')
    assert.equal((await put(LAYOUT, { layout: 'collage' }, cookie)).status, 400)
    assert.equal((await put(LAYOUT, { layout: 'halb', position: 1 }, cookie)).status, 400)
    assert.equal(db.prepare('SELECT banner_layout FROM partners WHERE id = ?').get(partner.data.id).banner_layout, 'halb')
  })

  await t.test('Entfernen von Foto 1 bei drei Fotos: beide folgenden rücken nach; der Admin entfernt Foto 3', async () => {
    const before = (await call(base, '/api/partner-area/profile/banner', { cookie })).data.banner
    const res = await del('/api/partner-area/profile/banner/1', cookie)
    assert.equal(res.status, 200)
    assert.deepEqual(
      res.data.banner.map((row) => [row.position, row.alt]),
      [
        [1, 'Zweites'],
        [2, 'Drittes']
      ]
    )
    await upload(cookie, 'Neues drittes')
    const admin = await del(`/api/admin/partners/${partner.data.id}/banner/3`, adminCookie)
    assert.equal(admin.status, 200)
    assert.deepEqual(admin.data.banner.map((row) => row.alt), ['Zweites', 'Drittes'])
    assert.equal(before.length, 3)
  })

  await t.test('Demo-Partner und Admin-Ansicht dürfen das Layout nicht ändern', async () => {
    const view = await post(`/api/admin/view/${area.data.familyId}`, undefined, adminCookie)
    assert.equal((await put(LAYOUT, { layout: 'eins' }, getCookie(view.res))).status, 403)
    db.prepare('UPDATE families SET is_demo = 1 WHERE id = ?').run(area.data.familyId)
    assert.equal((await put(LAYOUT, { layout: 'eins' }, cookie)).status, 403)
    db.prepare('UPDATE families SET is_demo = 0 WHERE id = ?').run(area.data.familyId)
    assert.equal(db.prepare('SELECT banner_layout FROM partners WHERE id = ?').get(partner.data.id).banner_layout, 'halb')
  })
})
