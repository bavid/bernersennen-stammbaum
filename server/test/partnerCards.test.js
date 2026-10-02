const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, createHousehold, getCookie } = require('./helpers')

// Phase V1: "Entdecken" zeigt je Partner EINE Karte - Kopf, darunter bis zu drei Anzeigen (freigegebene Beiträge
// und vom Admin verknüpfte Empfehlungen, in der Reihenfolge des Partners) und die angepinnten oder neuesten
// Einblicke. Dazu die Partner-Endpunkte für Reihenfolge, "in Entdecken zeigen" und Anpinnen sowie das Anpinnen
// durch den Admin. t.test() bleibt auf einer Ebene; POST /api/discover und /preview/discover teilen sich 30
// Anfragen je IP - dieser Test bleibt darunter.
const ADMIN_TEST_PASSWORD = 'admin-test-partner-cards-1'
const dataDir = useTempDataDir('partner-cards', { LOGIN_RATE_LIMIT: '300', CODE_RATE_LIMIT: '300' })

const PORTAL_TEXT = 'Kleine Gruppen, viel Geduld und jede Menge Leckerli – so arbeiten wir mit euren Hunden.'
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xd9])
const HAMBURG = { lat: 53.5511, lon: 9.9937 }

test('Partner-Karten in Entdecken: Anzeigen, Reihenfolge, Einblicke und Anpinnen', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')

  const adminLogin = await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: ADMIN_TEST_PASSWORD } })
  const adminCookie = getCookie(adminLogin.res)
  const get = (urlPath, cookie) => call(base, urlPath, { cookie })
  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const put = (urlPath, body, cookie) => call(base, urlPath, { method: 'PUT', body, cookie })
  const del = (urlPath, cookie) => call(base, urlPath, { method: 'DELETE', cookie })

  const household = await createHousehold(base, 'Familie Kartenleser')
  const discover = async (body = {}) => {
    const res = await post('/api/discover', body, household.cookie)
    assert.equal(res.status, 200)
    return res.data
  }
  const cardOf = (cards, partnerId) => cards.find((card) => card.kind === 'partner' && card.id === partnerId)
  const titles = (items) => items.map((item) => item.titel)
  const sectionPromotionIds = (cards) => cards.filter((card) => card.kind === 'promotion').map((card) => card.id)
  const approve = (id) => post(`/api/admin/promotions/${id}/freigeben`, undefined, adminCookie)

  let counter = 0
  async function createPartnerArea(overrides = {}) {
    counter += 1
    const input = { name: `Karten Partner ${counter}`, slug: `karten-partner-${counter}`, typ: 'hundeschule', plz: '10115', portalText: PORTAL_TEXT, status: 'aktiv', ...overrides }
    const partner = await post('/api/admin/partners', input, adminCookie)
    assert.equal(partner.status, 201)
    const area = await post(`/api/admin/partners/${partner.data.id}/area`, undefined, adminCookie)
    assert.equal(area.status, 201)
    const login = await post('/api/login', { secret: area.data.key })
    return { partner: partner.data, cookie: getCookie(login.res) }
  }

  async function createPost(cookie, titel, overrides = {}) {
    const res = await post('/api/partner-area/posts', { titel, text: `${titel} – kurz erklärt.`, bereich: 'hundeschule', url: 'https://example.org/kurs', ...overrides }, cookie)
    assert.equal(res.status, 201)
    return res.data
  }

  async function createApprovedPost(cookie, titel, overrides) {
    const created = await createPost(cookie, titel, overrides)
    assert.equal((await approve(created.id)).status, 200)
    return created
  }

  async function postEinblick(cookie, datum, text) {
    const form = new FormData()
    form.append('datum', datum)
    form.append('text', text)
    form.append('einwilligung', 'true')
    form.append('foto', new Blob([JPEG], { type: 'image/jpeg' }), 'e.jpg')
    const res = await fetch(`${base}/api/partner-area/einblicke`, { method: 'POST', headers: { Cookie: cookie }, body: form })
    assert.equal(res.status, 201)
    return res.json()
  }

  const pin = (cookie, id) => post(`/api/partner-area/einblicke/${id}/anpinnen`, undefined, cookie)
  const unpin = (cookie, id) => del(`/api/partner-area/einblicke/${id}/anpinnen`, cookie)
  const adminPin = (id, angepinnt) => post(`/api/admin/einblicke/${id}/anpinnen`, { angepinnt }, adminCookie)
  const entdecken = async (cookie) => {
    const res = await get('/api/partner-area/posts/entdecken', cookie)
    assert.equal(res.status, 200)
    return res.data
  }
  const setOrder = (cookie, ids) => put('/api/partner-area/posts/reihenfolge', { ids }, cookie)
  const setInEntdecken = (cookie, id, inEntdecken) => put(`/api/partner-area/posts/${id}/entdecken`, { inEntdecken }, cookie)

  const school = await createPartnerArea({ name: 'Hundeschule Ahorn' })
  const other = await createPartnerArea({ name: 'Hundeschule Birke' })
  const posts = {}

  await t.test('eine Karte je Partner: freigegebene Beiträge und verknüpfte Empfehlungen stehen als anzeigen darin, höchstens drei', async () => {
    posts.a = await createApprovedPost(school.cookie, 'Welpenkurs')
    posts.b = await createApprovedPost(school.cookie, 'Junghundekurs')
    posts.c = await createApprovedPost(school.cookie, 'Rückruftraining')
    posts.pending = await createPost(school.cookie, 'Noch in Prüfung')
    const linked = await post('/api/admin/promotions', { bereich: 'hundeschule', kennzeichnung: 'Partner', titel: 'Redaktion: Sommerkurs', partnerId: school.partner.id, sort: 5 }, adminCookie)
    assert.equal(linked.status, 201)
    posts.linked = linked.data
    const unlinked = await post('/api/admin/promotions', { bereich: 'hundeschule', kennzeichnung: 'Empfehlung', empfohlenVon: 'Familie auf Pfoten', titel: 'Ratgeber Hundeschule' }, adminCookie)
    posts.unlinked = unlinked.data

    const data = await discover()
    const card = cardOf(data.hundeschulen, school.partner.id)
    assert.ok(card, 'die Partner-Karte steht in hundeschulen')
    assert.equal(card.kurztext, PORTAL_TEXT, 'Kurzbeschreibung: der erste Satz des Portal-Texts')
    // Ohne eigene Reihenfolge: sort, dann neueste zuerst - die Redaktion (sort 5) fällt hinter die drei Beiträge.
    assert.deepEqual(titles(card.anzeigen), ['Rückruftraining', 'Junghundekurs', 'Welpenkurs'])
    for (const anzeige of card.anzeigen) {
      assert.equal(anzeige.kind, 'promotion')
      assert.equal(anzeige.kennzeichnung, 'Anzeige')
      assert.equal(anzeige.clickUrl, `/r/promotion/${anzeige.id}`)
    }
    assert.deepEqual(card.einblicke, [])
    assert.deepEqual(cardOf(data.hundeschulen, other.partner.id).anzeigen, [])

    // Keine dieser Anzeigen steht noch als eigene Karte im Abschnitt - nur die Empfehlung ohne Partner.
    assert.deepEqual(sectionPromotionIds(data.hundeschulen), [posts.unlinked.id])
  })

  await t.test('Partner-Bereich: GET /posts/entdecken listet die freigegebenen Anzeigen der Karte in Karten-Reihenfolge', async () => {
    const list = await entdecken(school.cookie)
    assert.equal(list.bereich, 'hundeschule')
    assert.equal(list.max, 3)
    assert.deepEqual(titles(list.anzeigen), ['Rückruftraining', 'Junghundekurs', 'Welpenkurs', 'Redaktion: Sommerkurs'])
    assert.deepEqual(list.anzeigen.map((item) => item.aufKarte), [true, true, true, false])
    const redaktion = list.anzeigen.find((item) => item.id === posts.linked.id)
    assert.equal(redaktion.vomTeam, true)
    assert.equal(redaktion.inEntdecken, true)
    assert.equal(list.anzeigen.find((item) => item.id === posts.a.id).vomTeam, false)
    assert.ok(!list.anzeigen.some((item) => item.id === posts.pending.id), 'eingereichte zählen nicht')

    const futter = await createPartnerArea({ typ: 'futter' })
    assert.deepEqual(await entdecken(futter.cookie), { bereich: null, max: 3, anzeigen: [] })
    assert.equal((await get('/api/partner-area/posts/entdecken', household.cookie)).status, 403)
  })

  await t.test('Reihenfolge: der Partner ordnet die Karte (auch die Redaktion), ohne neue Freigabe; Portal folgt', async () => {
    const eventsBefore = db.prepare('SELECT COUNT(*) AS n FROM promotion_events').get().n
    const res = await setOrder(school.cookie, [posts.linked.id, posts.a.id, posts.c.id])
    assert.equal(res.status, 200)
    assert.deepEqual(titles(res.data.anzeigen), ['Redaktion: Sommerkurs', 'Welpenkurs', 'Rückruftraining', 'Junghundekurs'])
    assert.deepEqual(res.data.anzeigen.map((item) => item.reihenfolge), [1, 2, 3, null])

    const card = cardOf((await discover()).hundeschulen, school.partner.id)
    assert.deepEqual(titles(card.anzeigen), ['Redaktion: Sommerkurs', 'Welpenkurs', 'Rückruftraining'])
    assert.equal(card.anzeigen[0].kennzeichnung, 'Partner')
    const portal = (await get(`/api/public/partners/${school.partner.slug}/posts`)).data
    assert.deepEqual(titles(portal).slice(0, 4), ['Redaktion: Sommerkurs', 'Welpenkurs', 'Rückruftraining', 'Junghundekurs'])

    const freigaben = db.prepare('SELECT freigabe FROM promotions WHERE partner_id = ?').all(school.partner.id).map((row) => row.freigabe)
    assert.equal(freigaben.filter((value) => value === 'freigegeben').length, 4, 'Reihenfolge braucht keine neue Freigabe')
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM promotion_events').get().n, eventsBefore, 'kein Eintrag im Verlauf')
  })

  await t.test('Reihenfolge: nur eigene, freigegebene Anzeigen der Karte, jede einmal - sonst 400', async () => {
    const foreign = await createApprovedPost(other.cookie, 'Fremder Kurs')
    for (const ids of [[foreign.id], [posts.pending.id], [posts.unlinked.id], [posts.a.id, posts.a.id], 'abc', [0], [-1], ['x']]) {
      const res = await setOrder(school.cookie, ids)
      assert.equal(res.status, 400, JSON.stringify(ids))
    }
    assert.equal((await put('/api/partner-area/posts/reihenfolge', {}, school.cookie)).status, 400)
    assert.equal((await setOrder(school.cookie, Array.from({ length: 51 }, (_, i) => i + 1))).status, 400)
    // Unverändert nach den Fehlversuchen
    assert.deepEqual(titles((await entdecken(school.cookie)).anzeigen).slice(0, 3), ['Redaktion: Sommerkurs', 'Welpenkurs', 'Rückruftraining'])
    // Leere Liste: zurück zur Reihenfolge nach Datum
    const reset = await setOrder(school.cookie, [])
    assert.equal(reset.status, 200)
    assert.ok(reset.data.anzeigen.every((item) => item.reihenfolge === null))
    assert.equal((await setOrder(school.cookie, [posts.linked.id, posts.a.id, posts.c.id])).status, 200)
  })

  await t.test('in Entdecken zeigen: aus = nicht auf der Karte, bleibt auf dem Portal und freigegeben', async () => {
    const res = await setInEntdecken(school.cookie, posts.linked.id, false)
    assert.equal(res.status, 200)
    assert.equal(res.data.anzeigen.find((item) => item.id === posts.linked.id).inEntdecken, false)
    assert.equal(res.data.anzeigen.find((item) => item.id === posts.linked.id).aufKarte, false)

    const card = cardOf((await discover()).hundeschulen, school.partner.id)
    assert.deepEqual(titles(card.anzeigen), ['Welpenkurs', 'Rückruftraining', 'Junghundekurs'])
    const portal = (await get(`/api/public/partners/${school.partner.slug}/posts`)).data
    assert.ok(portal.some((item) => item.id === posts.linked.id), 'auf dem Portal bleibt sie')
    assert.equal(db.prepare('SELECT freigabe FROM promotions WHERE id = ?').get(posts.linked.id).freigabe, 'freigegeben')

    for (const body of [{}, { inEntdecken: 'nein' }, { inEntdecken: 0 }]) {
      assert.equal((await put(`/api/partner-area/posts/${posts.a.id}/entdecken`, body, school.cookie)).status, 400)
    }
    assert.equal((await setInEntdecken(school.cookie, 999999, false)).status, 404)
    assert.equal((await setInEntdecken(school.cookie, posts.pending.id, false)).status, 404)
    assert.equal((await setInEntdecken(other.cookie, posts.a.id, false)).status, 404, 'fremde Anzeige')
    assert.equal((await setInEntdecken(school.cookie, posts.linked.id, true)).status, 200)
    assert.equal((await setInEntdecken(school.cookie, posts.linked.id, false)).status, 200)

    // Eine Änderung durch den Partner reicht wieder ein - die Darstellung (Reihenfolge, Schalter) bleibt.
    assert.equal((await put(`/api/partner-area/posts/${posts.a.id}`, { titel: 'Welpenkurs neu', bereich: 'hundeschule' }, school.cookie)).status, 200)
    const row = db.prepare('SELECT freigabe, partner_reihenfolge, in_entdecken FROM promotions WHERE id = ?').get(posts.a.id)
    assert.deepEqual(row, { freigabe: 'eingereicht', partner_reihenfolge: 2, in_entdecken: 1 })
    assert.equal((await approve(posts.a.id)).status, 200)
    assert.deepEqual(titles(cardOf((await discover()).hundeschulen, school.partner.id).anzeigen), ['Welpenkurs neu', 'Rückruftraining', 'Junghundekurs'])
  })

  const einblicke = {}
  await t.test('Einblicke auf der Karte: ohne Anpinnen die neuesten drei, mit Anpinnen nur die angepinnten', async () => {
    einblicke.e1 = await postEinblick(school.cookie, '2026-07-01', 'Erster')
    einblicke.e2 = await postEinblick(school.cookie, '2026-08-01', 'Zweiter')
    einblicke.e3 = await postEinblick(school.cookie, '2026-09-01', 'Dritter')
    einblicke.e4 = await postEinblick(school.cookie, '2026-09-20', 'Vierter')
    einblicke.e5 = await postEinblick(school.cookie, '2026-09-21', 'Fünfter')

    let card = cardOf((await discover()).hundeschulen, school.partner.id)
    assert.deepEqual(card.einblicke.map((e) => e.text), ['Fünfter', 'Vierter', 'Dritter'])
    assert.deepEqual(Object.keys(card.einblicke[0]).sort(), ['datum', 'fotoUrl', 'id', 'text'])
    assert.match(card.einblicke[0].fotoUrl, /^\/public-media\//)

    const pinned = await pin(school.cookie, einblicke.e1.id)
    assert.equal(pinned.status, 200)
    assert.equal(pinned.data.angepinntVon, 'partner')
    assert.equal((await pin(school.cookie, einblicke.e1.id)).status, 200, 'doppelt anpinnen ändert nichts')
    card = cardOf((await discover()).hundeschulen, school.partner.id)
    assert.deepEqual(card.einblicke.map((e) => e.text), ['Erster'], 'angepinnt: nur die angepinnten')

    const own = (await get('/api/partner-area/einblicke', school.cookie)).data
    assert.equal(own.find((e) => e.id === einblicke.e1.id).angepinntVon, 'partner')
    assert.equal(own.find((e) => e.id === einblicke.e2.id).angepinntVon, null)
  })

  await t.test('Anpinnen: höchstens drei, ausgeblendete nicht, fremde 404, Lösen geht', async () => {
    assert.equal((await pin(school.cookie, einblicke.e2.id)).status, 200)
    assert.equal((await pin(school.cookie, einblicke.e3.id)).status, 200)
    const full = await pin(school.cookie, einblicke.e4.id)
    assert.equal(full.status, 409)
    assert.match(full.data.error, /Höchstens 3/)

    assert.equal((await pin(other.cookie, einblicke.e4.id)).status, 404)
    assert.equal((await unpin(other.cookie, einblicke.e1.id)).status, 404)
    assert.equal((await pin(school.cookie, 999999)).status, 404)

    const unpinned = await unpin(school.cookie, einblicke.e3.id)
    assert.equal(unpinned.status, 200)
    assert.equal(unpinned.data.angepinntVon, null)

    assert.equal((await post(`/api/admin/einblicke/${einblicke.e5.id}/ausblenden`, { ausgeblendet: true }, adminCookie)).status, 200)
    const hidden = await pin(school.cookie, einblicke.e5.id)
    assert.equal(hidden.status, 409)
    assert.match(hidden.data.error, /Ausgeblendete/)

    // Angepinnte nach Datum, neueste zuerst
    const card = cardOf((await discover()).hundeschulen, school.partner.id)
    assert.deepEqual(card.einblicke.map((e) => e.text), ['Zweiter', 'Erster'])
  })

  await t.test('Admin pinnt: Team-Pins stehen zuerst, der Partner kann sie nicht lösen; Admin löst jeden Pin', async () => {
    assert.equal((await adminPin(einblicke.e4.id, 'ja')).status, 400)
    assert.equal((await adminPin(999999, true)).status, 404)
    assert.equal((await post(`/api/admin/einblicke/${einblicke.e4.id}/anpinnen`, { angepinnt: true }, household.cookie)).status, 401)

    const res = await adminPin(einblicke.e4.id, true)
    assert.equal(res.status, 200)
    assert.equal(res.data.angepinntVon, 'admin')
    let card = cardOf((await discover()).hundeschulen, school.partner.id)
    assert.deepEqual(card.einblicke.map((e) => e.text), ['Vierter', 'Zweiter', 'Erster'])

    const blocked = await unpin(school.cookie, einblicke.e4.id)
    assert.equal(blocked.status, 409)
    assert.match(blocked.data.error, /Team/)
    // Mit dem Team-Pin sind es drei - der Partner kann keinen weiteren anpinnen.
    assert.equal((await pin(school.cookie, einblicke.e3.id)).status, 409)

    // Der Admin übernimmt einen Partner-Pin (dann zählt er als Team-Pin) und darf höchstens drei setzen.
    assert.equal((await adminPin(einblicke.e2.id, true)).data.angepinntVon, 'admin')
    assert.equal((await adminPin(einblicke.e3.id, true)).status, 200)
    const adminFull = await adminPin(einblicke.e1.id, true)
    assert.equal(adminFull.status, 409)
    card = cardOf((await discover()).hundeschulen, school.partner.id)
    assert.deepEqual(card.einblicke.map((e) => e.text), ['Vierter', 'Dritter', 'Zweiter'], 'Team-Pins verdrängen den Partner-Pin')

    const list = (await get(`/api/admin/einblicke?partnerId=${school.partner.id}`, adminCookie)).data
    assert.equal(list.find((e) => e.id === einblicke.e4.id).angepinntVon, 'admin')
    assert.equal(list.find((e) => e.id === einblicke.e1.id).angepinntVon, 'partner')

    for (const id of [einblicke.e2.id, einblicke.e3.id, einblicke.e4.id, einblicke.e1.id]) {
      const cleared = await adminPin(id, false)
      assert.equal(cleared.status, 200)
      assert.equal(cleared.data.angepinntVon, null)
    }
    card = cardOf((await discover()).hundeschulen, school.partner.id)
    assert.deepEqual(card.einblicke.map((e) => e.text), ['Vierter', 'Dritter', 'Zweiter'], 'ohne Pins wieder die neuesten (ausgeblendete nie)')
    assert.equal((await pin(school.cookie, einblicke.e1.id)).status, 200)
  })

  await t.test('Umkreis: Karte samt Anzeigen auch unter "Weiter weg"; liegt der Partner draußen, fallen seine Anzeigen mit weg', async () => {
    const fallback = await discover({ plz: '20095', radius: 10 })
    assert.equal(fallback.fallback.hundeschulen, true)
    const far = cardOf(fallback.hundeschulen, school.partner.id)
    assert.equal(far.ausserhalb, true)
    assert.equal(far.anzeigen.length, 3)
    assert.deepEqual(far.einblicke.map((e) => e.text), ['Erster'])

    const insert = db.prepare(`INSERT INTO partners (slug, name, typ, status, lat, lon, is_demo) VALUES (?, ?, 'hundeschule', 'aktiv', ?, ?, 0)`)
    for (let i = 1; i <= 5; i += 1) insert.run(`karten-hamburg-${i}`, `Hundeschule Hamburg ${i}`, HAMBURG.lat, HAMBURG.lon)
    const near = await discover({ plz: '20095', radius: 10 })
    assert.equal(near.fallback.hundeschulen, false)
    assert.equal(cardOf(near.hundeschulen, school.partner.id), undefined)
    const schoolPromotionIds = [posts.a.id, posts.b.id, posts.c.id, posts.linked.id]
    assert.ok(!sectionPromotionIds(near.hundeschulen).some((id) => schoolPromotionIds.includes(id)), 'keine verwaisten Anzeigen')
    assert.ok(near.hundeschulen.filter((card) => card.kind === 'partner').every((card) => Array.isArray(card.anzeigen) && Array.isArray(card.einblicke)))
  })

  await t.test('Tierheim: Begleiter-Anzeigen auf der Tierheim-Karte, Unterstützen-Anzeigen bleiben eigene Karten', async () => {
    const shelter = await createPartnerArea({ typ: 'tierheim', name: 'Tierheim Eiche' })
    const pate = await createApprovedPost(shelter.cookie, 'Patenschaft', { bereich: 'begleiter' })
    const spende = await createApprovedPost(shelter.cookie, 'Futterspende', { bereich: 'unterstuetzen' })
    const data = await discover()
    const card = cardOf(data.begleiter.partner, shelter.partner.id)
    assert.deepEqual(card.anzeigen.map((item) => item.id), [pate.id])
    assert.ok(!data.begleiter.promotions.some((item) => item.id === pate.id))
    assert.ok(data.unterstuetzen.promotions.some((item) => item.id === spende.id))
    assert.equal((await entdecken(shelter.cookie)).bereich, 'begleiter')
  })

  await t.test('Kundensicht: eigene Karte mit eingereichten und freigegebenen Anzeigen der Karte, Einblicke über /uploads', async () => {
    const res = await post('/api/partner-area/preview/discover', {}, school.cookie)
    assert.equal(res.status, 200)
    const [own] = res.data.hundeschulen
    assert.equal(own.id, school.partner.id)
    assert.equal(own.vorschau, true)
    // Wie in Entdecken, dazu der eingereichte Beitrag (ohne eigene Stelle: nach Datum hinter den geordneten).
    assert.deepEqual(titles(own.anzeigen), ['Welpenkurs neu', 'Rückruftraining', 'Noch in Prüfung'])
    assert.equal(res.data.hundeschulen.filter((card) => card.kind === 'partner' && card.id === school.partner.id).length, 1)
    assert.deepEqual(own.einblicke.map((e) => e.text), ['Erster'])
    assert.match(own.einblicke[0].fotoUrl, /^\/uploads\//)

    const pending = own.anzeigen.find((item) => item.id === posts.pending.id)
    assert.equal(pending.freigabe, 'eingereicht')
    assert.equal(pending.vorschau, true)
    assert.equal(pending.clickUrl, null)
    assert.equal(own.anzeigen[1].clickUrl, `/r/promotion/${posts.c.id}`)
    assert.ok(!own.anzeigen.some((item) => item.id === posts.linked.id), 'nicht in Entdecken gezeigt bleibt draußen')
    assert.ok(!sectionPromotionIds(res.data.hundeschulen).includes(posts.pending.id), 'keine eigene Karte für den Beitrag')
  })

  await t.test('Ausblenden löst einen Pin (sonst stünden nach dem Wiedereinblenden mehr als drei da); Kurztext ohne Leerzeichen', async () => {
    const hidden = await post(`/api/admin/einblicke/${einblicke.e1.id}/ausblenden`, { ausgeblendet: true }, adminCookie)
    assert.equal(hidden.status, 200)
    assert.equal(hidden.data.angepinntVon, null)
    const shown = await post(`/api/admin/einblicke/${einblicke.e1.id}/ausblenden`, { ausgeblendet: false }, adminCookie)
    assert.equal(shown.data.angepinntVon, null, 'nach dem Einblenden nicht wieder angepinnt')

    db.prepare('UPDATE partners SET portal_titel = NULL, portal_text = ? WHERE id = ?').run(`${'x'.repeat(200)}. Zweiter Satz.`, school.partner.id)
    const card = cardOf((await discover()).hundeschulen, school.partner.id)
    assert.equal(card.kurztext, `${'x'.repeat(140)} …`)
    assert.deepEqual(card.einblicke.map((e) => e.text), ['Vierter', 'Dritter', 'Zweiter'], 'ohne Pin wieder die neuesten')
  })
})
