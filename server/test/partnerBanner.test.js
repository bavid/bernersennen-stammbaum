const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, createHousehold, getCookie } = require('./helpers')

// Phase V4b: Ansprechperson und 1-3 Bannerfotos im Kopf des Portals (/api/partner-area/profile/banner, lib/partnerBanner.js)
// - Upload-Prüfung wie bei den Einblicken, Ersetzen, Alternativtext, Entfernen mit Nachrücken, Portal- und
// Kundensicht-Ausgabe, /public-media nur für sichtbare Partner, Demo- und Admin-Ansicht nur lesend. t.test() bleibt auf
// einer Ebene. Namen sind erfunden.
const ADMIN_TEST_PASSWORD = 'admin-test-partner-banner-1'
const dataDir = useTempDataDir('partner-banner', { LOGIN_RATE_LIMIT: '300', CODE_RATE_LIMIT: '300' })

const PORTAL_TEXT = 'Kleine Gruppen, viel Geduld und jede Menge Leckerli – so arbeiten wir mit euren Hunden.'
const TYPE_MESSAGE = 'Bitte als JPG oder PNG hochladen.'

function jpegSegment(marker, payload) {
  const length = Buffer.alloc(2)
  length.writeUInt16BE(payload.length + 2, 0)
  return Buffer.concat([Buffer.from([0xff, marker]), length, payload])
}

// SOF0-Segment mit Maßen (Höhe, Breite) - ohne lässt sich ein Bannerfoto nicht prüfen (lib/imageInspect.js).
function sof0(width, height) {
  const payload = Buffer.alloc(15)
  payload[0] = 8
  payload.writeUInt16BE(height, 1)
  payload.writeUInt16BE(width, 3)
  payload[5] = 3
  return jpegSegment(0xc0, payload)
}

// Synthetisches JPEG mit APP1-Exif-Segment (wie test/einblicke.test.js), dazu SOF0 mit den Maßen.
function jpegWithExif({ width = 1600, height = 900 } = {}) {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    jpegSegment(0xe1, Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8, 0xca, 0xfe])])),
    sof0(width, height),
    jpegSegment(0xda, Buffer.from([0x00, 0x01, 0x02])),
    Buffer.from([0x12, 0x34, 0x56]),
    Buffer.from([0xff, 0xd9])
  ])
}

const JPEG_WITH_EXIF = jpegWithExif()

function pngChunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  return Buffer.concat([length, Buffer.from(type, 'ascii'), data, Buffer.alloc(4)])
}

function ihdr(width, height) {
  const data = Buffer.alloc(13)
  data.writeUInt32BE(width, 0)
  data.writeUInt32BE(height, 4)
  return pngChunk('IHDR', data)
}

const PNG_WITH_TEXT = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  ihdr(1200, 400),
  pngChunk('tEXt', Buffer.from('Comment\0Aufnahmeort geheim', 'latin1')),
  pngChunk('IDAT', Buffer.from([4, 5, 6])),
  pngChunk('IEND', Buffer.alloc(0))
])
const WEBP_BYTES = Buffer.concat([Buffer.from('RIFF', 'ascii'), Buffer.from([20, 0, 0, 0]), Buffer.from('WEBPVP8 ', 'ascii'), Buffer.alloc(12)])
const GIF_BYTES = Buffer.concat([Buffer.from('GIF89a', 'ascii'), Buffer.from([1, 0, 1, 0, 0, 0, 0, 0x3b])])

test('Bannerfotos und Ansprechperson im Portal-Kopf', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const { uploadDir } = require('../config')

  const adminLogin = await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: ADMIN_TEST_PASSWORD } })
  const adminCookie = getCookie(adminLogin.res)
  const get = (urlPath, cookie) => call(base, urlPath, { cookie })
  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const put = (urlPath, body, cookie) => call(base, urlPath, { method: 'PUT', body, cookie })
  const del = (urlPath, cookie) => call(base, urlPath, { method: 'DELETE', cookie })
  const uploadedFiles = () => fs.readdirSync(uploadDir).sort()
  const fileOf = (url) => path.join(uploadDir, path.basename(url))

  async function sendPhoto(urlPath, cookie, { method = 'POST', foto = JPEG_WITH_EXIF, mime = 'image/jpeg', filename = 'banner.jpg', alt } = {}) {
    const form = new FormData()
    if (alt !== undefined) form.append('alt', alt)
    if (foto) form.append('foto', new Blob([foto], { type: mime }), filename)
    const res = await fetch(`${base}${urlPath}`, { method, headers: { Cookie: cookie }, body: form })
    const text = await res.text()
    return { status: res.status, data: text ? JSON.parse(text) : null }
  }

  async function createPartnerArea(overrides = {}) {
    const input = { name: 'Hundeschule Lindenhof', slug: 'hundeschule-lindenhof', typ: 'hundeschule', plz: '10115', portalText: PORTAL_TEXT, status: 'aktiv', ...overrides }
    const partner = await post('/api/admin/partners', input, adminCookie)
    assert.equal(partner.status, 201)
    const area = await post(`/api/admin/partners/${partner.data.id}/area`, undefined, adminCookie)
    assert.equal(area.status, 201)
    const login = await post('/api/login', { secret: area.data.key })
    return { partner: partner.data, familyId: area.data.familyId, cookie: getCookie(login.res) }
  }

  const school = await createPartnerArea()
  const BANNER = '/api/partner-area/profile/banner'

  let first
  let second
  await t.test('Upload: JPG an Position 1 (EXIF entfernt), PNG an Position 2, ein drittes an 3, ein viertes -> 409 ohne Datei', async () => {
    const res = await sendPhoto(BANNER, school.cookie, { alt: '  Training auf der Wiese ' })
    assert.equal(res.status, 201)
    assert.equal(res.data.banner.length, 1)
    first = res.data.banner[0]
    assert.equal(first.position, 1)
    assert.equal(first.alt, 'Training auf der Wiese')
    assert.match(first.fotoUrl, /^\/uploads\/[0-9a-f-]{36}\.jpg$/)
    assert.ok(!fs.readFileSync(fileOf(first.fotoUrl)).includes(Buffer.from('Exif\0\0', 'latin1')), 'EXIF entfernt')

    const png = await sendPhoto(BANNER, school.cookie, { foto: PNG_WITH_TEXT, mime: 'image/png', filename: 'b.png' })
    assert.equal(png.status, 201)
    second = png.data.banner[1]
    assert.deepEqual({ position: second.position, alt: second.alt }, { position: 2, alt: null })
    assert.ok(!fs.readFileSync(fileOf(second.fotoUrl)).includes(Buffer.from('Aufnahmeort geheim', 'latin1')), 'PNG-Text entfernt')

    const third = await sendPhoto(BANNER, school.cookie, { alt: 'Drittes' })
    assert.equal(third.status, 201)
    assert.equal(third.data.banner[2].position, 3)
    const before = uploadedFiles()
    const full = await sendPhoto(BANNER, school.cookie)
    assert.equal(full.status, 409)
    assert.match(full.data.error, /Höchstens 3 Bannerfotos/)
    assert.deepEqual(uploadedFiles(), before, 'keine Datei hinterlassen')
    assert.equal((await del(`${BANNER}/3`, school.cookie)).status, 200)

    const profile = await get('/api/partner-area/profile', school.cookie)
    assert.deepEqual(profile.data.banner, [first, second])
  })

  await t.test('Upload-Prüfung: nur JPG/PNG (Content-Type und Magic Bytes), Alternativtext <= 120, reiner Text', async () => {
    await del(`${BANNER}/2`, school.cookie)
    const before = uploadedFiles()
    for (const [foto, mime, filename] of [
      [WEBP_BYTES, 'image/webp', 'a.webp'],
      [GIF_BYTES, 'image/gif', 'a.gif'],
      [GIF_BYTES, 'image/jpeg', 'getarnt.jpg'],
      [JPEG_WITH_EXIF, 'image/png', 'falsch.png'],
      [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/png', 'x.png']
    ]) {
      const res = await sendPhoto(BANNER, school.cookie, { foto, mime, filename })
      assert.equal(res.status, 400, filename)
      assert.equal(res.data.error, TYPE_MESSAGE, filename)
    }
    // security-review V4b: riesige Maße und nicht lesbare Dateien kommen nie auf die öffentliche Seite.
    const huge = await sendPhoto(BANNER, school.cookie, { foto: jpegWithExif({ width: 30000, height: 30000 }) })
    assert.equal(huge.status, 400)
    assert.match(huge.data.error, /höchstens 8000 × 8000 Pixel/)
    const broken = Buffer.concat([Buffer.from([0xff, 0xd8]), jpegSegment(0xe1, Buffer.from('Exif\0\0GPS', 'latin1')), Buffer.from([0x00, 0x00, 0x00])])
    const unreadable = await sendPhoto(BANNER, school.cookie, { foto: broken })
    assert.equal(unreadable.status, 400)
    assert.match(unreadable.data.error, /lässt sich nicht lesen/)
    assert.equal((await sendPhoto(BANNER, school.cookie, { alt: 'x'.repeat(121) })).status, 400)
    assert.equal((await sendPhoto(BANNER, school.cookie, { alt: 'Foto <b>fett</b>' })).status, 400)
    const missing = await sendPhoto(BANNER, school.cookie, { foto: null, alt: 'ohne Foto' })
    assert.equal(missing.status, 400)
    assert.deepEqual(uploadedFiles(), before, 'jede Ablehnung räumt die Datei weg')
    const res = await sendPhoto(BANNER, school.cookie, { foto: PNG_WITH_TEXT, mime: 'image/png', filename: 'b.png', alt: 'Zweites Foto' })
    assert.equal(res.status, 201)
    second = res.data.banner[1]
  })

  await t.test('Ersetzen: neues Foto an derselben Stelle, alte Datei weg; Alternativtext ändern; unbekannte Stellen 404', async () => {
    const res = await sendPhoto(`${BANNER}/1/foto`, school.cookie, { method: 'PUT', alt: 'Neues Kopfbild' })
    assert.equal(res.status, 200)
    const replaced = res.data.banner[0]
    assert.equal(replaced.position, 1)
    assert.equal(replaced.alt, 'Neues Kopfbild')
    assert.notEqual(replaced.fotoUrl, first.fotoUrl)
    assert.equal(fs.existsSync(fileOf(first.fotoUrl)), false, 'altes Foto entfernt')
    assert.equal(res.data.banner[1].fotoUrl, second.fotoUrl, 'das zweite bleibt')
    first = replaced

    const alt = await put(`${BANNER}/2`, { alt: 'Gruppe am Deich' }, school.cookie)
    assert.equal(alt.status, 200)
    assert.equal(alt.data.banner[1].alt, 'Gruppe am Deich')
    assert.equal((await put(`${BANNER}/2`, { alt: '' }, school.cookie)).data.banner[1].alt, null, 'leer löscht')
    assert.equal((await put(`${BANNER}/2`, { alt: 'ok', position: 1 }, school.cookie)).status, 400)
    assert.equal((await put(`${BANNER}/2`, {}, school.cookie)).status, 400)
    assert.equal((await put(`${BANNER}/3`, { alt: 'x' }, school.cookie)).status, 404)
    assert.equal((await put(`${BANNER}/abc`, { alt: 'x' }, school.cookie)).status, 404)
    const before = uploadedFiles()
    assert.equal((await sendPhoto(`${BANNER}/3/foto`, school.cookie, { method: 'PUT' })).status, 404)
    assert.deepEqual(uploadedFiles(), before)
    await put(`${BANNER}/2`, { alt: 'Gruppe am Deich' }, school.cookie)
  })

  await t.test('Ansprechperson: im Profil pflegen (<= 80 Zeichen, reiner Text), der Admin überschreibt sie nicht', async () => {
    const res = await put('/api/partner-area/profile', { ansprechperson: '  Greta Lindner ' }, school.cookie)
    assert.equal(res.status, 200)
    assert.equal(res.data.ansprechperson, 'Greta Lindner')
    assert.equal((await put('/api/partner-area/profile', { ansprechperson: 'x'.repeat(81) }, school.cookie)).status, 400)
    const html = await put('/api/partner-area/profile', { ansprechperson: '<i>Greta</i>' }, school.cookie)
    assert.equal(html.status, 400)
    assert.match(html.data.error, /^Die Ansprechperson /)
    const breeder = await put('/api/partner-area/profile', { ansprechperson: 'Greta, Züchterin' }, school.cookie)
    assert.equal(breeder.status, 400)

    // Der Admin-Client kennt das Feld nicht - ein Bearbeiten ohne ansprechperson lässt sie stehen.
    const edit = await put(`/api/admin/partners/${school.partner.id}`, { name: 'Hundeschule Lindenhof', typ: 'hundeschule', plz: '10115', portalText: PORTAL_TEXT }, adminCookie)
    assert.equal(edit.status, 200)
    assert.equal(edit.data.ansprechperson, 'Greta Lindner')
  })

  await t.test('Portal: Ansprechperson und Bannerfotos über /public-media; die Dateien gibt es nur, solange der Partner sichtbar ist', async () => {
    const portal = await get(`/api/public/partners/${school.partner.slug}`)
    assert.equal(portal.status, 200)
    assert.equal(portal.data.ansprechperson, 'Greta Lindner')
    assert.deepEqual(portal.data.banner, [
      { fotoUrl: `/public-media/${path.basename(first.fotoUrl)}`, alt: 'Neues Kopfbild' },
      { fotoUrl: `/public-media/${path.basename(second.fotoUrl)}`, alt: 'Gruppe am Deich' }
    ])
    const media = await fetch(`${base}${portal.data.banner[0].fotoUrl}`)
    assert.equal(media.status, 200)
    assert.equal(media.headers.get('x-robots-tag'), 'noindex')
    assert.equal((await fetch(`${base}/uploads/${path.basename(first.fotoUrl)}`)).status, 401, 'über /uploads nur mit Sitzung')

    db.prepare("UPDATE partners SET status = 'pausiert' WHERE id = ?").run(school.partner.id)
    assert.equal((await fetch(`${base}${portal.data.banner[0].fotoUrl}`)).status, 404, 'pausiert -> nicht mehr öffentlich')
    db.prepare('UPDATE partners SET status = ?, gesperrt = 1 WHERE id = ?').run('aktiv', school.partner.id)
    assert.equal((await fetch(`${base}${portal.data.banner[0].fotoUrl}`)).status, 404, 'gesperrt -> nicht mehr öffentlich')
    db.prepare('UPDATE partners SET gesperrt = 0 WHERE id = ?').run(school.partner.id)
  })

  await t.test('Kundensicht: Bannerfotos über /uploads, nur für den eigenen Bereich sichtbar', async () => {
    db.prepare("UPDATE partners SET status = 'entwurf' WHERE id = ?").run(school.partner.id)
    const preview = await get('/api/partner-area/preview/portal', school.cookie)
    assert.equal(preview.status, 200)
    assert.equal(preview.data.ansprechperson, 'Greta Lindner')
    assert.deepEqual(preview.data.banner.map((banner) => banner.fotoUrl), [first.fotoUrl, second.fotoUrl])
    const own = await fetch(`${base}${first.fotoUrl}`, { headers: { Cookie: school.cookie } })
    assert.equal(own.status, 200)

    const household = await createHousehold(base, 'Zuhause Fremdblick')
    const foreign = await fetch(`${base}${first.fotoUrl}`, { headers: { Cookie: household.cookie } })
    assert.equal(foreign.status, 404, 'ein fremder Bereich sieht das Foto nicht')
    db.prepare("UPDATE partners SET status = 'aktiv' WHERE id = ?").run(school.partner.id)
  })

  await t.test('Entfernen: das zweite rückt nach, Datei weg; ein fremder Partner kommt an nichts heran', async () => {
    const other = await createPartnerArea({ name: 'Hundesalon Kiesel', slug: 'hundesalon-kiesel', typ: 'hundesalon' })
    assert.equal((await del(`${BANNER}/1`, other.cookie)).status, 404, 'der andere Partner hat keine Bannerfotos')
    assert.deepEqual((await get(BANNER, other.cookie)).data, { banner: [], layout: 'eins' })

    const res = await del(`${BANNER}/1`, school.cookie)
    assert.equal(res.status, 200)
    assert.deepEqual(res.data.banner, [{ position: 1, fotoUrl: second.fotoUrl, alt: 'Gruppe am Deich' }])
    assert.equal(fs.existsSync(fileOf(first.fotoUrl)), false)
    assert.equal((await del(`${BANNER}/2`, school.cookie)).status, 404)
    const portal = await get(`/api/public/partners/${school.partner.slug}`)
    assert.equal(portal.data.banner.length, 1)
  })

  await t.test('Demo und Admin-Ansicht: lesen ja, jeder Schreibversuch 403 - ohne Datei auf der Platte', async () => {
    const demo = await createPartnerArea({ name: 'Hundeschule Demo-Wiese', slug: 'hundeschule-demo-wiese' })
    db.prepare('UPDATE families SET is_demo = 1 WHERE id = ?').run(demo.familyId)
    db.prepare('UPDATE partners SET is_demo = 1 WHERE id = ?').run(demo.partner.id)
    const before = uploadedFiles()
    assert.equal((await get(BANNER, demo.cookie)).status, 200)
    assert.equal((await sendPhoto(BANNER, demo.cookie)).status, 403)
    assert.equal((await put(`${BANNER}/1`, { alt: 'x' }, demo.cookie)).status, 403)
    assert.equal((await del(`${BANNER}/1`, demo.cookie)).status, 403)
    assert.equal((await put('/api/partner-area/profile', { ansprechperson: 'Demo' }, demo.cookie)).status, 403)

    const view = await post(`/api/admin/view/${school.familyId}`, undefined, adminCookie)
    assert.equal(view.status, 200)
    const viewCookie = getCookie(view.res)
    assert.equal((await get(BANNER, viewCookie)).status, 200)
    assert.equal((await sendPhoto(BANNER, viewCookie)).status, 403)
    assert.equal((await del(`${BANNER}/1`, viewCookie)).status, 403)
    assert.deepEqual(uploadedFiles(), before)
  })

  await t.test('Audit V7a: der Admin sieht die Bannerfotos eines Partners und entfernt einzelne - protokolliert, Datei weg', async () => {
    const salon = await createPartnerArea({ name: 'Hundesalon Uferweg', slug: 'hundesalon-uferweg', typ: 'hundesalon' })
    const one = (await sendPhoto(BANNER, salon.cookie, { alt: 'Erstes Foto' })).data.banner[0]
    const two = (await sendPhoto(BANNER, salon.cookie, { alt: 'Zweites Foto' })).data.banner[1]
    const adminBanner = `/api/admin/partners/${salon.partner.id}/banner`

    assert.equal((await get(adminBanner)).status, 401, 'ohne Admin-Sitzung')
    assert.equal((await get(adminBanner, salon.cookie)).status, 401, 'der Partner selbst ist kein Admin')
    const list = await get(adminBanner, adminCookie)
    assert.equal(list.status, 200)
    assert.deepEqual(list.data.banner, [one, two])
    assert.equal((await get('/api/admin/partners/999999/banner', adminCookie)).status, 404)
    assert.equal((await del('/api/admin/partners/abc/banner/1', adminCookie)).status, 404)
    assert.equal((await del(`${adminBanner}/1`, salon.cookie)).status, 401)
    assert.equal(fs.existsSync(fileOf(one.fotoUrl)), true)

    const logBefore = db.prepare("SELECT COUNT(*) AS c FROM admin_log WHERE aktion = 'bannerfoto-entfernt'").get().c
    // Mit dem gesehenen Foto (?foto=): passt es nicht mehr zur Stelle, 409 und nichts gelöscht.
    const stale = await del(`${adminBanner}/1?foto=${path.basename(two.fotoUrl)}`, adminCookie)
    assert.equal(stale.status, 409)
    assert.match(stale.data.error, /hat sich inzwischen geändert/)
    assert.equal(fs.existsSync(fileOf(one.fotoUrl)), true)
    const removed = await del(`${adminBanner}/1?foto=${path.basename(one.fotoUrl)}`, adminCookie)
    assert.equal(removed.status, 200)
    assert.deepEqual(removed.data.banner, [{ ...two, position: 1 }], 'das zweite rückt nach')
    assert.equal(fs.existsSync(fileOf(one.fotoUrl)), false, 'Datei entfernt')
    const log = db.prepare("SELECT aktion, ziel FROM admin_log WHERE aktion = 'bannerfoto-entfernt' ORDER BY id DESC LIMIT 1").get()
    assert.deepEqual(log, { aktion: 'bannerfoto-entfernt', ziel: `partner:${salon.partner.id}` })
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM admin_log WHERE aktion = 'bannerfoto-entfernt'").get().c, logBefore + 1)

    // Partner und Portal sehen den neuen Stand; unbekannte Stellen 404 ohne Protokoll-Eintrag.
    assert.deepEqual((await get(BANNER, salon.cookie)).data.banner, [{ ...two, position: 1 }])
    assert.deepEqual((await get(`/api/public/partners/${salon.partner.slug}`)).data.banner.map((b) => b.alt), ['Zweites Foto'])
    for (const position of ['2', '3', 'x']) assert.equal((await del(`${adminBanner}/${position}`, adminCookie)).status, 404)
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM admin_log WHERE aktion = 'bannerfoto-entfernt'").get().c, logBefore + 1)
  })
})
