const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, createHousehold, getCookie } = require('./helpers')

// Phase P2 Task 8: Beiträge der Partner (/api/partner-area/posts) - immer "Anzeige", sichtbar erst nach
// Freigabe durch den Admin (/api/admin/promotions/:id/freigeben|ablehnen). Sichtbarkeit in "Entdecken",
// auf dem Portal (/api/public/partners/:slug/posts), in /r/promotion/:id und in der Kundensicht.
// t.test() bleibt auf einer Ebene. POST /api/discover und /preview/discover teilen sich ein Limit von 30
// Anfragen je IP - dieser Test bleibt deutlich darunter.
const ADMIN_TEST_PASSWORD = 'admin-test-partner-posts-1'
const dataDir = useTempDataDir('partner-posts', { LOGIN_RATE_LIMIT: '300', CODE_RATE_LIMIT: '300' })

const PORTAL_TEXT = 'Kleine Gruppen, viel Geduld und jede Menge Leckerli – so arbeiten wir mit euren Hunden.'
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]) // Signatur + IEND
const JPG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 1, 2, 0xff, 0xd9]) // SOI, APP0, EOI
const WEBP_BYTES = Buffer.concat([Buffer.from('RIFF'), Buffer.from([4, 0, 0, 0]), Buffer.from('WEBPVP8 ')])
const SVG_BYTES = Buffer.from('<svg onload="alert(1)"></svg>')
const IMAGE_TYPE_MESSAGE = 'Bitte als JPG oder PNG hochladen.'
const LIMIT_MESSAGE = 'Höchstens 20 Beiträge – bitte ältere löschen.'
const BEREICH_MESSAGE = 'Dieser Bereich passt nicht zu eurem Partner-Typ.'
const WELPENKURS_URL = 'https://example.org/welpenkurs'

function samplePost(overrides = {}) {
  return { titel: 'Welpenkurs ab Oktober', text: 'Sechs Termine in kleiner Gruppe.', bereich: 'hundeschule', url: WELPENKURS_URL, ...overrides }
}

test('Beiträge der Partner: immer Anzeige, sichtbar erst nach Freigabe durch den Admin', async (t) => {
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

  const household = await createHousehold(base, 'Familie Anzeigenleser')
  const discover = async () => {
    const res = await post('/api/discover', {}, household.cookie)
    assert.equal(res.status, 200)
    return res.data
  }
  const publicPosts = (slug) => get(`/api/public/partners/${slug}/posts`)
  const redirect = (id) => fetch(`${base}/r/promotion/${id}`, { redirect: 'manual' })
  const approve = (id, cookie = adminCookie) => post(`/api/admin/promotions/${id}/freigeben`, undefined, cookie)
  const reject = (id, grund, cookie = adminCookie) => post(`/api/admin/promotions/${id}/ablehnen`, grund === undefined ? {} : { grund }, cookie)
  const createPost = (cookie, body) => post('/api/partner-area/posts', body, cookie)
  const ownPosts = async (cookie) => (await get('/api/partner-area/posts', cookie)).data
  // Phase V1: Anzeigen eines Partners stehen auf seiner Karte (anzeigen), nur die übrigen als eigene Karten.
  const shownPromotions = (cards) => cards.flatMap((card) => (card.kind === 'promotion' ? [card] : card.anzeigen || []))
  const promotionIds = (cards) => shownPromotions(cards).map((card) => card.id)
  const promotionRow = (id) => db.prepare('SELECT * FROM promotions WHERE id = ?').get(id)

  let counter = 0
  async function createPartnerArea(overrides = {}) {
    counter += 1
    const input = { name: `Beitrag Partner ${counter}`, slug: `beitrag-partner-${counter}`, typ: 'hundeschule', plz: '10115', portalText: PORTAL_TEXT, status: 'aktiv', ...overrides }
    const partner = await post('/api/admin/partners', input, adminCookie)
    assert.equal(partner.status, 201)
    const area = await post(`/api/admin/partners/${partner.data.id}/area`, undefined, adminCookie)
    assert.equal(area.status, 201)
    const login = await post('/api/login', { secret: area.data.key })
    return { partner: partner.data, cookie: getCookie(login.res) }
  }

  async function uploadImage(cookie, id, buffer, filename, mimeType) {
    const form = new FormData()
    form.append('file', new Blob([buffer], { type: mimeType }), filename)
    const res = await fetch(`${base}/api/partner-area/posts/${id}/image`, { method: 'POST', headers: cookie ? { Cookie: cookie } : {}, body: form })
    const text = await res.text()
    return { status: res.status, data: text ? JSON.parse(text) : null }
  }

  const school = await createPartnerArea({ typ: 'hundeschule' })
  let firstPostId
  let adminPromotionId

  await t.test('nur im Partner-Bereich: ohne Sitzung 401, aus einem Zuhause 403', async () => {
    assert.equal((await get('/api/partner-area/posts')).status, 401)
    assert.equal((await get('/api/partner-area/posts', household.cookie)).status, 403)
    assert.equal((await createPost(household.cookie, samplePost())).status, 403)
  })

  await t.test('Anlegen: eingereicht, immer "Anzeige" - nicht in Entdecken, auf dem Portal oder über /r', async () => {
    const other = await createPartnerArea({ typ: 'futter' })
    const created = await createPost(
      school.cookie,
      samplePost({
        kennzeichnung: 'Empfehlung',
        empfohlenVon: 'Tierarztpraxis Nebenan',
        partnerId: other.partner.id,
        freigabe: 'freigegeben',
        erstelltVonPartner: false,
        isDemo: true,
        sort: -5
      })
    )
    assert.equal(created.status, 201)
    assert.equal(created.data.freigabe, 'eingereicht')
    assert.equal(created.data.kennzeichnung, 'Anzeige')
    assert.equal(created.data.ablehnungsgrund, null)
    assert.equal(created.data.aktiv, true)
    assert.equal(created.data.bildUrl, null)
    assert.equal(created.data.clicks7, 0)
    assert.equal(created.data.clicksTotal, 0)
    assert.equal(created.data.titel, 'Welpenkurs ab Oktober')
    assert.equal(created.data.url, WELPENKURS_URL)
    firstPostId = created.data.id

    const row = promotionRow(firstPostId)
    assert.equal(row.partner_id, school.partner.id)
    assert.equal(row.erstellt_von_partner, 1)
    assert.equal(row.empfohlen_von, null)
    assert.equal(row.kennzeichnung, 'Anzeige')
    assert.equal(row.is_demo, 0)
    assert.equal(row.sort, 0)

    assert.deepEqual((await ownPosts(school.cookie)).map((p) => p.id), [firstPostId])
    assert.ok(!promotionIds((await discover()).hundeschulen).includes(firstPostId))
    const portal = await publicPosts(school.partner.slug)
    assert.equal(portal.status, 200)
    assert.deepEqual(portal.data, [])
    assert.equal((await redirect(firstPostId)).status, 404)
  })

  await t.test('Admin: Filter ?freigabe=eingereicht, Freigabe macht den Beitrag in Entdecken, Portal und /r sichtbar', async () => {
    const adminMade = await post('/api/admin/promotions', { bereich: 'futter', kennzeichnung: 'Anzeige', titel: 'Futterhof Deichland' }, adminCookie)
    assert.equal(adminMade.status, 201)
    assert.equal(adminMade.data.freigabe, 'freigegeben')
    assert.equal(adminMade.data.erstelltVonPartner, false)
    assert.equal(adminMade.data.partnerName, null)
    adminPromotionId = adminMade.data.id

    const pending = await get('/api/admin/promotions?freigabe=eingereicht', adminCookie)
    assert.equal(pending.status, 200)
    assert.ok(pending.data.length > 0)
    assert.ok(pending.data.every((p) => p.freigabe === 'eingereicht'))
    assert.ok(!pending.data.some((p) => p.id === adminPromotionId))
    const entry = pending.data.find((p) => p.id === firstPostId)
    assert.equal(entry.erstelltVonPartner, true)
    assert.equal(entry.partnerName, school.partner.name)
    assert.equal(entry.ablehnungsgrund, null)
    assert.equal(entry.clicksTotal, 0)

    const all = await get('/api/admin/promotions', adminCookie)
    assert.ok(all.data.some((p) => p.id === adminPromotionId))
    assert.ok(all.data.some((p) => p.id === firstPostId))
    assert.equal((await get('/api/admin/promotions?freigabe=irgendwas', adminCookie)).status, 400)

    const approved = await approve(firstPostId)
    assert.equal(approved.status, 200)
    assert.equal(approved.data.freigabe, 'freigegeben')
    assert.equal(approved.data.ablehnungsgrund, null)
    assert.equal((await approve(999999)).status, 404)
    assert.equal((await approve(firstPostId, household.cookie)).status, 401)
    assert.equal((await reject(firstPostId, 'Kein Admin', household.cookie)).status, 401)

    const card = shownPromotions((await discover()).hundeschulen).find((c) => c.id === firstPostId)
    assert.ok(card, 'freigegebener Beitrag steht in Entdecken')
    assert.equal(card.kennzeichnung, 'Anzeige')
    assert.equal(card.clickUrl, `/r/promotion/${firstPostId}`)

    const portal = await publicPosts(school.partner.slug)
    assert.deepEqual(portal.data.map((p) => p.id), [firstPostId])
    assert.equal(portal.data[0].kennzeichnung, 'Anzeige')
    assert.equal(portal.data[0].clickUrl, `/r/promotion/${firstPostId}`)

    const click = await redirect(firstPostId)
    assert.equal(click.status, 302)
    assert.equal(click.headers.get('location'), WELPENKURS_URL)
  })

  await t.test('Partner ändert: wieder eingereicht und überall unsichtbar', async () => {
    const updated = await put(`/api/partner-area/posts/${firstPostId}`, samplePost({ titel: 'Welpenkurs ab November' }), school.cookie)
    assert.equal(updated.status, 200)
    assert.equal(updated.data.titel, 'Welpenkurs ab November')
    assert.equal(updated.data.freigabe, 'eingereicht')

    assert.ok(!promotionIds((await discover()).hundeschulen).includes(firstPostId))
    assert.deepEqual((await publicPosts(school.partner.slug)).data, [])
    assert.equal((await redirect(firstPostId)).status, 404)
  })

  await t.test('Ablehnen braucht einen Grund (3 bis 300 Zeichen, ohne Steuerzeichen), der Partner sieht ihn', async () => {
    assert.equal((await reject(firstPostId)).status, 400)
    assert.equal((await reject(firstPostId, ' a\u0000b ')).status, 400)
    assert.equal((await reject(firstPostId, 'x'.repeat(301))).status, 400)
    assert.equal((await reject(firstPostId, 42)).status, 400)
    assert.equal(promotionRow(firstPostId).freigabe, 'eingereicht')
    assert.equal((await reject(999999, 'Gibt es nicht')).status, 404)

    const rejected = await reject(firstPostId, 'Bitte ohne\u0007 Preisangabe im Titel‮')
    assert.equal(rejected.status, 200)
    assert.equal(rejected.data.freigabe, 'abgelehnt')
    assert.equal(rejected.data.ablehnungsgrund, 'Bitte ohne Preisangabe im Titel')

    const own = (await ownPosts(school.cookie)).find((p) => p.id === firstPostId)
    assert.equal(own.freigabe, 'abgelehnt')
    assert.equal(own.ablehnungsgrund, 'Bitte ohne Preisangabe im Titel')
    assert.equal((await redirect(firstPostId)).status, 404)

    // Ändern reicht erneut ein und nimmt den Grund weg
    const resubmitted = await put(`/api/partner-area/posts/${firstPostId}`, samplePost({ titel: 'Welpenkurs ab November, ohne Preis' }), school.cookie)
    assert.equal(resubmitted.data.freigabe, 'eingereicht')
    assert.equal(resubmitted.data.ablehnungsgrund, null)

    // Freigeben räumt einen Grund ebenfalls weg
    await reject(firstPostId, 'Noch nicht ganz')
    const approved = await approve(firstPostId)
    assert.equal(approved.data.freigabe, 'freigegeben')
    assert.equal(approved.data.ablehnungsgrund, null)
  })

  await t.test('Bereich muss zum Partner-Typ passen, sonst 400', async () => {
    for (const bereich of ['futter', 'begleiter', 'unterstuetzen', 'salon', 'unbekannt', undefined]) {
      const res = await createPost(school.cookie, samplePost({ bereich }))
      assert.equal(res.status, 400, String(bereich))
      assert.equal(res.data.error, BEREICH_MESSAGE)
    }
    const wrongUpdate = await put(`/api/partner-area/posts/${firstPostId}`, samplePost({ bereich: 'futter' }), school.cookie)
    assert.equal(wrongUpdate.status, 400)
    assert.equal(wrongUpdate.data.error, BEREICH_MESSAGE)
    assert.equal(promotionRow(firstPostId).bereich, 'hundeschule')

    const cases = [
      { typ: 'hundesalon', ok: ['salon'], nein: ['hundeschule', 'futter'] },
      { typ: 'betreuung', ok: ['salon'], nein: ['begleiter'] },
      { typ: 'tierheim', ok: ['begleiter', 'unterstuetzen'], nein: ['futter', 'salon'] },
      { typ: 'vermittlung', ok: ['begleiter', 'unterstuetzen'], nein: ['hundeschule'] },
      { typ: 'futter', ok: ['futter'], nein: ['unterstuetzen'] },
      { typ: 'sonstige', ok: ['unterstuetzen', 'futter'], nein: ['begleiter', 'salon'] }
    ]
    for (const { typ, ok, nein } of cases) {
      const { cookie } = await createPartnerArea({ typ })
      for (const bereich of ok) {
        const res = await createPost(cookie, samplePost({ bereich, titel: `${typ} im Bereich ${bereich}` }))
        assert.equal(res.status, 201, `${typ}/${bereich}`)
        assert.equal(res.data.bereich, bereich)
      }
      for (const bereich of nein) {
        const res = await createPost(cookie, samplePost({ bereich }))
        assert.equal(res.status, 400, `${typ}/${bereich}`)
        assert.equal(res.data.error, BEREICH_MESSAGE)
      }
    }
  })

  await t.test('dieselbe Prüfung wie beim Admin: Züchter-Text, Link, Datum, Titel, Tierart -> 400', async () => {
    const invalid = [
      samplePost({ titel: 'Hundezucht Musterhof' }),
      samplePost({ text: 'Welpen abzugeben, bar zahlbar' }),
      samplePost({ url: 'javascript:alert(1)' }),
      samplePost({ start: '2026-06-01', ende: '2026-05-01' }),
      samplePost({ start: 'nicht-iso' }),
      samplePost({ titel: '' }),
      samplePost({ tierart: 'pferd' }),
      // wie Portal-Text und Einblicke: Partner-Texte sind reiner Text
      samplePost({ titel: 'Kurs <b>jetzt</b>' }),
      samplePost({ text: '<img src=x onerror=alert(1)>' })
    ]
    for (const body of invalid) assert.equal((await createPost(school.cookie, body)).status, 400, JSON.stringify(body))
    assert.equal((await put(`/api/partner-area/posts/${firstPostId}`, samplePost({ text: 'Deckrüde gesucht' }), school.cookie)).status, 400)
    assert.equal(promotionRow(firstPostId).freigabe, 'freigegeben', 'eine abgelehnte Änderung lässt die Freigabe stehen')

    const ok = await createPost(school.cookie, samplePost({ titel: 'Junghundekurs', url: 'www.example.org', tierart: 'hund', start: '2020-01-01', ende: '2099-12-31' }))
    assert.equal(ok.status, 201)
    assert.equal(ok.data.url, 'https://www.example.org/')
    assert.equal(ok.data.tierart, 'hund')
    assert.equal(ok.data.start, '2020-01-01')
    assert.equal(ok.data.ende, '2099-12-31')
  })

  await t.test('fremde Beiträge und Admin-Empfehlungen zum Partner: 404 bei PUT, DELETE und Bild', async () => {
    const stranger = await createPartnerArea({ typ: 'hundeschule' })
    assert.equal((await put(`/api/partner-area/posts/${firstPostId}`, samplePost(), stranger.cookie)).status, 404)
    assert.equal((await del(`/api/partner-area/posts/${firstPostId}`, stranger.cookie)).status, 404)
    assert.equal((await uploadImage(stranger.cookie, firstPostId, PNG_BYTES, 'b.png', 'image/png')).status, 404)
    assert.ok(!(await ownPosts(stranger.cookie)).some((p) => p.id === firstPostId))

    const linked = await post('/api/admin/promotions', { bereich: 'hundeschule', kennzeichnung: 'Partner', titel: 'Hinweis der Redaktion', partnerId: school.partner.id }, adminCookie)
    assert.equal(linked.status, 201)
    assert.equal((await put(`/api/partner-area/posts/${linked.data.id}`, samplePost(), school.cookie)).status, 404)
    assert.equal((await del(`/api/partner-area/posts/${linked.data.id}`, school.cookie)).status, 404)
    assert.equal((await uploadImage(school.cookie, linked.data.id, PNG_BYTES, 'b.png', 'image/png')).status, 404)
    assert.ok(!(await ownPosts(school.cookie)).some((p) => p.id === linked.data.id))
    assert.equal((await put('/api/partner-area/posts/abc', samplePost(), school.cookie)).status, 404)

    assert.equal(promotionRow(firstPostId).titel, 'Welpenkurs ab November, ohne Preis')
    assert.equal(promotionRow(linked.data.id).kennzeichnung, 'Partner')
  })

  await t.test('Admin ändert: sofort freigegeben; ein Partner-Beitrag bleibt Anzeige beim selben Partner', async () => {
    const pending = await createPost(school.cookie, samplePost({ titel: 'Agility für Einsteiger' }))
    assert.equal(pending.data.freigabe, 'eingereicht')
    const stranger = await createPartnerArea({ typ: 'hundeschule' })

    const edited = await put(
      `/api/admin/promotions/${pending.data.id}`,
      { bereich: 'hundeschule', kennzeichnung: 'Empfehlung', empfohlenVon: 'Redaktion', titel: 'Agility für Einsteiger (geprüft)', partnerId: stranger.partner.id },
      adminCookie
    )
    assert.equal(edited.status, 200)
    assert.equal(edited.data.freigabe, 'freigegeben')
    assert.equal(edited.data.kennzeichnung, 'Anzeige')
    assert.equal(edited.data.empfohlen_von, null)
    assert.equal(edited.data.partner_id, school.partner.id)
    assert.equal(edited.data.erstelltVonPartner, true)
    assert.equal(edited.data.titel, 'Agility für Einsteiger (geprüft)')

    await reject(adminPromotionId, 'Zeitraum fehlt noch')
    const adminEdited = await put(`/api/admin/promotions/${adminPromotionId}`, { bereich: 'futter', kennzeichnung: 'Anzeige', titel: 'Futterhof Deichland – Herbst' }, adminCookie)
    assert.equal(adminEdited.status, 200)
    assert.equal(adminEdited.data.freigabe, 'freigegeben')
    assert.equal(adminEdited.data.ablehnungsgrund, null)
    assert.equal(adminEdited.data.erstelltVonPartner, false)
  })

  let bildUrl
  await t.test('Bild: dieselben Regeln wie beim Admin, ein neues Bild reicht wieder ein', async () => {
    assert.equal(promotionRow(firstPostId).freigabe, 'freigegeben')
    const png = await uploadImage(school.cookie, firstPostId, PNG_BYTES, 'bild.png', 'image/png')
    assert.equal(png.status, 201)
    assert.match(png.data.bildUrl, /^\/partner-media\/[0-9a-f-]{36}\.png$/)
    assert.equal(png.data.freigabe, 'eingereicht')
    bildUrl = png.data.bildUrl
    assert.equal((await fetch(`${base}${bildUrl}`)).status, 200)

    const own = (await ownPosts(school.cookie)).find((p) => p.id === firstPostId)
    assert.equal(own.bildUrl, bildUrl)
    assert.equal(own.freigabe, 'eingereicht')

    assert.equal((await uploadImage(school.cookie, 999999, PNG_BYTES, 'bild.png', 'image/png')).status, 404)
    assert.equal(promotionRow(firstPostId).bild_file, path.basename(bildUrl))
    await approve(firstPostId)
  })

  await t.test('Bild: nur JPG oder PNG (nach Magic Bytes wie bei Einblicken), sonst 400 ohne Datei-Rest', async () => {
    const mediaFiles = () => fs.readdirSync(config.partnerMediaDir).sort()
    const before = mediaFiles()
    const rejected = [
      [WEBP_BYTES, 'bild.webp', 'image/webp'],
      [WEBP_BYTES, 'bild.png', 'image/png'],
      [WEBP_BYTES, 'bild.jpg', 'image/jpeg'],
      [PNG_BYTES, 'bild.webp', 'image/webp'],
      [SVG_BYTES, 'bild.svg', 'image/svg+xml'],
      [SVG_BYTES, 'bild.png', 'image/png']
    ]
    for (const [bytes, filename, mimeType] of rejected) {
      const res = await uploadImage(school.cookie, firstPostId, bytes, filename, mimeType)
      assert.equal(res.status, 400, `${filename} (${mimeType})`)
      assert.equal(res.data.error, IMAGE_TYPE_MESSAGE)
    }
    assert.deepEqual(mediaFiles(), before, 'keine abgelehnte Datei bleibt liegen')
    assert.equal(promotionRow(firstPostId).bild_file, path.basename(bildUrl))
    assert.equal(promotionRow(firstPostId).freigabe, 'freigegeben', 'ein abgelehntes Bild lässt die Freigabe stehen')

    const jpg = await uploadImage(school.cookie, firstPostId, JPG_BYTES, 'bild.jpg', 'image/jpeg')
    assert.equal(jpg.status, 201)
    assert.match(jpg.data.bildUrl, /^\/partner-media\/[0-9a-f-]{36}\.jpg$/)
    assert.equal((await fetch(`${base}${bildUrl}`)).status, 404, 'das vorige Bild ist weg')
    bildUrl = jpg.data.bildUrl
    await approve(firstPostId)

    // Der Admin darf weiterhin WebP hochladen
    const adminWebp = await post('/api/admin/promotions', { bereich: 'futter', kennzeichnung: 'Anzeige', titel: 'Futterhof mit WebP' }, adminCookie)
    const form = new FormData()
    form.append('file', new Blob([WEBP_BYTES], { type: 'image/webp' }), 'bild.webp')
    const res = await fetch(`${base}/api/admin/promotions/${adminWebp.data.id}/image`, { method: 'POST', headers: { Cookie: adminCookie }, body: form })
    assert.equal(res.status, 201)
    assert.match((await res.json()).bildUrl, /\.webp$/)
  })

  await t.test('Löschen entfernt Beitrag, Bild und Klicks', async () => {
    const clicksBefore = (await ownPosts(school.cookie)).find((p) => p.id === firstPostId)
    assert.equal((await redirect(firstPostId)).status, 302)
    const insertClicks = db.prepare("INSERT INTO link_clicks (target_type, target_id, tag, anzahl) VALUES (?, ?, date('now', ?), ?)")
    insertClicks.run('promotion', firstPostId, '-10 days', 2)
    insertClicks.run('promotion', adminPromotionId, '+0 days', 5)
    insertClicks.run('partner-website', firstPostId, '+0 days', 7)
    const clicksAfter = (await ownPosts(school.cookie)).find((p) => p.id === firstPostId)
    assert.equal(clicksAfter.clicks7, clicksBefore.clicks7 + 1, 'der Klick über /r zählt heute')
    assert.equal(clicksAfter.clicksTotal, clicksBefore.clicksTotal + 3)

    const file = path.join(config.partnerMediaDir, path.basename(bildUrl))
    assert.ok(fs.existsSync(file))
    assert.equal((await del(`/api/partner-area/posts/${firstPostId}`, school.cookie)).status, 204)

    assert.equal(promotionRow(firstPostId), undefined)
    assert.equal(fs.existsSync(file), false)
    const clicksOf = (type, id) => db.prepare('SELECT COUNT(*) AS n FROM link_clicks WHERE target_type = ? AND target_id = ?').get(type, id).n
    assert.equal(clicksOf('promotion', firstPostId), 0)
    assert.equal(clicksOf('promotion', adminPromotionId), 1, 'Klicks anderer Empfehlungen bleiben')
    assert.equal(clicksOf('partner-website', firstPostId), 1, 'andere Zieltypen mit derselben Id bleiben')
    assert.ok(!(await ownPosts(school.cookie)).some((p) => p.id === firstPostId))
    assert.equal((await del(`/api/partner-area/posts/${firstPostId}`, school.cookie)).status, 404)
  })

  let busy
  await t.test('höchstens 20 Beiträge je Partner -> 409', async () => {
    busy = await createPartnerArea({ typ: 'futter' })
    const ids = []
    for (let i = 1; i <= 20; i += 1) {
      const res = await createPost(busy.cookie, samplePost({ bereich: 'futter', titel: `Futterprobe ${i}` }))
      assert.equal(res.status, 201)
      ids.push(res.data.id)
    }
    const full = await createPost(busy.cookie, samplePost({ bereich: 'futter', titel: 'Eine zu viel' }))
    assert.equal(full.status, 409)
    assert.equal(full.data.error, LIMIT_MESSAGE)

    // Eine Admin-Empfehlung zum Partner zählt nicht mit - nach dem Löschen eines eigenen passt wieder einer
    assert.equal((await post('/api/admin/promotions', { bereich: 'futter', kennzeichnung: 'Partner', titel: 'Redaktion', partnerId: busy.partner.id }, adminCookie)).status, 201)
    assert.equal((await del(`/api/partner-area/posts/${ids[0]}`, busy.cookie)).status, 204)
    assert.equal((await createPost(busy.cookie, samplePost({ bereich: 'futter', titel: 'Futterprobe 21' }))).status, 201)
    assert.equal((await ownPosts(busy.cookie)).length, 20)
  })

  await t.test('Portal-Beiträge: freigegeben, aktiv, im Zeitraum, höchstens 10, nach sort und neueste zuerst; nur sichtbare Partner', async () => {
    const busyPosts = db.prepare('SELECT id FROM promotions WHERE partner_id = ? AND erstellt_von_partner = 1 ORDER BY id').all(busy.partner.id).map((r) => r.id)
    db.prepare("UPDATE promotions SET freigabe = 'freigegeben' WHERE partner_id = ?").run(busy.partner.id)
    const [oldest, inactive, future, past, rejected] = busyPosts
    db.prepare('UPDATE promotions SET sort = -1 WHERE id = ?').run(oldest)
    db.prepare('UPDATE promotions SET aktiv = 0 WHERE id = ?').run(inactive)
    db.prepare("UPDATE promotions SET start = date('now', '+2 days') WHERE id = ?").run(future)
    db.prepare("UPDATE promotions SET ende = date('now', '-2 days') WHERE id = ?").run(past)
    db.prepare("UPDATE promotions SET freigabe = 'abgelehnt' WHERE id = ?").run(rejected)

    const res = await publicPosts(busy.partner.slug)
    assert.equal(res.status, 200)
    const hidden = new Set([oldest, inactive, future, past, rejected])
    const redaktion = db.prepare("SELECT id FROM promotions WHERE partner_id = ? AND erstellt_von_partner = 0").get(busy.partner.id).id
    const newestFirst = [...busyPosts.filter((id) => !hidden.has(id)), redaktion].sort((a, b) => b - a)
    assert.deepEqual(res.data.map((p) => p.id), [oldest, ...newestFirst].slice(0, 10))
    for (const card of res.data) {
      assert.equal(card.kind, 'promotion')
      assert.ok(card.clickUrl === null || card.clickUrl === `/r/promotion/${card.id}`)
      assert.ok(['Anzeige', 'Partner'].includes(card.kennzeichnung))
    }
    assert.equal(res.data.find((p) => p.id === oldest).kennzeichnung, 'Anzeige')
    assert.equal(res.data.find((p) => p.id === oldest).clickUrl, `/r/promotion/${oldest}`)

    assert.equal((await publicPosts('gibt-es-nicht')).status, 404)
    assert.equal((await post('/api/partner-area/profile/publish', { aktiv: false }, busy.cookie)).status, 200)
    assert.equal((await publicPosts(busy.partner.slug)).status, 404)
    assert.equal((await redirect(oldest)).status, 404)
    assert.equal((await post('/api/partner-area/profile/publish', { aktiv: true }, busy.cookie)).status, 200)
    assert.equal((await publicPosts(busy.partner.slug)).status, 200)
  })

  await t.test('Kundensicht: eigene eingereichte Beiträge mit vorschau und ohne clickUrl, abgelehnte nicht', async () => {
    const viewer = await createPartnerArea({ typ: 'tierheim' })
    const pending = (await createPost(viewer.cookie, samplePost({ bereich: 'begleiter', titel: 'Patenschaft für Senioren', url: 'https://example.org/pate' }))).data
    const approved = (await createPost(viewer.cookie, samplePost({ bereich: 'unterstuetzen', titel: 'Futterspende fürs Tierheim', url: 'https://example.org/spende' }))).data
    const rejected = (await createPost(viewer.cookie, samplePost({ bereich: 'begleiter', titel: 'Abgelehnter Beitrag' }))).data
    const paused = (await createPost(viewer.cookie, samplePost({ bereich: 'begleiter', titel: 'Pausierter Beitrag', aktiv: false }))).data
    await approve(approved.id)
    await reject(rejected.id, 'Passt so nicht')
    const foreignPending = (await createPost(school.cookie, samplePost({ titel: 'Fremder eingereichter Beitrag' }))).data

    const preview = await post('/api/partner-area/preview/discover', {}, viewer.cookie)
    assert.equal(preview.status, 200)
    // Phase V1: Begleiter-Beiträge stehen auf der eigenen Tierheim-Karte, Unterstützen-Beiträge als eigene Karten.
    assert.equal(preview.data.begleiter.partner[0].id, viewer.partner.id)
    const begleiter = preview.data.begleiter.partner[0].anzeigen
    assert.equal(begleiter[0].id, pending.id, 'eigener Beitrag auf der eigenen Karte')
    assert.equal(begleiter[0].vorschau, true)
    assert.equal(begleiter[0].freigabe, 'eingereicht')
    assert.equal(begleiter[0].clickUrl, null)
    assert.equal(begleiter[0].kennzeichnung, 'Anzeige')
    assert.equal(begleiter[0].url, 'https://example.org/pate')
    const approvedCard = preview.data.unterstuetzen.promotions.find((c) => c.id === approved.id)
    assert.equal(approvedCard.vorschau, true)
    assert.equal(approvedCard.freigabe, 'freigegeben')
    assert.equal(approvedCard.clickUrl, `/r/promotion/${approved.id}`)

    const shownIds = [
      ...promotionIds(preview.data.hundeschulen),
      ...promotionIds(preview.data.begleiter.partner),
      ...preview.data.begleiter.promotions.map((c) => c.id),
      ...preview.data.futter.map((c) => c.id),
      ...preview.data.unterstuetzen.promotions.map((c) => c.id)
    ]
    for (const id of [rejected.id, paused.id, foreignPending.id]) assert.ok(!shownIds.includes(id), `${id} fehlt in der Vorschau`)
    assert.equal(shownIds.filter((id) => id === approved.id).length, 1, 'kein Beitrag doppelt')

    // Hundeschule: eigene Karte zuerst, die eigenen Beiträge darauf
    const schoolPreview = await post('/api/partner-area/preview/discover', {}, school.cookie)
    assert.equal(schoolPreview.data.hundeschulen[0].kind, 'partner')
    assert.equal(schoolPreview.data.hundeschulen[0].vorschau, true)
    const schoolPostIds = schoolPreview.data.hundeschulen[0].anzeigen.map((c) => c.id)
    assert.ok(schoolPostIds.includes(foreignPending.id))
    assert.equal(schoolPreview.data.hundeschulen[0].anzeigen.find((c) => c.id === foreignPending.id).clickUrl, null)

    const portal = await get('/api/partner-area/preview/portal', viewer.cookie)
    assert.equal(portal.status, 200)
    assert.deepEqual(portal.data.posts.map((p) => p.id).sort((a, b) => a - b), [pending.id, approved.id].sort((a, b) => a - b))
    assert.equal(portal.data.posts.find((p) => p.id === pending.id).freigabe, 'eingereicht')
    assert.equal(portal.data.posts.find((p) => p.id === pending.id).clickUrl, null)
    assert.equal(portal.data.posts.find((p) => p.id === approved.id).freigabe, 'freigegeben')

    assert.deepEqual((await publicPosts(viewer.partner.slug)).data.map((p) => p.id), [approved.id])
  })

  await t.test('Demo: Partner-Sitzung liest, schreibt aber nicht; Demo-Empfehlungen bleiben freigegeben', async () => {
    const { replaceDemoPack } = require('../lib/demoPack')
    replaceDemoPack(db, config.uploadDir)
    // Die Demo-Empfehlungen des Admins sind freigegeben; die Beiträge der Demo-Partner (Task 9) tragen ihre
    // Seed-Freigabe (test/demoPartnerContent.test.js).
    const demoPromotions = db.prepare('SELECT freigabe FROM promotions WHERE is_demo = 1 AND erstellt_von_partner = 0').all()
    assert.ok(demoPromotions.length > 0)
    assert.ok(demoPromotions.every((row) => row.freigabe === 'freigegeben'))

    const login = await post('/api/demo', { as: 'partner' })
    assert.equal(login.status, 200)
    const cookie = getCookie(login.res)
    const list = await get('/api/partner-area/posts', cookie)
    assert.equal(list.status, 200)
    assert.ok(Array.isArray(list.data))

    const someId = db.prepare('SELECT id FROM promotions ORDER BY id LIMIT 1').get().id
    assert.equal((await createPost(cookie, samplePost())).status, 403)
    assert.equal((await put(`/api/partner-area/posts/${someId}`, samplePost(), cookie)).status, 403)
    assert.equal((await del(`/api/partner-area/posts/${someId}`, cookie)).status, 403)
    assert.equal((await uploadImage(cookie, someId, PNG_BYTES, 'b.png', 'image/png')).status, 403)
  })
})
