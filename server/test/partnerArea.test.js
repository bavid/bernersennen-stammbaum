const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, createFamily, createHousehold, getCookie } = require('./helpers')

// Phase P Task 3a: Partner-Bereich - Profil selbst pflegen, veröffentlichen/pausieren, Logo
// (/api/partner-area/profile*). t.test() bleibt auf einer Ebene.
const ADMIN_TEST_PASSWORD = 'admin-test-partner-area-1'
const dataDir = useTempDataDir('partner-area', { LOGIN_RATE_LIMIT: '300', CODE_RATE_LIMIT: '300' })

const LONG_PORTAL_TEXT = 'Wir trainieren mit Familien und ihren Hunden im Park und in der Stadt – ruhig, freundlich und alltagsnah.'

function jpegSegment(marker, payload) {
  const length = Buffer.alloc(2)
  length.writeUInt16BE(payload.length + 2, 0)
  return Buffer.concat([Buffer.from([0xff, marker]), length, payload])
}

// Synthetisches JPEG mit APP1-Exif-Segment (wie test/uploadAccess.test.js).
const JPEG_WITH_EXIF = Buffer.concat([
  Buffer.from([0xff, 0xd8]),
  jpegSegment(0xe1, Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8, 0xca, 0xfe])])),
  jpegSegment(0xda, Buffer.from([0x00, 0x01, 0x02])),
  Buffer.from([0x12, 0x34, 0x56]),
  Buffer.from([0xff, 0xd9])
])

function pngChunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  return Buffer.concat([length, Buffer.from(type, 'ascii'), data, Buffer.alloc(4)])
}

// Synthetisches PNG mit tEXt-Chunk (Metadaten) zwischen IHDR und IEND.
const PNG_WITH_TEXT = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  pngChunk('IHDR', Buffer.alloc(13)),
  pngChunk('tEXt', Buffer.from('Author\0Geheimer Ort', 'latin1')),
  pngChunk('IDAT', Buffer.from([1, 2, 3])),
  pngChunk('IEND', Buffer.alloc(0))
])

async function upload(base, urlPath, cookie, buffer, filename, mimeType) {
  const form = new FormData()
  form.append('file', new Blob([buffer], { type: mimeType }), filename)
  const res = await fetch(`${base}${urlPath}`, { method: 'POST', headers: cookie ? { Cookie: cookie } : {}, body: form })
  const text = await res.text()
  return { status: res.status, data: text ? JSON.parse(text) : null }
}

test('Partner-Bereich: Profil pflegen, veröffentlichen, pausieren, Logo', async (t) => {
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

  let counter = 0
  // Partner per Admin anlegen, Bereich dazu, mit dem Schlüssel anmelden.
  async function createPartnerArea(overrides = {}) {
    counter += 1
    const input = { name: `Hundeschule Testwiese ${counter}`, slug: `testwiese-${counter}`, typ: 'hundeschule', status: 'entwurf', ...overrides }
    const partner = await post('/api/admin/partners', input, adminCookie)
    assert.equal(partner.status, 201)
    const area = await post(`/api/admin/partners/${partner.data.id}/area`, undefined, adminCookie)
    assert.equal(area.status, 201)
    const login = await post('/api/login', { secret: area.data.key })
    assert.equal(login.status, 200)
    return { partner: partner.data, familyId: area.data.familyId, cookie: getCookie(login.res) }
  }

  const partnerRow = (id) => db.prepare('SELECT * FROM partners WHERE id = ?').get(id)

  await t.test('ohne Sitzung 401; aus Zuhause oder Rudel 403', async () => {
    assert.equal((await get('/api/partner-area/profile')).status, 401)

    const household = await createHousehold(base, 'Familie Wiesental')
    const fromHome = await get('/api/partner-area/profile', household.cookie)
    assert.equal(fromHome.status, 403)
    assert.equal(fromHome.data.error, 'Nur im Partner-Bereich möglich')
    assert.equal((await put('/api/partner-area/profile', { name: 'Gekapert' }, household.cookie)).status, 403)

    const rudel = await createFamily(base, 'Rudel Wiesental', 'rudel-partner-area-pw')
    assert.equal((await get('/api/partner-area/profile', rudel.cookie)).status, 403)
    assert.equal((await post('/api/partner-area/profile/publish', { aktiv: true }, rudel.cookie)).status, 403)
  })

  await t.test('GET /profile: eigene Angaben in camelCase, Status, Vollständigkeit', async () => {
    const { partner, cookie } = await createPartnerArea({ plz: '10115', kontaktEmail: 'kurs@example.org', website: 'https://example.org/wiese' })
    const res = await get('/api/partner-area/profile', cookie)
    assert.equal(res.status, 200)
    const profile = res.data
    assert.equal(profile.id, partner.id)
    assert.equal(profile.slug, partner.slug)
    assert.equal(profile.typ, 'hundeschule')
    assert.equal(profile.status, 'entwurf')
    assert.equal(profile.gesperrt, false)
    assert.equal(profile.ort, 'Berlin')
    assert.equal(profile.kontaktEmail, 'kurs@example.org')
    assert.equal(profile.website, 'https://example.org/wiese')
    assert.equal(profile.kontaktformularAktiv, true)
    assert.equal(profile.kontaktFormularUrl, null)
    assert.equal(profile.logoUrl, null)
    assert.equal(profile.badge, 'partner')
    assert.equal(profile.kontakt_email, undefined, 'keine snake_case-Felder')

    assert.equal(profile.vollstaendig.ok, false)
    assert.deepEqual(profile.vollstaendig.fehlt, ['Portal-Text (mind. 40 Zeichen)'])
    assert.ok(profile.vollstaendig.empfohlen.includes('Logo'))
    assert.ok(!profile.vollstaendig.empfohlen.some((label) => label.startsWith('Kontakt')), 'E-Mail zählt als Kontakt')

    const withoutPlz = await createPartnerArea()
    const bare = (await get('/api/partner-area/profile', withoutPlz.cookie)).data
    assert.deepEqual(bare.vollstaendig.fehlt, ['Postleitzahl', 'Portal-Text (mind. 40 Zeichen)'])
    assert.ok(bare.vollstaendig.empfohlen.includes('Kontakt (E-Mail, Telefon oder Kontaktformular)'))
  })

  await t.test('PUT /profile: erlaubte Felder werden gespeichert, fehlende bleiben, Slug bleibt', async () => {
    const { partner, cookie } = await createPartnerArea({ plz: '10115', website: 'https://example.org/bleibt' })
    const res = await put(
      '/api/partner-area/profile',
      {
        name: 'Hundeschule Neue Wiese',
        portalTitel: 'Training mit Herz',
        portalText: `  ${LONG_PORTAL_TEXT}  `,
        farbe: '#1F5F8B',
        kontaktTelefon: '030 123456',
        kontaktFormularUrl: 'https://example.org/kontakt',
        kontaktformularAktiv: false,
        spendenUrl: 'www.example.org/spenden',
        vermittlungUrl: null
      },
      cookie
    )
    assert.equal(res.status, 200)
    assert.equal(res.data.name, 'Hundeschule Neue Wiese')
    assert.equal(res.data.slug, partner.slug, 'der Slug ändert sich nie')
    assert.equal(res.data.portalTitel, 'Training mit Herz')
    assert.equal(res.data.portalText, LONG_PORTAL_TEXT)
    assert.equal(res.data.farbe, '#1f5f8b')
    assert.equal(res.data.kontaktTelefon, '030 123456')
    assert.equal(res.data.kontaktFormularUrl, 'https://example.org/kontakt')
    assert.equal(res.data.kontaktformularAktiv, false)
    assert.equal(res.data.spendenUrl, 'https://www.example.org/spenden')
    assert.equal(res.data.website, 'https://example.org/bleibt', 'nicht mitgeschickte Felder bleiben unverändert')
    assert.equal(res.data.status, 'entwurf')
    assert.equal(res.data.vollstaendig.ok, true)

    const row = partnerRow(partner.id)
    assert.equal(row.slug, partner.slug)
    assert.equal(row.portal_text, LONG_PORTAL_TEXT)

    // Ungültige Werte laufen durch dieselben Prüfungen wie beim Admin
    assert.equal((await put('/api/partner-area/profile', { website: 'javascript:alert(1)' }, cookie)).status, 400)
    assert.equal((await put('/api/partner-area/profile', { kontaktEmail: 'keine-email' }, cookie)).status, 400)
    assert.equal((await put('/api/partner-area/profile', { farbe: '#ffffff' }, cookie)).status, 400)
    assert.equal((await put('/api/partner-area/profile', { name: '' }, cookie)).status, 400)
    assert.equal((await put('/api/partner-area/profile', { portalText: '<script>alert(1)</script>' }, cookie)).status, 400)
    assert.equal((await put('/api/partner-area/profile', { kontaktformularAktiv: 'false' }, cookie)).status, 400)
  })

  await t.test('PUT /profile: Felder des Betreibers -> 400, nichts geändert', async () => {
    const { partner, cookie } = await createPartnerArea({ plz: '10115' })
    for (const [feld, wert] of [
      ['slug', 'gekaperter-slug'],
      ['typ', 'tierheim'],
      ['status', 'aktiv'],
      ['istPartner', false],
      ['gesperrt', false],
      ['logoFile', 'x.png'],
      ['isDemo', true]
    ]) {
      const res = await put('/api/partner-area/profile', { name: 'Anderer Name', [feld]: wert }, cookie)
      assert.equal(res.status, 400, feld)
      assert.equal(res.data.error, `Dieses Feld kann nur der Betreiber ändern: ${feld}`)
    }
    const row = partnerRow(partner.id)
    assert.equal(row.name, partner.name)
    assert.equal(row.slug, partner.slug)
    assert.equal(row.status, 'entwurf')
    assert.equal(row.typ, 'hundeschule')
  })

  await t.test('PUT /profile: Züchter-Texte -> 400', async () => {
    const { partner, cookie } = await createPartnerArea({ plz: '10115' })
    const text = await put('/api/partner-area/profile', { portalText: `${LONG_PORTAL_TEXT} Welpen abzugeben aus eigener Zucht.` }, cookie)
    assert.equal(text.status, 400)
    assert.match(text.data.error, /Züchter/)
    assert.equal((await put('/api/partner-area/profile', { name: 'Zwinger vom Deich' }, cookie)).status, 400)
    assert.equal((await put('/api/partner-area/profile', { portalTitel: 'Unsere Deckrüden' }, cookie)).status, 400)
    assert.equal(partnerRow(partner.id).portal_text, null)
  })

  await t.test('PUT /profile: PLZ setzt ort/lat/lon neu, unbekannte PLZ -> 400', async () => {
    const { partner, cookie } = await createPartnerArea({ plz: '10115' })
    const before = partnerRow(partner.id)
    const res = await put('/api/partner-area/profile', { plz: '20095' }, cookie)
    assert.equal(res.status, 200)
    assert.equal(res.data.plz, '20095')
    assert.equal(res.data.ort, 'Hamburg')
    const after = partnerRow(partner.id)
    assert.notEqual(after.lat, before.lat)
    assert.notEqual(after.lon, before.lon)

    assert.equal((await put('/api/partner-area/profile', { plz: '00000' }, cookie)).status, 400)
    assert.equal(partnerRow(partner.id).plz, '20095')
  })

  await t.test('Veröffentlichen: unvollständig -> 400 mit fehlt, vollständig -> aktiv und öffentlich, pausieren -> verborgen', async () => {
    const { partner, cookie } = await createPartnerArea()
    const incomplete = await post('/api/partner-area/profile/publish', { aktiv: true }, cookie)
    assert.equal(incomplete.status, 400)
    assert.deepEqual(incomplete.data.fehlt, ['Postleitzahl', 'Portal-Text (mind. 40 Zeichen)'])
    assert.equal(incomplete.data.error, 'Bitte ergänzt noch: Postleitzahl, Portal-Text (mind. 40 Zeichen).')
    assert.equal(partnerRow(partner.id).status, 'entwurf')

    // 39 Zeichen reichen nicht
    await put('/api/partner-area/profile', { plz: '10115', portalText: 'x'.repeat(39) }, cookie)
    const short = await post('/api/partner-area/profile/publish', { aktiv: true }, cookie)
    assert.equal(short.status, 400)
    assert.deepEqual(short.data.fehlt, ['Portal-Text (mind. 40 Zeichen)'])

    assert.equal((await post('/api/partner-area/profile/publish', { aktiv: 'ja' }, cookie)).status, 400)
    assert.equal((await post('/api/partner-area/profile/publish', {}, cookie)).status, 400)

    assert.equal((await get(`/api/public/partners/${partner.slug}`)).status, 404)
    await put('/api/partner-area/profile', { portalText: LONG_PORTAL_TEXT }, cookie)
    const published = await post('/api/partner-area/profile/publish', { aktiv: true }, cookie)
    assert.equal(published.status, 200)
    assert.equal(published.data.status, 'aktiv')
    const portal = await get(`/api/public/partners/${partner.slug}`)
    assert.equal(portal.status, 200)
    assert.equal(portal.data.portal_text, LONG_PORTAL_TEXT)
    assert.ok((await get('/api/public/partners')).data.some((p) => p.slug === partner.slug))

    const paused = await post('/api/partner-area/profile/publish', { aktiv: false }, cookie)
    assert.equal(paused.status, 200)
    assert.equal(paused.data.status, 'pausiert')
    assert.equal((await get(`/api/public/partners/${partner.slug}`)).status, 404)
    assert.ok(!(await get('/api/public/partners')).data.some((p) => p.slug === partner.slug))
  })

  await t.test('öffentliches Profil: PUT darf Pflichtangaben nicht entfernen, pausiert geht alles', async () => {
    const { partner, cookie } = await createPartnerArea({ plz: '10115', portalText: LONG_PORTAL_TEXT, website: 'https://example.org/aktiv' })
    assert.equal((await post('/api/partner-area/profile/publish', { aktiv: true }, cookie)).status, 200)
    const before = partnerRow(partner.id)

    const noPlz = await put('/api/partner-area/profile', { plz: '', website: 'https://example.org/neu' }, cookie)
    assert.equal(noPlz.status, 400)
    assert.deepEqual(noPlz.data.fehlt, ['Postleitzahl'])
    assert.equal(noPlz.data.error, 'Solange euer Profil öffentlich ist, braucht es: Postleitzahl – oder pausiert es zuerst.')
    assert.deepEqual(partnerRow(partner.id), before, 'nichts geändert, auch nicht die mitgeschickte Website')

    const shortText = await put('/api/partner-area/profile', { portalText: 'Zu kurz.' }, cookie)
    assert.equal(shortText.status, 400)
    assert.deepEqual(shortText.data.fehlt, ['Portal-Text (mind. 40 Zeichen)'])
    const noText = await put('/api/partner-area/profile', { portalText: null, plz: null }, cookie)
    assert.equal(noText.status, 400)
    assert.deepEqual(noText.data.fehlt, ['Postleitzahl', 'Portal-Text (mind. 40 Zeichen)'])
    assert.deepEqual(partnerRow(partner.id), before)

    // Änderungen, die vollständig bleiben, gehen weiter
    const ok = await put('/api/partner-area/profile', { portalTitel: 'Neuer Titel', plz: '20095' }, cookie)
    assert.equal(ok.status, 200)
    assert.equal(ok.data.status, 'aktiv')

    // Pausiert: frei bearbeitbar, auch Pflichtangaben leeren
    assert.equal((await post('/api/partner-area/profile/publish', { aktiv: false }, cookie)).status, 200)
    const cleared = await put('/api/partner-area/profile', { plz: '', portalText: null }, cookie)
    assert.equal(cleared.status, 200)
    assert.equal(cleared.data.plz, null)
    assert.equal(cleared.data.portalText, null)
    assert.equal(cleared.data.status, 'pausiert')
    assert.equal(partnerRow(partner.id).ort, null)
  })

  await t.test('öffentliches Profil, das schon unvollständig ist: andere Felder bleiben änderbar', async () => {
    // Der Betreiber kann einen Partner ohne Portal-Text aktiv schalten - der Partner soll dann trotzdem
    // z. B. seine Telefonnummer pflegen können, ohne erst den Text schreiben zu müssen.
    const { partner, cookie } = await createPartnerArea({ plz: '10115', status: 'aktiv' })
    const res = await put('/api/partner-area/profile', { kontaktTelefon: '030 654321' }, cookie)
    assert.equal(res.status, 200)
    assert.equal(partnerRow(partner.id).kontakt_telefon, '030 654321')
    // Was schon da ist, darf aber nicht verschwinden
    const noPlz = await put('/api/partner-area/profile', { plz: null }, cookie)
    assert.equal(noPlz.status, 400)
    assert.deepEqual(noPlz.data.fehlt, ['Postleitzahl', 'Portal-Text (mind. 40 Zeichen)'])
    assert.equal(partnerRow(partner.id).plz, '10115')
  })

  await t.test('Veröffentlichen/Pausieren bei gesperrtem Partner -> 403', async () => {
    const { partner, cookie } = await createPartnerArea({ plz: '10115', portalText: LONG_PORTAL_TEXT })
    const locked = await put(
      `/api/admin/partners/${partner.id}`,
      { name: partner.name, typ: partner.typ, plz: '10115', portalText: LONG_PORTAL_TEXT, gesperrt: true },
      adminCookie
    )
    assert.equal(locked.status, 200)

    const profile = await get('/api/partner-area/profile', cookie)
    assert.equal(profile.status, 200)
    assert.equal(profile.data.gesperrt, true)

    for (const aktiv of [true, false]) {
      const res = await post('/api/partner-area/profile/publish', { aktiv }, cookie)
      assert.equal(res.status, 403)
      assert.equal(res.data.error, 'Gesperrt – bitte meldet euch beim Betreiber.')
    }
    assert.equal(partnerRow(partner.id).status, 'pausiert')
  })

  await t.test('fremder Partner-Bereich: sieht und ändert nur den eigenen Partner', async () => {
    const a = await createPartnerArea({ plz: '10115' })
    const b = await createPartnerArea({ plz: '10115' })
    assert.equal((await get('/api/partner-area/profile', b.cookie)).data.id, b.partner.id)

    const res = await put('/api/partner-area/profile', { portalTitel: 'Nur für B' }, b.cookie)
    assert.equal(res.status, 200)
    assert.equal(partnerRow(b.partner.id).portal_titel, 'Nur für B')
    assert.equal(partnerRow(a.partner.id).portal_titel, null)
  })

  await t.test('Tierheim-Bereich (art tierheim) ist ebenfalls ein Partner-Bereich', async () => {
    const shelter = await createPartnerArea({ typ: 'tierheim', plz: '10115' })
    const res = await get('/api/partner-area/profile', shelter.cookie)
    assert.equal(res.status, 200)
    assert.equal(res.data.typ, 'tierheim')
  })

  await t.test('Demo-Partner-Sitzung: lesen ja, schreiben 403', async () => {
    const { generateCode, hashCode } = require('../lib/codes')
    const { insertPartnerArea } = require('../lib/partnerAreas')
    const partnerId = db
      .prepare("INSERT INTO partners (slug, name, typ, status, is_demo) VALUES ('demo-testwiese', 'Demo-Hundeschule Testwiese', 'hundeschule', 'aktiv', 1)")
      .run().lastInsertRowid
    const code = generateCode()
    insertPartnerArea(db, { partner: partnerRow(partnerId), accessKeyHash: hashCode(code) })
    const login = await post('/api/login', { secret: code })
    assert.equal(login.status, 200)
    assert.equal(login.data.isDemo, true)
    const cookie = getCookie(login.res)

    assert.equal((await get('/api/partner-area/profile', cookie)).status, 200)
    const denied = await put('/api/partner-area/profile', { portalTitel: 'Demo geändert' }, cookie)
    assert.equal(denied.status, 403)
    assert.match(denied.data.error, /Demo-Modus/)
    assert.equal((await post('/api/partner-area/profile/publish', { aktiv: false }, cookie)).status, 403)
    assert.equal((await upload(base, '/api/partner-area/profile/logo', cookie, JPEG_WITH_EXIF, 'logo.jpg', 'image/jpeg')).status, 403)
    const row = partnerRow(partnerId)
    assert.equal(row.portal_titel, null)
    assert.equal(row.status, 'aktiv')
    assert.equal(row.logo_file, null)
  })

  await t.test('Logo: Metadaten entfernt, altes Logo gelöscht, SVG/unbekannte Bytes abgelehnt', async () => {
    const { partner, cookie } = await createPartnerArea({ plz: '10115' })
    const storedFile = (logoUrl) => path.join(config.partnerMediaDir, logoUrl.split('/').pop())

    const jpg = await upload(base, '/api/partner-area/profile/logo', cookie, JPEG_WITH_EXIF, 'logo.jpg', 'image/jpeg')
    assert.equal(jpg.status, 201)
    assert.match(jpg.data.logoUrl, /^\/partner-media\/[0-9a-f-]{36}\.jpg$/)
    const storedJpg = fs.readFileSync(storedFile(jpg.data.logoUrl))
    assert.equal(storedJpg.includes('Exif'), false, 'kein EXIF-Segment mehr')
    assert.ok(storedJpg.includes(Buffer.from([0x12, 0x34, 0x56])), 'Bilddaten bleiben erhalten')

    const png = await upload(base, '/api/partner-area/profile/logo', cookie, PNG_WITH_TEXT, 'logo.png', 'image/png')
    assert.equal(png.status, 201)
    const storedPng = fs.readFileSync(storedFile(png.data.logoUrl))
    assert.equal(storedPng.includes('Geheimer Ort'), false, 'kein tEXt-Chunk mehr')
    assert.ok(storedPng.includes(Buffer.from('IDAT', 'ascii')))
    assert.equal(fs.existsSync(storedFile(jpg.data.logoUrl)), false, 'das alte Logo ist weg')
    assert.equal(partnerRow(partner.id).logo_file, png.data.logoUrl.split('/').pop())

    const profile = (await get('/api/partner-area/profile', cookie)).data
    assert.equal(profile.logoUrl, png.data.logoUrl)
    assert.ok(!profile.vollstaendig.empfohlen.includes('Logo'))

    const svg = await upload(base, '/api/partner-area/profile/logo', cookie, Buffer.from('<svg onload="alert(1)"></svg>'), 'logo.png', 'image/png')
    assert.equal(svg.status, 400)
    assert.equal((await upload(base, '/api/partner-area/profile/logo', cookie, JPEG_WITH_EXIF, 'logo.gif', 'image/gif')).status, 400)

    // Der Admin-Upload läuft über dieselbe Funktion - auch dort verschwinden die Metadaten.
    const adminJpg = await upload(base, `/api/admin/partners/${partner.id}/logo`, adminCookie, JPEG_WITH_EXIF, 'logo.jpg', 'image/jpeg')
    assert.equal(adminJpg.status, 201)
    assert.equal(fs.readFileSync(storedFile(adminJpg.data.logoUrl)).includes('Exif'), false)
    assert.equal(fs.existsSync(storedFile(png.data.logoUrl)), false)
  })
})
