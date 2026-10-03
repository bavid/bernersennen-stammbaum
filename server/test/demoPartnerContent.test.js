const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, getCookie } = require('./helpers')

// Phase P2 Task 9: Beiträge und Posteingänge der Demo-Partner (seed/demo-partner-area.js POSTS/MESSAGES,
// lib/demoPartnerAreas.js createDemoPartnerContent) - geprüft mit denselben Prüfungen wie echte Beiträge und
// Kontaktanfragen, alle is_demo = 1, bei jedem Demo-Wechsel ohne Waisen ersetzt. APP_ENV=staging: Demo-Partner
// sind ohne ?demo=1 sichtbar. V-Fehler 3: ein abgelehnter Beitrag mit Grund, der Verlauf je Beitrag und ein
// vertrauenswürdiger Demo-Partner (Wuschelglück). t.test() bleibt auf einer Ebene.
const dataDir = useTempDataDir('demo-partner-content', { APP_ENV: 'staging', LOGIN_RATE_LIMIT: '300' })

const PFOTENGLUECK = 'hundeschule-pfotenglueck'
const WUSCHELGLUECK = 'hundesalon-wuschelglueck'
const SONNENHANG = 'tierheim-sonnenhang'

test('Demo: Beiträge und Posteingänge der Demo-Partner', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const { uploadDir } = require('../config')
  const { replaceDemoPack } = require('../lib/demoPack')
  const areaSeed = require('../seed/demo-partner-area')

  const get = (urlPath, cookie) => call(base, urlPath, { cookie })
  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })

  const postsOf = (slug) =>
    db
      .prepare('SELECT m.* FROM promotions m JOIN partners p ON p.id = m.partner_id WHERE p.slug = ? AND m.erstellt_von_partner = 1 ORDER BY m.titel')
      .all(slug)
  const messagesOf = (slug) =>
    db.prepare('SELECT m.* FROM partner_messages m JOIN partners p ON p.id = m.partner_id WHERE p.slug = ? ORDER BY m.id').all(slug)
  const snapshotDemo = () => ({
    partners: db.prepare('SELECT id, slug, vertrauenswuerdig FROM partners WHERE is_demo = 1 ORDER BY id').all(),
    promotions: db.prepare('SELECT * FROM promotions WHERE is_demo = 1 ORDER BY id').all(),
    events: db.prepare('SELECT * FROM promotion_events ORDER BY id').all(),
    messages: db.prepare('SELECT * FROM partner_messages ORDER BY id').all()
  })
  const verlaufOf = (promotionId) =>
    db
      .prepare(
        "SELECT aktion, grund, CAST(julianday('now') - julianday(created_at) + 0.5 AS INTEGER) AS tageAlt FROM promotion_events WHERE promotion_id = ? ORDER BY created_at, id"
      )
      .all(promotionId)

  const first = replaceDemoPack(db, uploadDir)

  await t.test('Beiträge: Pfotenglück vier (abgelehnt, eingereicht, zwei freigegeben), Wuschelglück zwei im Bereich salon - alle Anzeige und Demo', () => {
    assert.deepEqual(
      postsOf(PFOTENGLUECK).map(({ titel, freigabe, bereich }) => ({ titel, freigabe, bereich })),
      [
        { titel: 'Agility-Schnupperstunde', freigabe: 'abgelehnt', bereich: 'hundeschule' },
        { titel: 'Einzeltraining am Abend', freigabe: 'freigegeben', bereich: 'hundeschule' },
        { titel: 'Tag der offenen Tür', freigabe: 'eingereicht', bereich: 'hundeschule' },
        { titel: 'Welpenkurs ab Oktober', freigabe: 'freigegeben', bereich: 'hundeschule' }
      ]
    )
    assert.deepEqual(
      postsOf(WUSCHELGLUECK).map(({ titel, freigabe, bereich }) => ({ titel, freigabe, bereich })),
      [
        { titel: 'Herbst-Pflegetag', freigabe: 'freigegeben', bereich: 'salon' },
        { titel: 'Welpen-Kennenlerntermin', freigabe: 'freigegeben', bereich: 'salon' }
      ]
    )
    for (const row of [...postsOf(PFOTENGLUECK), ...postsOf(WUSCHELGLUECK)]) {
      assert.equal(row.kennzeichnung, 'Anzeige')
      assert.equal(row.empfohlen_von, null)
      assert.equal(row.is_demo, 1)
      assert.equal(row.erstellt_von_partner, 1)
      assert.equal(row.ablehnungsgrund, row.freigabe === 'abgelehnt' ? 'Link führt ins Leere – die Seite zur Schnupperstunde ist nicht erreichbar.' : null)
      assert.match(row.url, /^https:\/\/example\.org\//)
    }
    // Phase V4a: dazu der Pfoten-Flohmarkt des Tierheims (Anzeige mit mehreren Terminen, test/demoTermine.test.js).
    assert.equal(first.partnerPostIds.length, 7)
  })

  await t.test('Verlauf und Vertrauen: der abgelehnte Beitrag erzählt seine Geschichte, Wuschelglück ist vertrauenswürdig', () => {
    const [agility, , offeneTuer, welpenkurs] = postsOf(PFOTENGLUECK)
    assert.deepEqual(verlaufOf(agility.id), [
      { aktion: 'eingereicht', grund: null, tageAlt: 5 },
      { aktion: 'geaendert', grund: null, tageAlt: 4 },
      { aktion: 'abgelehnt', grund: agility.ablehnungsgrund, tageAlt: 3 }
    ])
    assert.deepEqual(verlaufOf(offeneTuer.id).map((event) => event.aktion), ['eingereicht'])
    assert.deepEqual(verlaufOf(welpenkurs.id).map((event) => event.aktion), ['eingereicht', 'freigegeben'])
    const [pflegetag] = postsOf(WUSCHELGLUECK)
    assert.deepEqual(verlaufOf(pflegetag.id).map((event) => event.aktion), ['eingereicht', 'freigegeben', 'geaendert'])

    const trust = Object.fromEntries(
      db.prepare('SELECT slug, vertrauenswuerdig FROM partners WHERE is_demo = 1').all().map((row) => [row.slug, row.vertrauenswuerdig])
    )
    assert.equal(trust[WUSCHELGLUECK], 1)
    for (const slug of [PFOTENGLUECK, SONNENHANG]) assert.equal(trust[slug], 0)
  })

  await t.test('Posteingänge: Pfotenglück zwei Nachrichten (eine gelesen), Tierheim eine "Anfrage zu Pepper" - fiktiv, @example.org', () => {
    const pfoten = messagesOf(PFOTENGLUECK)
    assert.equal(pfoten.length, 2)
    assert.equal(pfoten.filter((m) => m.gelesen_at !== null).length, 1)
    const shelter = messagesOf(SONNENHANG)
    assert.equal(shelter.length, 1)
    assert.equal(shelter[0].bezug, 'Anfrage zu Pepper')
    assert.equal(messagesOf(WUSCHELGLUECK).length, 0)
    for (const message of [...pfoten, ...shelter]) {
      assert.equal(message.is_demo, 1)
      assert.match(message.email, /@example\.org$/)
      assert.ok(message.nachricht.length >= 10)
    }
    assert.deepEqual(first.messages, { [PFOTENGLUECK]: 2, [SONNENHANG]: 1 })
  })

  await t.test('Demo-Sitzungen sehen Beiträge, Posteingang und unread; Entdecken zeigt nur die freigegebenen', async () => {
    const partnerLogin = await post('/api/demo', { as: 'partner' })
    assert.equal(partnerLogin.status, 200)
    assert.equal(partnerLogin.data.partner.unread, 1)
    const partnerCookie = getCookie(partnerLogin.res)
    const posts = (await get('/api/partner-area/posts', partnerCookie)).data
    assert.deepEqual(posts.map((p) => p.titel).sort(), ['Agility-Schnupperstunde', 'Einzeltraining am Abend', 'Tag der offenen Tür', 'Welpenkurs ab Oktober'])
    const rejected = posts.find((p) => p.titel === 'Agility-Schnupperstunde')
    assert.equal(rejected.freigabe, 'abgelehnt')
    assert.deepEqual(rejected.verlauf.map((event) => event.aktion), ['eingereicht', 'geaendert', 'abgelehnt'])
    assert.equal(rejected.verlauf.at(-1).grund, rejected.ablehnungsgrund)
    assert.equal(partnerLogin.data.partner.vertrauenswuerdig, false)
    // Die Demo liest nur - auch kein "Erneut einreichen".
    const resubmit = await call(base, `/api/partner-area/posts/${rejected.id}`, {
      method: 'PUT',
      body: { titel: 'Neu', bereich: 'hundeschule' },
      cookie: partnerCookie
    })
    assert.equal(resubmit.status, 403)
    assert.equal(db.prepare('SELECT freigabe FROM promotions WHERE id = ?').get(rejected.id).freigabe, 'abgelehnt')

    const salonLogin = await post('/api/demo', { as: 'partner', slug: WUSCHELGLUECK })
    assert.equal(salonLogin.status, 200)
    assert.equal(salonLogin.data.partner.vertrauenswuerdig, true)
    const salonPosts = (await get('/api/partner-area/posts', getCookie(salonLogin.res))).data
    assert.deepEqual(salonPosts.find((p) => p.titel === 'Herbst-Pflegetag').verlauf.map((event) => event.aktion), ['eingereicht', 'freigegeben', 'geaendert'])
    const inbox = (await get('/api/partner-area/messages', partnerCookie)).data
    assert.equal(inbox.messages.length, 2)
    assert.equal(inbox.unread, 1)

    const shelterLogin = await post('/api/demo', { as: 'tierheim' })
    assert.equal(shelterLogin.data.partner.unread, 1)
    const shelterInbox = (await get('/api/partner-area/messages', getCookie(shelterLogin.res))).data
    assert.deepEqual(shelterInbox.messages.map((m) => m.bezug), ['Anfrage zu Pepper'])

    const demoLogin = await post('/api/demo')
    const discover = (await post('/api/discover', {}, getCookie(demoLogin.res))).data
    // Phase V1: Anzeigen der Partner stehen auf ihrer Karte (anzeigen).
    const titles = (cards) => cards.flatMap((card) => (card.kind === 'promotion' ? [card] : card.anzeigen)).map((card) => card.titel)
    assert.ok(titles(discover.hundeschulen).includes('Welpenkurs ab Oktober'))
    assert.ok(!titles(discover.hundeschulen).includes('Tag der offenen Tür'), 'eingereicht bleibt unsichtbar')
    assert.ok(!titles(discover.hundeschulen).includes('Agility-Schnupperstunde'), 'abgelehnt bleibt unsichtbar')
    assert.deepEqual(titles(discover.salon), ['Herbst-Pflegetag', 'Welpen-Kennenlerntermin'])
    assert.ok(discover.salon.some((card) => card.kind === 'partner' && card.slug === WUSCHELGLUECK))

    const portal = (await get(`/api/public/partners/${PFOTENGLUECK}/posts`)).data
    assert.ok(portal.some((card) => card.titel === 'Welpenkurs ab Oktober'))
    assert.ok(!portal.some((card) => card.titel === 'Tag der offenen Tür'))
  })

  await t.test('Karten in Entdecken (Phase V1): Pfotenglück zwei Anzeigen in gewählter Reihenfolge und ein angepinnter Einblick, Wuschelglück mit Team-Pin', async () => {
    const demoLogin = await post('/api/demo')
    const data = (await post('/api/discover', {}, getCookie(demoLogin.res))).data
    const cardOf = (cards, slug) => cards.find((card) => card.kind === 'partner' && card.slug === slug)

    const pfoten = cardOf(data.hundeschulen, PFOTENGLUECK)
    assert.deepEqual(pfoten.anzeigen.map((item) => item.titel), ['Welpenkurs ab Oktober', 'Einzeltraining am Abend'])
    assert.ok(pfoten.anzeigen.every((item) => item.kennzeichnung === 'Anzeige'))
    assert.deepEqual(pfoten.einblicke.map((item) => item.text), ['Abschlussprüfung im Begleithundekurs – alle bestanden!'])
    assert.ok(!data.hundeschulen.some((card) => card.kind === 'promotion'), 'keine Anzeige mehr als eigene Karte')

    const salon = cardOf(data.salon, WUSCHELGLUECK)
    assert.deepEqual(salon.anzeigen.map((item) => item.titel), ['Herbst-Pflegetag', 'Welpen-Kennenlerntermin'])
    assert.deepEqual(
      salon.einblicke.map((item) => item.text),
      ['Krallenpflege ganz entspannt', 'Welpen-Kennenlerntermin – erste Schritte im Salon'],
      'Team-Pin zuerst'
    )
    const sonnenhang = cardOf(data.begleiter.partner, SONNENHANG)
    assert.deepEqual(sonnenhang.anzeigen.map((item) => item.titel), ['Patenschaft für Senioren-Hunde'])
    assert.equal(sonnenhang.einblicke.length, 2, 'ohne Pin die neuesten')

    // Die Reihenfolge ist gewählt: ohne sie stünde der neuere Beitrag ("Einzeltraining") vorn.
    const [welpenkurs, einzeltraining] = ['Welpenkurs ab Oktober', 'Einzeltraining am Abend'].map((titel) =>
      db.prepare('SELECT id, partner_reihenfolge FROM promotions WHERE titel = ? AND is_demo = 1').get(titel)
    )
    assert.ok(einzeltraining.id > welpenkurs.id)
    assert.deepEqual([welpenkurs.partner_reihenfolge, einzeltraining.partner_reihenfolge], [1, 2])

    const partnerLogin = await post('/api/demo', { as: 'partner' })
    const cookie = getCookie(partnerLogin.res)
    const list = (await get('/api/partner-area/posts/entdecken', cookie)).data
    assert.deepEqual(
      list.anzeigen.map(({ titel, reihenfolge, inEntdecken, vomTeam, aufKarte }) => ({ titel, reihenfolge, inEntdecken, vomTeam, aufKarte })),
      [
        { titel: 'Welpenkurs ab Oktober', reihenfolge: 1, inEntdecken: true, vomTeam: false, aufKarte: true },
        { titel: 'Einzeltraining am Abend', reihenfolge: 2, inEntdecken: true, vomTeam: false, aufKarte: true },
        { titel: 'Welpenkurs im Frühjahr', reihenfolge: null, inEntdecken: false, vomTeam: true, aufKarte: false }
      ]
    )
    const portal = (await get(`/api/public/partners/${PFOTENGLUECK}/posts`)).data
    assert.ok(portal.some((card) => card.titel === 'Welpenkurs im Frühjahr'), 'nur auf dem Portal')

    // Die Demo liest nur - auch Reihenfolge, Schalter und Anpinnen sind gesperrt.
    const put = (urlPath, body) => call(base, urlPath, { method: 'PUT', body, cookie })
    assert.equal((await put('/api/partner-area/posts/reihenfolge', { ids: [] })).status, 403)
    assert.equal((await put(`/api/partner-area/posts/${welpenkurs.id}/entdecken`, { inEntdecken: false })).status, 403)
    const einblicke = (await get('/api/partner-area/einblicke', cookie)).data
    assert.deepEqual(einblicke.filter((item) => item.angepinntVon).map((item) => item.angepinntVon), ['partner'])
    assert.equal((await post(`/api/partner-area/einblicke/${einblicke[0].id}/anpinnen`, undefined, cookie)).status, 403)
    assert.equal(db.prepare('SELECT partner_reihenfolge FROM promotions WHERE id = ?').get(welpenkurs.id).partner_reihenfolge, 1)
  })

  await t.test('zweites Ersetzen: keine Duplikate, keine Nachrichten oder Beiträge an alten Demo-Partnern', () => {
    const oldPartnerIds = db.prepare('SELECT id FROM partners WHERE is_demo = 1').all().map((row) => row.id)
    replaceDemoPack(db, uploadDir)

    assert.equal(postsOf(PFOTENGLUECK).length, 4)
    assert.equal(postsOf(WUSCHELGLUECK).length, 2)
    assert.equal(messagesOf(PFOTENGLUECK).length, 2)
    assert.equal(messagesOf(SONNENHANG).length, 1)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM partner_messages').get().n, 3)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM promotions WHERE is_demo = 1 AND erstellt_von_partner = 1').get().n, 7)
    // Der Verlauf der alten Demo-Beiträge geht mit ihnen (ON DELETE CASCADE) - nur der neue bleibt.
    const seededEvents = areaSeed.POSTS.reduce((sum, entry) => sum + entry.verlauf.length, 0)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM promotion_events').get().n, seededEvents)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM promotion_events WHERE promotion_id NOT IN (SELECT id FROM promotions)').get().n, 0)
    const placeholders = oldPartnerIds.map(() => '?').join(', ')
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM partner_messages WHERE partner_id IN (${placeholders})`).get(...oldPartnerIds).n, 0)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM partner_messages WHERE partner_id NOT IN (SELECT id FROM partners)').get().n, 0)
    assert.equal(
      db.prepare('SELECT COUNT(*) AS n FROM promotions WHERE erstellt_von_partner = 1 AND (partner_id IS NULL OR partner_id NOT IN (SELECT id FROM partners))').get().n,
      0
    )
  })

  await t.test('Rollback: ein Beitrag oder eine Nachricht, die die echte Prüfung nicht besteht, lässt alles unverändert', () => {
    const postCases = [
      { entry: { partnerSlug: PFOTENGLUECK, freigabe: 'freigegeben', bereich: 'futter', titel: 'Falscher Bereich' }, error: /Bereich passt nicht/ },
      { entry: { partnerSlug: WUSCHELGLUECK, freigabe: 'freigegeben', bereich: 'salon', titel: 'Welpen abzugeben' }, error: /Züchter|Zucht/ },
      { entry: { partnerSlug: WUSCHELGLUECK, freigabe: 'abgelehnt', bereich: 'salon', titel: 'Ohne Grund' }, error: /Freigabe/ },
      { entry: { partnerSlug: WUSCHELGLUECK, freigabe: 'abgelehnt', ablehnungsgrund: 'x', bereich: 'salon', titel: 'Zu kurz' }, error: /Grund/ },
      {
        entry: { partnerSlug: WUSCHELGLUECK, freigabe: 'freigegeben', ablehnungsgrund: 'Gar nicht abgelehnt', bereich: 'salon', titel: 'Grund ohne Ablehnung' },
        error: /Ablehnungsgrund/
      },
      {
        entry: {
          partnerSlug: WUSCHELGLUECK,
          freigabe: 'eingereicht',
          verlauf: [{ aktion: 'eingereicht', tageAlt: 2 }, { aktion: 'freigegeben', tageAlt: 1 }],
          bereich: 'salon',
          titel: 'Falscher Verlauf'
        },
        error: /Verlauf endet/
      },
      {
        entry: { partnerSlug: WUSCHELGLUECK, freigabe: 'freigegeben', verlauf: [{ aktion: 'freigegeben', tageAlt: 1 }], bereich: 'salon', titel: 'Ohne Anfang' },
        error: /beginnen/
      },
      {
        entry: {
          partnerSlug: WUSCHELGLUECK,
          freigabe: 'eingereicht',
          verlauf: [{ aktion: 'eingereicht', tageAlt: 1 }, { aktion: 'geaendert', tageAlt: 3 }],
          bereich: 'salon',
          titel: 'Rückwärts'
        },
        error: /älteste zuerst/
      },
      { entry: { partnerSlug: 'gibt-es-nicht', freigabe: 'freigegeben', bereich: 'salon', titel: 'Unbekannt' }, error: /Demo-Partner/ }
    ]
    for (const { entry, error } of postCases) {
      const before = snapshotDemo()
      areaSeed.POSTS.push(entry)
      try {
        assert.throws(() => replaceDemoPack(db, uploadDir), error)
      } finally {
        areaSeed.POSTS.pop()
      }
      assert.deepEqual(snapshotDemo(), before, entry.titel)
    }

    // Phase V1: Karten-Reihenfolge nur aus freigegebenen Anzeigen der Karte, jede einmal.
    const cardCases = [
      { entry: { partnerSlug: PFOTENGLUECK, reihenfolge: ['Tag der offenen Tür'], nurPortal: [] }, error: /keine freigegebene Anzeige/ },
      { entry: { partnerSlug: PFOTENGLUECK, reihenfolge: [], nurPortal: ['Herbst-Pflegetag'] }, error: /keine freigegebene Anzeige/ },
      { entry: { partnerSlug: PFOTENGLUECK, reihenfolge: ['Welpenkurs ab Oktober', 'Welpenkurs ab Oktober'], nurPortal: [] }, error: /jede einmal/ }
    ]
    for (const { entry, error } of cardCases) {
      const before = snapshotDemo()
      areaSeed.KARTEN.push(entry)
      try {
        assert.throws(() => replaceDemoPack(db, uploadDir), error)
      } finally {
        areaSeed.KARTEN.pop()
      }
      assert.deepEqual(snapshotDemo(), before, JSON.stringify(entry).slice(0, 60))
    }

    // Pins nur 'partner' oder 'admin', höchstens drei je Partner.
    const pinned = areaSeed.EINBLICKE.find((entry) => entry.angepinnt === 'partner')
    pinned.angepinnt = 'team'
    try {
      assert.throws(() => replaceDemoPack(db, uploadDir), /angepinnt muss/)
    } finally {
      pinned.angepinnt = 'partner'
    }
    const salonEntries = areaSeed.EINBLICKE.filter((entry) => entry.partnerSlug === WUSCHELGLUECK)
    const originals = salonEntries.map((entry) => entry.angepinnt)
    salonEntries.forEach((entry) => {
      entry.angepinnt = 'partner'
    })
    try {
      assert.throws(() => replaceDemoPack(db, uploadDir), /mehr als 3 angepinnte/)
    } finally {
      salonEntries.forEach((entry, index) => {
        entry.angepinnt = originals[index]
      })
    }

    const base = { partnerSlug: PFOTENGLUECK, name: 'Kim Beispiel', email: 'kim@example.org', nachricht: 'Eine gültige Nachricht.', stundenAlt: 2 }
    const messageCases = [
      { entry: { ...base, email: 'keine-adresse' }, error: /E-Mail/ },
      { entry: { ...base, nachricht: 'kurz' }, error: /Nachricht/ },
      { entry: { ...base, partnerSlug: SONNENHANG, bezugTier: 'Gibt-es-nicht' }, error: /Gibt-es-nicht/ }
    ]
    for (const { entry, error } of messageCases) {
      const before = snapshotDemo()
      areaSeed.MESSAGES.push(entry)
      try {
        assert.throws(() => replaceDemoPack(db, uploadDir), error)
      } finally {
        areaSeed.MESSAGES.pop()
      }
      assert.deepEqual(snapshotDemo(), before, JSON.stringify(entry).slice(0, 60))
    }
  })
})
