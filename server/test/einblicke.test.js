const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, createHousehold, getCookie } = require('./helpers')
const { jpegSegment, sof0 } = require('./imageFixtures')

// Phase P Task 3b: Einblicke - Fotos mit Datum auf dem Portal eines Partners (/api/partner-area/einblicke,
// öffentliches Portal, teaserFoto, /public-media, Admin-Ausblenden, Demo-Aufräumen). t.test() bleibt auf
// einer Ebene.
const ADMIN_TEST_PASSWORD = 'admin-test-einblicke-1'
const dataDir = useTempDataDir('einblicke', { LOGIN_RATE_LIMIT: '300', CODE_RATE_LIMIT: '300' })

const PORTAL_TEXT = 'Wir zeigen euch hier, wie es bei uns im Training, im Park und auf dem Übungsplatz zugeht.'
const CONSENT_MESSAGE = 'Bitte bestätigt die Einwilligung der Halterinnen und Halter.'

// Synthetisches JPEG mit APP1-Exif-Segment (wie test/uploadAccess.test.js), dazu SOF0 mit den Maßen (Audit V7a: Einblicke
// prüfen Maße und übrige Metadaten wie die Bannerfotos, lib/photoUpload.js assertPublishablePhoto).
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

// WebP (RIFF....WEBP) und GIF - gültige Signaturen, aber für Einblicke nicht erlaubt (keine Metadaten-Entfernung).
const WEBP_BYTES = Buffer.concat([Buffer.from('RIFF', 'ascii'), Buffer.from([20, 0, 0, 0]), Buffer.from('WEBPVP8 ', 'ascii'), Buffer.alloc(12)])
const GIF_BYTES = Buffer.concat([Buffer.from('GIF89a', 'ascii'), Buffer.from([1, 0, 1, 0, 0, 0, 0, 0x3b])])
const TYPE_MESSAGE = 'Bitte als JPG oder PNG hochladen.'

const PNG_WITH_TEXT = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  ihdr(1200, 800),
  pngChunk('tEXt', Buffer.from('Comment\0Aufnahmeort geheim', 'latin1')),
  pngChunk('IDAT', Buffer.from([4, 5, 6])),
  pngChunk('IEND', Buffer.alloc(0))
])

function localToday() {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

test('Einblicke: Partner zeigen Fotos mit Datum auf ihrem Portal', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const config = require('../config')

  const adminLogin = await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: ADMIN_TEST_PASSWORD } })
  const adminCookie = getCookie(adminLogin.res)
  const get = (urlPath, cookie) => call(base, urlPath, { cookie })
  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const put = (urlPath, body, cookie) => call(base, urlPath, { method: 'PUT', body, cookie })
  const del = (urlPath, cookie) => call(base, urlPath, { method: 'DELETE', cookie })

  const uploadFiles = () => fs.readdirSync(config.uploadDir).sort()
  const storedPath = (fotoUrl) => path.join(config.uploadDir, fotoUrl.split('/').pop())
  const publicUrl = (fotoUrl) => `/public-media/${fotoUrl.split('/').pop()}`
  const fetchStatus = async (urlPath, cookie) => (await fetch(`${base}${urlPath}`, { headers: cookie ? { Cookie: cookie } : {} })).status

  let counter = 0
  async function createPartnerArea(overrides = {}) {
    counter += 1
    const input = {
      name: `Hundeschule Einblick ${counter}`,
      slug: `einblick-schule-${counter}`,
      typ: 'hundeschule',
      plz: '10115',
      portalText: PORTAL_TEXT,
      status: 'aktiv',
      ...overrides
    }
    const partner = await post('/api/admin/partners', input, adminCookie)
    assert.equal(partner.status, 201)
    const area = await post(`/api/admin/partners/${partner.data.id}/area`, undefined, adminCookie)
    assert.equal(area.status, 201)
    const login = await post('/api/login', { secret: area.data.key })
    assert.equal(login.status, 200)
    return { partner: partner.data, familyId: area.data.familyId, cookie: getCookie(login.res) }
  }

  async function postEinblick(cookie, { foto = JPEG_WITH_EXIF, mime = 'image/jpeg', filename = 'foto.jpg', datum = '2026-09-01', text, einwilligung = 'true' } = {}) {
    const form = new FormData()
    // null = Feld weglassen (undefined würde den Standardwert oben greifen lassen)
    if (datum !== null) form.append('datum', datum)
    if (text !== undefined) form.append('text', text)
    if (einwilligung !== null) form.append('einwilligung', einwilligung)
    if (foto) form.append('foto', new Blob([foto], { type: mime }), filename)
    const res = await fetch(`${base}/api/partner-area/einblicke`, { method: 'POST', headers: cookie ? { Cookie: cookie } : {}, body: form })
    const body = await res.text()
    return { status: res.status, data: body ? JSON.parse(body) : null }
  }

  function insertEinblickRow(partnerId, { datum = '2026-01-01', ausgeblendet = 0, isDemo = 0, fotoUrl } = {}) {
    const url = fotoUrl || `/uploads/${crypto.randomUUID()}.jpg`
    return db
      .prepare('INSERT INTO partner_einblicke (partner_id, foto_url, datum, text, einwilligung, ausgeblendet, is_demo) VALUES (?, ?, ?, NULL, 1, ?, ?)')
      .run(partnerId, url, datum, ausgeblendet, isDemo).lastInsertRowid
  }

  await t.test('aus Zuhause 403, ohne Sitzung 401', async () => {
    const household = await createHousehold(base, 'Familie Einblickfrei')
    assert.equal((await get('/api/partner-area/einblicke', household.cookie)).status, 403)
    assert.equal((await postEinblick(household.cookie)).status, 403)
    assert.equal((await get('/api/partner-area/einblicke')).status, 401)
  })

  await t.test('CRUD: anlegen, Liste neueste zuerst, ändern, löschen entfernt die Datei', async () => {
    const { cookie } = await createPartnerArea()
    const older = await postEinblick(cookie, { datum: '2026-08-01', text: 'Welpengruppe am Samstag' })
    assert.equal(older.status, 201)
    assert.match(older.data.fotoUrl, /^\/uploads\/[0-9a-f-]{36}\.jpg$/)
    assert.equal(older.data.datum, '2026-08-01')
    assert.equal(older.data.text, 'Welpengruppe am Samstag')
    assert.equal(older.data.ausgeblendet, false)
    assert.ok(fs.existsSync(storedPath(older.data.fotoUrl)))
    // Der eigene Bereich sieht sein Foto über /uploads, auch ohne öffentliche Freigabe
    assert.equal(await fetchStatus(older.data.fotoUrl, cookie), 200)

    const newer = await postEinblick(cookie, { datum: localToday(), text: '  Rückruftraining‮ am Deich\u0007  ' })
    assert.equal(newer.status, 201)
    assert.equal(newer.data.text, 'Rückruftraining am Deich', 'Steuer- und Bidi-Zeichen entfernt, getrimmt')
    const sameDay = await postEinblick(cookie, { datum: '2026-08-01', einwilligung: 'true' })
    assert.equal(sameDay.status, 201)
    assert.equal(sameDay.data.text, null)

    const list = await get('/api/partner-area/einblicke', cookie)
    assert.equal(list.status, 200)
    assert.deepEqual(list.data.map((e) => e.id), [newer.data.id, sameDay.data.id, older.data.id])
    assert.ok(list.data.every((e) => e.ausgeblendet === false))

    const updated = await put(`/api/partner-area/einblicke/${older.data.id}`, { datum: '2026-07-15', text: 'Sommerkurs' }, cookie)
    assert.equal(updated.status, 200)
    assert.equal(updated.data.datum, '2026-07-15')
    assert.equal(updated.data.text, 'Sommerkurs')
    const textOnly = await put(`/api/partner-area/einblicke/${older.data.id}`, { text: '' }, cookie)
    assert.equal(textOnly.status, 200)
    assert.equal(textOnly.data.text, null)
    assert.equal(textOnly.data.datum, '2026-07-15', 'nicht mitgeschicktes Datum bleibt')
    assert.equal((await put(`/api/partner-area/einblicke/${older.data.id}`, { datum: '2999-01-01' }, cookie)).status, 400)
    assert.equal((await put(`/api/partner-area/einblicke/${older.data.id}`, { ausgeblendet: false }, cookie)).status, 400)
    assert.equal((await put(`/api/partner-area/einblicke/${older.data.id}`, { text: 'Deckrüde gesucht' }, cookie)).status, 400)

    const removed = await del(`/api/partner-area/einblicke/${older.data.id}`, cookie)
    assert.equal(removed.status, 204)
    assert.equal(fs.existsSync(storedPath(older.data.fotoUrl)), false, 'die Datei ist weg')
    assert.equal(await fetchStatus(older.data.fotoUrl, cookie), 404)
    assert.deepEqual((await get('/api/partner-area/einblicke', cookie)).data.map((e) => e.id), [newer.data.id, sameDay.data.id])
    assert.equal((await del(`/api/partner-area/einblicke/${older.data.id}`, cookie)).status, 404)
  })

  await t.test('Einwilligung ist Pflicht - ohne sie 400 und keine Datei auf der Platte', async () => {
    const { cookie } = await createPartnerArea()
    const before = uploadFiles()
    for (const einwilligung of [null, 'false', '1', 'ja']) {
      const res = await postEinblick(cookie, { einwilligung })
      assert.equal(res.status, 400, String(einwilligung))
      assert.equal(res.data.error, CONSENT_MESSAGE)
    }
    assert.deepEqual(uploadFiles(), before)
  })

  await t.test('Datum und Text werden geprüft, fehlgeschlagene Prüfung hinterlässt keine Datei', async () => {
    const { cookie } = await createPartnerArea()
    const before = uploadFiles()
    assert.equal((await postEinblick(cookie, { datum: '2999-01-01' })).status, 400)
    assert.equal((await postEinblick(cookie, { datum: '2026-02-30' })).status, 400)
    assert.equal((await postEinblick(cookie, { datum: '01.09.2026' })).status, 400)
    assert.equal((await postEinblick(cookie, { datum: null })).status, 400)
    assert.equal((await postEinblick(cookie, { text: 'x'.repeat(301) })).status, 400)
    assert.equal((await postEinblick(cookie, { text: 'Welpen abzugeben' })).status, 400)
    assert.equal((await postEinblick(cookie, { text: '<b>fett</b>' })).status, 400)
    assert.equal((await postEinblick(cookie, { foto: null })).status, 400)
    // Bild-Art passt nicht zum Inhalt / kein Bild / nicht erlaubte Art - entschieden nach den Magic Bytes
    for (const [foto, mime, filename] of [
      [Buffer.from('kein Bild'), 'image/png', 'a.png'],
      [JPEG_WITH_EXIF, 'image/png', 'a.png'],
      [Buffer.from('<svg/>'), 'image/svg+xml', 'a.svg']
    ]) {
      const res = await postEinblick(cookie, { foto, mime, filename })
      assert.equal(res.status, 400, filename)
      assert.equal(res.data.error, TYPE_MESSAGE)
    }
    assert.deepEqual(uploadFiles(), before)
    assert.deepEqual((await get('/api/partner-area/einblicke', cookie)).data, [])

    // 300 Zeichen gehen genau noch
    assert.equal((await postEinblick(cookie, { text: 'y'.repeat(300) })).status, 201)
  })

  await t.test('nur JPG und PNG: WebP und GIF -> 400 ohne Datei, auch mit falsch behauptetem Typ', async () => {
    const { cookie } = await createPartnerArea()
    const before = uploadFiles()
    for (const [foto, mime, filename] of [
      [WEBP_BYTES, 'image/webp', 'a.webp'],
      [WEBP_BYTES, 'image/jpeg', 'a.jpg'],
      [GIF_BYTES, 'image/gif', 'a.gif'],
      [GIF_BYTES, 'image/png', 'a.png']
    ]) {
      const res = await postEinblick(cookie, { foto, mime, filename })
      assert.equal(res.status, 400, `${filename} als ${mime}`)
      assert.equal(res.data.error, TYPE_MESSAGE)
    }
    assert.deepEqual(uploadFiles(), before)
    assert.deepEqual((await get('/api/partner-area/einblicke', cookie)).data, [])

    // Der allgemeine Foto-Upload (Tiere, Chronik) nimmt WebP/GIF weiterhin an
    const form = new FormData()
    form.append('file', new Blob([GIF_BYTES], { type: 'image/gif' }), 'tier.gif')
    const general = await fetch(`${base}/api/uploads`, { method: 'POST', headers: { Cookie: cookie }, body: form })
    assert.equal(general.status, 201)
  })

  await t.test('Audit V7a: wie Bannerfotos - riesige Maße, unlesbare Dateien und nicht entfernbare Metadaten -> 400 ohne Datei', async () => {
    const { cookie } = await createPartnerArea()
    const before = uploadFiles()
    const huge = await postEinblick(cookie, { foto: jpegWithExif({ width: 30000, height: 30000 }) })
    assert.equal(huge.status, 400)
    assert.match(huge.data.error, /höchstens 8000 × 8000 Pixel/)
    const tooManyPixels = await postEinblick(cookie, { foto: jpegWithExif({ width: 8000, height: 6000 }) })
    assert.equal(tooManyPixels.status, 400, 'mehr als 40 Megapixel')
    // Ohne SOF-Segment (keine Maße) bzw. mit kaputtem Segment: nicht lesbar.
    const noSize = Buffer.concat([Buffer.from([0xff, 0xd8]), jpegSegment(0xda, Buffer.from([0x00, 0x01, 0x02])), Buffer.from([0xff, 0xd9])])
    const broken = Buffer.concat([Buffer.from([0xff, 0xd8]), jpegSegment(0xe1, Buffer.from('Exif\0\0GPS', 'latin1')), Buffer.from([0x00, 0x00, 0x00])])
    for (const foto of [noSize, broken]) {
      const res = await postEinblick(cookie, { foto })
      assert.equal(res.status, 400)
      assert.match(res.data.error, /lässt sich nicht lesen/)
    }
    // Ohne Scan (EOI direkt nach SOF) behält der Entferner das Original samt Exif ("fail open") - die Prüfung lehnt ab.
    const exifKept = Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      jpegSegment(0xe1, Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), Buffer.from([0x4d, 0x4d, 0x00, 0x2a])])),
      sof0(800, 600),
      Buffer.from([0xff, 0xd9])
    ])
    const leftover = await postEinblick(cookie, { foto: exifKept })
    assert.equal(leftover.status, 400)
    assert.match(leftover.data.error, /ließen sich nicht entfernen/)
    assert.deepEqual(uploadFiles(), before, 'jede Ablehnung räumt die Datei weg')
    assert.deepEqual((await get('/api/partner-area/einblicke', cookie)).data, [])
  })

  await t.test('höchstens 60 Einblicke: der 61. -> 409, keine Datei', async () => {
    const { partner, cookie } = await createPartnerArea()
    for (let i = 0; i < 60; i += 1) insertEinblickRow(partner.id)
    const before = uploadFiles()
    const res = await postEinblick(cookie)
    assert.equal(res.status, 409)
    assert.equal(res.data.error, 'Höchstens 60 Einblicke – bitte ältere löschen.')
    assert.deepEqual(uploadFiles(), before)
  })

  await t.test('fremder Einblick -> 404 (lesen, ändern, löschen), bleibt unverändert', async () => {
    const a = await createPartnerArea()
    const b = await createPartnerArea()
    const own = await postEinblick(a.cookie, { text: 'Nur für A' })
    assert.equal(own.status, 201)

    assert.equal((await put(`/api/partner-area/einblicke/${own.data.id}`, { text: 'Von B' }, b.cookie)).status, 404)
    assert.equal((await del(`/api/partner-area/einblicke/${own.data.id}`, b.cookie)).status, 404)
    assert.equal((await put('/api/partner-area/einblicke/abc', { text: 'x' }, a.cookie)).status, 404)
    assert.deepEqual((await get('/api/partner-area/einblicke', b.cookie)).data, [])
    // B sieht A's Foto auch nicht über /uploads
    assert.equal(await fetchStatus(own.data.fotoUrl, b.cookie), 404)

    const row = db.prepare('SELECT text FROM partner_einblicke WHERE id = ?').get(own.data.id)
    assert.equal(row.text, 'Nur für A')
    assert.ok(fs.existsSync(storedPath(own.data.fotoUrl)))
  })

  await t.test('Demo-Sitzung liest, schreibt aber nicht', async () => {
    const { generateCode, hashCode } = require('../lib/codes')
    const { insertPartnerArea } = require('../lib/partnerAreas')
    const partnerId = db
      .prepare("INSERT INTO partners (slug, name, typ, status, is_demo) VALUES ('demo-einblick', 'Demo-Hundeschule Einblick', 'hundeschule', 'aktiv', 1)")
      .run().lastInsertRowid
    const einblickId = insertEinblickRow(partnerId, { isDemo: 1 })
    const code = generateCode()
    insertPartnerArea(db, { partner: db.prepare('SELECT * FROM partners WHERE id = ?').get(partnerId), accessKeyHash: hashCode(code) })
    const cookie = getCookie((await post('/api/login', { secret: code })).res)

    const list = await get('/api/partner-area/einblicke', cookie)
    assert.equal(list.status, 200)
    assert.deepEqual(list.data.map((e) => e.id), [einblickId])
    const before = uploadFiles()
    assert.equal((await postEinblick(cookie)).status, 403)
    assert.equal((await put(`/api/partner-area/einblicke/${einblickId}`, { text: 'Demo' }, cookie)).status, 403)
    assert.equal((await del(`/api/partner-area/einblicke/${einblickId}`, cookie)).status, 403)
    assert.deepEqual(uploadFiles(), before)
    assert.ok(db.prepare('SELECT 1 FROM partner_einblicke WHERE id = ?').get(einblickId))
  })

  await t.test('Metadaten werden entfernt (JPEG-EXIF, PNG-Text)', async () => {
    const { cookie } = await createPartnerArea()
    const jpg = await postEinblick(cookie)
    assert.equal(jpg.status, 201)
    const storedJpg = fs.readFileSync(storedPath(jpg.data.fotoUrl))
    assert.equal(storedJpg.includes('Exif'), false)
    assert.ok(storedJpg.includes(Buffer.from([0x12, 0x34, 0x56])))

    const png = await postEinblick(cookie, { foto: PNG_WITH_TEXT, mime: 'image/png', filename: 'b.png' })
    assert.equal(png.status, 201)
    assert.match(png.data.fotoUrl, /\.png$/)
    const storedPng = fs.readFileSync(storedPath(png.data.fotoUrl))
    assert.equal(storedPng.includes('Aufnahmeort geheim'), false)
    assert.ok(storedPng.includes(Buffer.from('IDAT', 'ascii')))
  })

  await t.test('öffentlich: Portal zeigt nur sichtbare Einblicke, /public-media nur bei sichtbarem Partner', async () => {
    const { partner, cookie } = await createPartnerArea()
    const first = (await postEinblick(cookie, { datum: '2026-05-01', text: 'Erster Kurstag' })).data
    const second = (await postEinblick(cookie, { datum: '2026-06-01', text: 'Abschlussprüfung' })).data

    const portal = await get(`/api/public/partners/${partner.slug}`)
    assert.equal(portal.status, 200)
    assert.deepEqual(portal.data.einblicke, [
      { id: second.id, fotoUrl: publicUrl(second.fotoUrl), datum: '2026-06-01', text: 'Abschlussprüfung' },
      { id: first.id, fotoUrl: publicUrl(first.fotoUrl), datum: '2026-05-01', text: 'Erster Kurstag' }
    ])
    assert.equal(await fetchStatus(publicUrl(second.fotoUrl)), 200)

    // Admin blendet aus -> weder im Portal noch über /public-media
    const hidden = await post(`/api/admin/einblicke/${second.id}/ausblenden`, { ausgeblendet: true }, adminCookie)
    assert.equal(hidden.status, 200)
    assert.equal(hidden.data.ausgeblendet, true)
    assert.deepEqual((await get(`/api/public/partners/${partner.slug}`)).data.einblicke.map((e) => e.id), [first.id])
    assert.equal(await fetchStatus(publicUrl(second.fotoUrl)), 404)
    // Der Partner sieht den ausgeblendeten Einblick weiterhin, mit Kennzeichnung
    const own = (await get('/api/partner-area/einblicke', cookie)).data
    assert.equal(own.find((e) => e.id === second.id).ausgeblendet, true)
    assert.equal(await fetchStatus(second.fotoUrl, cookie), 200)

    const adminList = await get(`/api/admin/einblicke?partnerId=${partner.id}`, adminCookie)
    assert.equal(adminList.status, 200)
    assert.deepEqual(adminList.data.map((e) => [e.id, e.ausgeblendet]), [[second.id, true], [first.id, false]])
    assert.equal(adminList.data[0].partnerId, partner.id)
    assert.equal(adminList.data[0].partnerName, partner.name)
    assert.equal((await get(`/api/admin/einblicke?partnerId=${partner.id}`, cookie)).status, 401)
    assert.equal((await get('/api/admin/einblicke?partnerId=abc', adminCookie)).status, 400)
    assert.equal((await post('/api/admin/einblicke/999999/ausblenden', { ausgeblendet: true }, adminCookie)).status, 404)
    assert.equal((await post(`/api/admin/einblicke/${second.id}/ausblenden`, { ausgeblendet: 'ja' }, adminCookie)).status, 400)

    await post(`/api/admin/einblicke/${second.id}/ausblenden`, { ausgeblendet: false }, adminCookie)
    assert.equal(await fetchStatus(publicUrl(second.fotoUrl)), 200)

    // Pausiert -> Portal 404, Fotos 404; wieder aktiv -> sichtbar; gesperrt -> 404
    assert.equal((await post('/api/partner-area/profile/publish', { aktiv: false }, cookie)).status, 200)
    assert.equal((await get(`/api/public/partners/${partner.slug}`)).status, 404)
    assert.equal(await fetchStatus(publicUrl(first.fotoUrl)), 404)
    assert.equal((await post('/api/partner-area/profile/publish', { aktiv: true }, cookie)).status, 200)
    assert.equal(await fetchStatus(publicUrl(first.fotoUrl)), 200)
    const locked = await put(`/api/admin/partners/${partner.id}`, { name: partner.name, typ: partner.typ, plz: '10115', portalText: PORTAL_TEXT, status: 'aktiv', gesperrt: true }, adminCookie)
    assert.equal(locked.status, 200)
    assert.equal(await fetchStatus(publicUrl(first.fotoUrl)), 404)
    assert.equal(await fetchStatus(publicUrl(second.fotoUrl)), 404)
  })

  await t.test('teaserFoto: neuester sichtbarer Einblick in Liste, Umkreis und Entdecken, sonst null', async () => {
    const withPhotos = await createPartnerArea({ name: 'Hundeschule Teaser Mit', slug: 'teaser-mit' })
    const without = await createPartnerArea({ name: 'Hundeschule Teaser Ohne', slug: 'teaser-ohne' })
    const old = (await postEinblick(withPhotos.cookie, { datum: '2026-03-01' })).data
    const newest = (await postEinblick(withPhotos.cookie, { datum: '2026-04-01' })).data
    await post(`/api/admin/einblicke/${newest.id}/ausblenden`, { ausgeblendet: true }, adminCookie)

    const bySlug = (cards) => Object.fromEntries(cards.filter((c) => c.kind !== 'promotion').map((c) => [c.slug, c]))
    const list = bySlug((await get('/api/public/partners')).data)
    assert.equal(list['teaser-mit'].teaserFoto, publicUrl(old.fotoUrl), 'der ausgeblendete neueste zählt nicht')
    assert.equal(list['teaser-ohne'].teaserFoto, null)

    const near = bySlug((await post('/api/public/partners/near', { plz: '10115', radius: 10 })).data)
    assert.equal(near['teaser-mit'].teaserFoto, publicUrl(old.fotoUrl))
    assert.equal(near['teaser-ohne'].teaserFoto, null)

    const household = await createHousehold(base, 'Familie Teaser')
    const discover = await post('/api/discover', { plz: '10115', radius: 10 }, household.cookie)
    assert.equal(discover.status, 200)
    const schools = bySlug(discover.data.hundeschulen)
    assert.equal(schools['teaser-mit'].teaserFoto, publicUrl(old.fotoUrl))
    assert.equal(schools['teaser-ohne'].teaserFoto, null)

    await post(`/api/admin/einblicke/${newest.id}/ausblenden`, { ausgeblendet: false }, adminCookie)
    assert.equal(bySlug((await get('/api/public/partners')).data)['teaser-mit'].teaserFoto, publicUrl(newest.fotoUrl))
  })

  await t.test('Profil empfiehlt einen Einblick, bis ein sichtbarer da ist', async () => {
    const { cookie } = await createPartnerArea()
    const empfohlen = async () => (await get('/api/partner-area/profile', cookie)).data.vollstaendig.empfohlen
    assert.ok((await empfohlen()).includes('mindestens ein Einblick'))
    const einblick = (await postEinblick(cookie)).data
    assert.ok(!(await empfohlen()).includes('mindestens ein Einblick'))
    await post(`/api/admin/einblicke/${einblick.id}/ausblenden`, { ausgeblendet: true }, adminCookie)
    assert.ok((await empfohlen()).includes('mindestens ein Einblick'))
  })

  await t.test('Demo-Pack ersetzen: Demo-Einblicke samt Dateien weg, echte bleiben', async () => {
    const { replaceDemoPack } = require('../lib/demoPack')
    replaceDemoPack(db, config.uploadDir)
    const demoPartner = db.prepare("SELECT id FROM partners WHERE slug = 'hundeschule-pfotenglueck' AND is_demo = 1").get()

    const demoFile = `${crypto.randomUUID()}.jpg`
    fs.writeFileSync(path.join(config.uploadDir, demoFile), JPEG_WITH_EXIF)
    const demoId = insertEinblickRow(demoPartner.id, { isDemo: 1, fotoUrl: `/uploads/${demoFile}` })
    // Auch ein (fälschlich) nicht als Demo markierter Einblick eines Demo-Partners darf nicht verwaisen
    const strayFile = `${crypto.randomUUID()}.jpg`
    fs.writeFileSync(path.join(config.uploadDir, strayFile), JPEG_WITH_EXIF)
    const strayId = insertEinblickRow(demoPartner.id, { fotoUrl: `/uploads/${strayFile}` })

    const real = await createPartnerArea()
    const realEinblick = (await postEinblick(real.cookie)).data

    replaceDemoPack(db, config.uploadDir)
    assert.equal(db.prepare('SELECT 1 FROM partner_einblicke WHERE id IN (?, ?)').get(demoId, strayId), undefined)
    assert.equal(fs.existsSync(path.join(config.uploadDir, demoFile)), false)
    assert.equal(fs.existsSync(path.join(config.uploadDir, strayFile)), false)
    assert.ok(db.prepare('SELECT 1 FROM partner_einblicke WHERE id = ?').get(realEinblick.id))
    assert.ok(fs.existsSync(storedPath(realEinblick.fotoUrl)))
  })
})
