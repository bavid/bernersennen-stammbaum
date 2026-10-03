const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, getCookie } = require('./helpers')

// Phase P1 Task 4 (docs/superpowers/plans/2026-09-29-phase-p-partnerbereich.md): Demo-Partner-Bereiche mit
// Einblicken (seed/demo-partner-area.js, lib/demoPack.js), der neue Demo-Partner "Hundesalon Wuschelglück",
// POST /api/demo { as: 'partner' } und partnerDemo auf dem Portal. Ersetzen ohne Waisen, echte Daten
// unberührt, Rollback samt kopierter Fotos. APP_ENV=staging: Demo-Partner sind dort ohne ?demo=1
// sichtbar (wie demoPack.test.js). t.test() bleibt auf einer Ebene.
const ADMIN_TEST_PASSWORD = 'admin-test-demo-partner-area-1'
const dataDir = useTempDataDir('demo-partner-area', { APP_ENV: 'staging', LOGIN_RATE_LIMIT: '300' })

const PFOTENGLUECK = 'hundeschule-pfotenglueck'
const WUSCHELGLUECK = 'hundesalon-wuschelglueck'
const SONNENHANG = 'tierheim-sonnenhang'
const DEICHLAND = 'tierschutzverein-deichland'

const EXPECTED_TEXTS = {
  [PFOTENGLUECK]: [
    'Welpengruppe am Samstag – heute ging es um Ruhe an der Leine.',
    'Rückruftraining am Deich',
    'Abschlussprüfung im Begleithundekurs – alle bestanden!',
    'Neue Trainingsfläche mit Agility-Parcours'
  ],
  [WUSCHELGLUECK]: [
    'Frisch getrimmt: Pudeldame Flocke',
    'Wellness-Bad für einen Golden Retriever',
    'Krallenpflege ganz entspannt',
    'Sommerschnitt für die Hitze',
    'Welpen-Kennenlerntermin – erste Schritte im Salon'
  ],
  [SONNENHANG]: ['Tag der offenen Tür im Tierheim', 'Neue Kuschelecke im Katzenhaus']
}

// Kleinstes gültiges JPEG (wie test/einblicke.test.js) - für den echten Einblick per Upload.
const TINY_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x05, 0x00, 0x01, 0x02, 0x12, 0x34, 0xff, 0xd9])

function localToday() {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

test('Demo-Partner-Bereiche: Einblicke, Wuschelglück, Demo als Partner, Ersetzen ohne Waisen', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const { uploadDir, partnerMediaDir } = require('../config')
  const { replaceDemoPack } = require('../lib/demoPack')
  const { validatePartner } = require('../lib/partners')
  const { DEMO_PARTNERS } = require('../seed/demo-partners')
  const areaSeed = require('../seed/demo-partner-area')

  const get = (urlPath, cookie) => call(base, urlPath, { cookie })
  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const put = (urlPath, body, cookie) => call(base, urlPath, { method: 'PUT', body, cookie })
  const del = (urlPath, cookie) => call(base, urlPath, { method: 'DELETE', cookie })
  const fetchStatus = async (urlPath, cookie) => (await fetch(`${base}${urlPath}`, { headers: cookie ? { Cookie: cookie } : {} })).status
  const fileOf = (url) => path.basename(url)

  const partnerBySlug = (slug) => db.prepare('SELECT * FROM partners WHERE slug = ?').get(slug)
  const einblickeOf = (slug) =>
    db
      .prepare('SELECT e.* FROM partner_einblicke e JOIN partners p ON p.id = e.partner_id WHERE p.slug = ? ORDER BY e.datum DESC, e.id DESC')
      .all(slug)
  const demoAreasOf = (slug) =>
    db
      .prepare('SELECT f.id, f.art, f.is_demo FROM families f JOIN partners p ON p.id = f.partner_id WHERE p.slug = ? ORDER BY f.id')
      .all(slug)

  // Jede Datei im Upload-Ordner muss an einem Tier, Eintrag, Wurf, Einblick oder Bannerfoto hängen - und umgekehrt.
  function referencedUploadFiles() {
    const urls = [
      ...db.prepare('SELECT foto_url AS url FROM dogs WHERE foto_url IS NOT NULL').all().map((row) => row.url),
      ...db.prepare('SELECT foto_url AS url FROM partner_einblicke').all().map((row) => row.url),
      // Phase V4b: Bannerfotos der Partner (partner_banner) - ebenfalls eigene Dateien im Upload-Ordner.
      ...db.prepare('SELECT foto_url AS url FROM partner_banner').all().map((row) => row.url),
      ...db
        .prepare('SELECT foto_urls FROM timeline_entries UNION ALL SELECT foto_urls FROM breeding_events')
        .all()
        .flatMap((row) => JSON.parse(row.foto_urls))
    ]
    return [...new Set(urls.map(fileOf))].sort()
  }
  const uploadFiles = () => fs.readdirSync(uploadDir).sort()

  const orphanCounts = () => ({
    einblickeOhnePartner: db.prepare('SELECT COUNT(*) AS n FROM partner_einblicke WHERE partner_id NOT IN (SELECT id FROM partners)').get().n,
    bereicheOhnePartner: db
      .prepare(
        `SELECT COUNT(*) AS n FROM families WHERE art IN ('partner', 'tierheim')
           AND (partner_id IS NULL OR partner_id NOT IN (SELECT id FROM partners))`
      )
      .get().n,
    demoEinblickeEchterPartner: db
      .prepare('SELECT COUNT(*) AS n FROM partner_einblicke e JOIN partners p ON p.id = e.partner_id WHERE e.is_demo = 1 AND p.is_demo = 0')
      .get().n
  })

  // --- Aufbau: Demo, danach echte Daten (Partner mit Bereich und hochgeladenem Einblick) -------------

  replaceDemoPack(db, uploadDir)

  const adminLogin = await post('/api/admin/login', { username: 'admin', password: ADMIN_TEST_PASSWORD })
  const adminCookie = getCookie(adminLogin.res)
  const realPartner = await post(
    '/api/admin/partners',
    {
      name: 'Hundesalon Echt',
      slug: 'hundesalon-echt',
      typ: 'hundesalon',
      plz: '20095',
      portalText: 'Ein echter Salon, den das Ersetzen der Demo niemals anfassen darf.',
      status: 'aktiv'
    },
    adminCookie
  )
  assert.equal(realPartner.status, 201)
  const realArea = await post(`/api/admin/partners/${realPartner.data.id}/area`, undefined, adminCookie)
  assert.equal(realArea.status, 201)
  const realLogin = await post('/api/login', { secret: realArea.data.key })
  const realCookie = getCookie(realLogin.res)
  const form = new FormData()
  form.append('datum', '2026-09-01')
  form.append('text', 'Echter Einblick')
  form.append('einwilligung', 'true')
  form.append('foto', new Blob([TINY_JPEG], { type: 'image/jpeg' }), 'foto.jpg')
  const realUpload = await fetch(`${base}/api/partner-area/einblicke`, { method: 'POST', headers: { Cookie: realCookie }, body: form })
  assert.equal(realUpload.status, 201)
  const realEinblick = await realUpload.json()

  const snapshotReal = () => ({
    partners: db.prepare('SELECT * FROM partners WHERE is_demo = 0 ORDER BY id').all(),
    families: db.prepare('SELECT id, name, art, partner_id, access_key_hash, is_demo FROM families WHERE is_demo = 0 ORDER BY id').all(),
    einblicke: db.prepare('SELECT * FROM partner_einblicke WHERE is_demo = 0 ORDER BY id').all(),
    realFileExists: fs.existsSync(path.join(uploadDir, fileOf(realEinblick.fotoUrl)))
  })
  const realBefore = snapshotReal()
  assert.equal(realBefore.realFileExists, true)

  // Gesamter Zustand, den ein gescheitertes replaceDemoPack unverändert lassen muss.
  const snapshotAll = () => ({
    demoFamilies: db.prepare('SELECT id, name, art, partner_id FROM families WHERE is_demo = 1 ORDER BY id').all(),
    demoPartners: db.prepare('SELECT * FROM partners WHERE is_demo = 1 ORDER BY id').all(),
    einblicke: db.prepare('SELECT * FROM partner_einblicke ORDER BY id').all(),
    real: snapshotReal(),
    uploadFiles: uploadFiles(),
    mediaFiles: fs.readdirSync(partnerMediaDir).sort()
  })

  // --- Tests ----------------------------------------------------------------------------------------

  await t.test('Bereiche und Einblicke: Pfotenglück 4, Wuschelglück 5, Tierheim Sonnenhang 2 - alle Demo, mit Einwilligung und eigener Fotodatei', () => {
    for (const slug of [PFOTENGLUECK, WUSCHELGLUECK]) {
      assert.deepEqual(demoAreasOf(slug).map(({ art, is_demo: isDemo }) => ({ art, isDemo })), [{ art: 'partner', isDemo: 1 }], slug)
    }
    assert.deepEqual(demoAreasOf(SONNENHANG).map(({ art, is_demo: isDemo }) => ({ art, isDemo })), [{ art: 'tierheim', isDemo: 1 }])
    assert.deepEqual(demoAreasOf(DEICHLAND), [], 'Deichland bleibt ohne Bereich')

    const today = localToday()
    const allFotos = []
    for (const [slug, texts] of Object.entries(EXPECTED_TEXTS)) {
      const rows = einblickeOf(slug)
      assert.equal(rows.length, texts.length, slug)
      assert.deepEqual(rows.map((row) => row.text).sort(), texts.slice().sort(), slug)
      for (const row of rows) {
        assert.equal(row.einwilligung, 1)
        assert.equal(row.is_demo, 1)
        assert.equal(row.ausgeblendet, 0)
        assert.match(row.datum, /^\d{4}-\d{2}-\d{2}$/)
        assert.ok(row.datum <= today, `${row.datum} liegt nicht in der Zukunft`)
        assert.match(row.foto_url, /^\/uploads\/[0-9a-f-]{36}\.jpg$/)
        assert.ok(fs.existsSync(path.join(uploadDir, fileOf(row.foto_url))), `${row.foto_url} liegt im Upload-Ordner`)
        allFotos.push(row.foto_url)
      }
    }
    assert.equal(new Set(allFotos).size, allFotos.length, 'jeder Einblick hat seine eigene Datei')
    const dogAndEntryFotos = new Set(referencedUploadFiles().filter((file) => !allFotos.map(fileOf).includes(file)))
    assert.ok(allFotos.every((url) => !dogAndEntryFotos.has(fileOf(url))), 'kein Einblick teilt sich eine Datei mit einem Tier/Eintrag')
  })

  await t.test('Wuschelglück: geprüft wie die anderen Demo-Partner, öffentlich in Liste, Portal und Entdecken', async () => {
    const input = DEMO_PARTNERS.find((partner) => partner.slug === WUSCHELGLUECK)
    assert.ok(input, 'steht in seed/demo-partners.js')
    const clean = validatePartner(input)
    const row = partnerBySlug(WUSCHELGLUECK)
    for (const [column, value] of Object.entries(clean)) assert.equal(row[column], value, column)
    assert.equal(row.is_demo, 1)
    assert.equal(row.typ, 'hundesalon')
    assert.equal(row.status, 'aktiv')
    assert.match(row.ort, /Hamburg/)
    assert.ok(row.portal_titel)
    assert.ok(row.portal_text.length >= 40)
    assert.equal(row.kontakt_email, 'salon@example.org')
    assert.equal(row.website, 'https://example.org/wuschelglueck')
    assert.match(row.farbe, /^#[0-9a-f]{6}$/i)

    const list = await get('/api/public/partners')
    const card = list.data.find((partner) => partner.slug === WUSCHELGLUECK)
    assert.ok(card, 'in der öffentlichen Liste')
    assert.match(card.teaserFoto, /^\/public-media\//)

    const portal = await get(`/api/public/partners/${WUSCHELGLUECK}`)
    assert.equal(portal.status, 200)
    assert.equal(portal.data.typ, 'hundesalon')
    assert.equal(portal.data.portal_titel, row.portal_titel)
    assert.equal(portal.data.einblicke.length, 5)
    const dates = portal.data.einblicke.map((einblick) => einblick.datum)
    assert.deepEqual(dates, dates.slice().sort().reverse(), 'neueste zuerst')
    for (const einblick of portal.data.einblicke) {
      assert.match(einblick.fotoUrl, /^\/public-media\//)
      assert.equal(await fetchStatus(einblick.fotoUrl), 200, 'das Foto ist öffentlich abrufbar')
    }

    const demoLogin = await post('/api/demo')
    const discover = await post('/api/discover', {}, getCookie(demoLogin.res))
    assert.equal(discover.status, 200)
    assert.ok(
      discover.data.salon.some((entry) => entry.kind === 'partner' && entry.slug === WUSCHELGLUECK),
      'im Abschnitt salon (Phase P2 Task 9)'
    )
    assert.ok(!discover.data.hundeschulen.some((entry) => entry.kind === 'partner' && entry.slug === WUSCHELGLUECK))
  })

  await t.test('POST /api/demo {as: "partner"} meldet im Pfotenglück-Bereich an, mit slug in einem bestimmten Demo-Partner-Bereich', async () => {
    const login = await post('/api/demo', { as: 'partner' })
    assert.equal(login.status, 200)
    assert.equal(login.data.art, 'partner')
    assert.equal(login.data.isDemo, true)
    assert.equal(login.data.id, demoAreasOf(PFOTENGLUECK)[0].id)
    assert.equal(login.data.partner.slug, PFOTENGLUECK)
    assert.equal(login.data.partner.name, 'Hundeschule Pfotenglück')

    const salon = await post('/api/demo', { as: 'partner', slug: WUSCHELGLUECK })
    assert.equal(salon.status, 200)
    assert.equal(salon.data.art, 'partner')
    assert.equal(salon.data.isDemo, true)
    assert.equal(salon.data.id, demoAreasOf(WUSCHELGLUECK)[0].id)
    assert.equal(salon.data.partner.slug, WUSCHELGLUECK)
    assert.equal(salon.data.partner.typ, 'hundesalon')
  })

  await t.test('nur Demo-Partner-Bereiche: echter Partner, Tierheim, ohne Bereich oder unbekannt -> 404; ungültige Angaben -> 400', async () => {
    for (const slug of ['hundesalon-echt', SONNENHANG, DEICHLAND, 'gibt-es-nicht']) {
      const res = await post('/api/demo', { as: 'partner', slug })
      assert.equal(res.status, 404, slug)
      assert.equal(getCookie(res.res), '', `${slug}: keine Sitzung`)
    }
    assert.equal((await post('/api/demo', { slug: PFOTENGLUECK })).status, 400, 'slug nur zusammen mit as: partner')
    assert.equal((await post('/api/demo', { as: 'tierheim', slug: SONNENHANG })).status, 400)
    assert.equal((await post('/api/demo', { as: 'partner', slug: 42 })).status, 400)
    assert.equal((await post('/api/demo', { as: 'partner', slug: ['hundeschule-pfotenglueck'] })).status, 400)
  })

  await t.test('die Demo-Partner-Sitzung liest Profil und Einblicke, jeder Schreibversuch -> 403', async () => {
    const cookie = getCookie((await post('/api/demo', { as: 'partner' })).res)

    const profile = await get('/api/partner-area/profile', cookie)
    assert.equal(profile.status, 200)
    assert.equal(profile.data.slug, PFOTENGLUECK)

    const einblicke = await get('/api/partner-area/einblicke', cookie)
    assert.equal(einblicke.status, 200)
    assert.deepEqual(einblicke.data.map((einblick) => einblick.text).sort(), EXPECTED_TEXTS[PFOTENGLUECK].slice().sort())
    assert.equal(await fetchStatus(einblicke.data[0].fotoUrl, cookie), 200, 'eigene Einblick-Fotos über /uploads')

    const before = snapshotAll()
    assert.equal((await put('/api/partner-area/profile', { portalTitel: 'Geändert' }, cookie)).status, 403)
    assert.equal((await post('/api/partner-area/profile/publish', { aktiv: false }, cookie)).status, 403)
    assert.equal((await put(`/api/partner-area/einblicke/${einblicke.data[0].id}`, { text: 'Geändert' }, cookie)).status, 403)
    assert.equal((await del(`/api/partner-area/einblicke/${einblicke.data[0].id}`, cookie)).status, 403)
    assert.deepEqual(snapshotAll(), before, 'nichts geändert')
  })

  await t.test('das Portal meldet partnerDemo nur für Demo-Partner mit Demo-Partner-Bereich', async () => {
    for (const slug of [PFOTENGLUECK, WUSCHELGLUECK]) {
      const portal = await get(`/api/public/partners/${slug}`)
      assert.equal(portal.status, 200)
      assert.equal(portal.data.partnerDemo, true, slug)
    }
    const shelter = await get(`/api/public/partners/${SONNENHANG}`)
    assert.equal(shelter.data.partnerDemo, undefined, 'das Tierheim hat "Demo als Tierheim"')
    assert.equal(shelter.data.shelterDemo, true)
    assert.equal(shelter.data.einblicke.length, 2)
    assert.equal((await get(`/api/public/partners/${DEICHLAND}`)).data.partnerDemo, undefined, 'ohne Bereich')
    assert.equal((await get('/api/public/partners/hundesalon-echt')).data.partnerDemo, undefined, 'echter Partner')
  })

  await t.test('zweimal ersetzen: keine Duplikate, keine verwaisten Einblicke, Bereiche oder Dateien, echte Daten unberührt', () => {
    const oldAreaIds = [PFOTENGLUECK, WUSCHELGLUECK, SONNENHANG].map((slug) => demoAreasOf(slug)[0].id)
    const oldEinblickFiles = db.prepare('SELECT foto_url FROM partner_einblicke WHERE is_demo = 1').all().map((row) => fileOf(row.foto_url))
    assert.equal(oldEinblickFiles.length, 11)

    const second = replaceDemoPack(db, uploadDir)

    assert.equal(second.partnerAreas.length, 2)
    for (const slug of [PFOTENGLUECK, WUSCHELGLUECK]) assert.equal(demoAreasOf(slug).length, 1, `${slug}: genau ein Bereich`)
    assert.equal(demoAreasOf(SONNENHANG).length, 1)
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM families WHERE is_demo = 1 AND art = 'partner'").get().n, 2)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM partners WHERE is_demo = 1').get().n, 4)
    for (const [slug, texts] of Object.entries(EXPECTED_TEXTS)) assert.equal(einblickeOf(slug).length, texts.length, slug)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM partner_einblicke WHERE is_demo = 1').get().n, 11)

    assert.equal(
      db.prepare(`SELECT COUNT(*) AS n FROM families WHERE id IN (${oldAreaIds.map(() => '?').join(', ')})`).get(...oldAreaIds).n,
      0,
      'die alten Demo-Bereiche sind weg'
    )
    for (const file of oldEinblickFiles) assert.equal(fs.existsSync(path.join(uploadDir, file)), false, `alte Datei ${file} ist weg`)
    assert.deepEqual(orphanCounts(), { einblickeOhnePartner: 0, bereicheOhnePartner: 0, demoEinblickeEchterPartner: 0 })
    assert.deepEqual(uploadFiles(), referencedUploadFiles(), 'keine verwaiste und keine fehlende Datei')
    assert.deepEqual(snapshotReal(), realBefore, 'echter Partner, Bereich und Einblick unverändert')
  })

  await t.test('Rollback: ein Einblick, der die Prüfung echter Einblicke nicht besteht, lässt alles unverändert', () => {
    const cases = [
      { text: 'Mit <b>HTML</b>', error: /reinen Text/ },
      { text: 'Welpen abzugeben', error: /Züchter/ },
      { text: 'x'.repeat(301), error: /höchstens 300 Zeichen/ },
      { datum: '2999-01-01', error: /Zukunft/ },
      { datum: '2026-13-01', error: /gültiges Datum/ }
    ]
    for (const { error, ...overrides } of cases) {
      const before = snapshotAll()
      areaSeed.EINBLICKE.push({ partnerSlug: WUSCHELGLUECK, datum: '2026-09-01', text: 'Gültig', foto: 'luna.jpg', ...overrides })
      try {
        assert.throws(() => replaceDemoPack(db, uploadDir), error)
      } finally {
        areaSeed.EINBLICKE.pop()
      }
      assert.deepEqual(snapshotAll(), before, `${error}: nichts halb ersetzt`)
    }
  })

  await t.test('Rollback: ein Einblick für einen fremden oder unbekannten Partner scheitert laut', () => {
    for (const partnerSlug of ['hundesalon-echt', 'gibt-es-nicht']) {
      const before = snapshotAll()
      areaSeed.EINBLICKE.push({ partnerSlug, datum: '2026-09-01', text: 'Gültig', foto: 'luna.jpg' })
      try {
        assert.throws(() => replaceDemoPack(db, uploadDir), /Demo-Partner/)
      } finally {
        areaSeed.EINBLICKE.pop()
      }
      assert.deepEqual(snapshotAll(), before, partnerSlug)
    }
  })

  await t.test('Rollback nach schon kopierten Einblick-Fotos: alle neuen Dateien wieder weg, alte Demo bleibt vollständig', () => {
    const before = snapshotAll()
    // Der letzte Einblick verweist auf ein fehlendes Seed-Bild: er scheitert erst, nachdem die Fotos aller
    // Einblicke davor schon kopiert sind (die Einblicke entstehen der Reihe nach).
    const originalCopy = fs.copyFileSync
    const copiedTargets = []
    fs.copyFileSync = (source, target, ...rest) => {
      const result = originalCopy(source, target, ...rest)
      copiedTargets.push(target)
      return result
    }
    areaSeed.EINBLICKE.push({ partnerSlug: SONNENHANG, datum: '2026-09-01', text: 'Foto fehlt', foto: 'gibt-es-nicht.jpg' })
    try {
      assert.throws(() => replaceDemoPack(db, uploadDir), /ENOENT[\s\S]*gibt-es-nicht\.jpg/)
    } finally {
      areaSeed.EINBLICKE.pop()
      fs.copyFileSync = originalCopy
    }
    const einblickCount = Object.values(EXPECTED_TEXTS).flat().length
    assert.ok(copiedTargets.length > einblickCount, `${copiedTargets.length} Dateien vor dem Fehler kopiert`)
    for (const target of copiedTargets) assert.equal(fs.existsSync(target), false, `${path.basename(target)} wieder entfernt`)
    assert.deepEqual(snapshotAll(), before, 'Datenbank und Upload-Ordner wie vorher')
    assert.deepEqual(uploadFiles(), referencedUploadFiles())
  })
})
