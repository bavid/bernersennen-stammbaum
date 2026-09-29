const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, getCookie } = require('./helpers')

// Phase P2 Task 9: Beiträge und Posteingänge der Demo-Partner (seed/demo-partner-area.js POSTS/MESSAGES,
// lib/demoPartnerAreas.js createDemoPartnerContent) - geprüft mit denselben Prüfungen wie echte Beiträge und
// Kontaktanfragen, alle is_demo = 1, bei jedem Demo-Wechsel ohne Waisen ersetzt. APP_ENV=staging: Demo-Partner
// sind ohne ?demo=1 sichtbar. t.test() bleibt auf einer Ebene.
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
    partners: db.prepare('SELECT id, slug FROM partners WHERE is_demo = 1 ORDER BY id').all(),
    promotions: db.prepare('SELECT * FROM promotions WHERE is_demo = 1 ORDER BY id').all(),
    messages: db.prepare('SELECT * FROM partner_messages ORDER BY id').all()
  })

  const first = replaceDemoPack(db, uploadDir)

  await t.test('Beiträge: Pfotenglück zwei (freigegeben, eingereicht), Wuschelglück einer im Bereich salon - alle Anzeige und Demo', () => {
    assert.deepEqual(
      postsOf(PFOTENGLUECK).map(({ titel, freigabe, bereich }) => ({ titel, freigabe, bereich })),
      [
        { titel: 'Tag der offenen Tür', freigabe: 'eingereicht', bereich: 'hundeschule' },
        { titel: 'Welpenkurs ab Oktober', freigabe: 'freigegeben', bereich: 'hundeschule' }
      ]
    )
    assert.deepEqual(
      postsOf(WUSCHELGLUECK).map(({ titel, freigabe, bereich }) => ({ titel, freigabe, bereich })),
      [{ titel: 'Herbst-Pflegetag', freigabe: 'freigegeben', bereich: 'salon' }]
    )
    for (const row of [...postsOf(PFOTENGLUECK), ...postsOf(WUSCHELGLUECK)]) {
      assert.equal(row.kennzeichnung, 'Anzeige')
      assert.equal(row.empfohlen_von, null)
      assert.equal(row.is_demo, 1)
      assert.equal(row.erstellt_von_partner, 1)
      assert.equal(row.ablehnungsgrund, null)
      assert.match(row.url, /^https:\/\/example\.org\//)
    }
    assert.equal(first.partnerPostIds.length, 3)
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
    assert.deepEqual(posts.map((p) => p.titel).sort(), ['Tag der offenen Tür', 'Welpenkurs ab Oktober'])
    const inbox = (await get('/api/partner-area/messages', partnerCookie)).data
    assert.equal(inbox.messages.length, 2)
    assert.equal(inbox.unread, 1)

    const shelterLogin = await post('/api/demo', { as: 'tierheim' })
    assert.equal(shelterLogin.data.partner.unread, 1)
    const shelterInbox = (await get('/api/partner-area/messages', getCookie(shelterLogin.res))).data
    assert.deepEqual(shelterInbox.messages.map((m) => m.bezug), ['Anfrage zu Pepper'])

    const demoLogin = await post('/api/demo')
    const discover = (await post('/api/discover', {}, getCookie(demoLogin.res))).data
    const titles = (cards) => cards.filter((card) => card.kind === 'promotion').map((card) => card.titel)
    assert.ok(titles(discover.hundeschulen).includes('Welpenkurs ab Oktober'))
    assert.ok(!titles(discover.hundeschulen).includes('Tag der offenen Tür'), 'eingereicht bleibt unsichtbar')
    assert.deepEqual(titles(discover.salon), ['Herbst-Pflegetag'])
    assert.ok(discover.salon.some((card) => card.kind === 'partner' && card.slug === WUSCHELGLUECK))

    const portal = (await get(`/api/public/partners/${PFOTENGLUECK}/posts`)).data
    assert.ok(portal.some((card) => card.titel === 'Welpenkurs ab Oktober'))
    assert.ok(!portal.some((card) => card.titel === 'Tag der offenen Tür'))
  })

  await t.test('zweites Ersetzen: keine Duplikate, keine Nachrichten oder Beiträge an alten Demo-Partnern', () => {
    const oldPartnerIds = db.prepare('SELECT id FROM partners WHERE is_demo = 1').all().map((row) => row.id)
    replaceDemoPack(db, uploadDir)

    assert.equal(postsOf(PFOTENGLUECK).length, 2)
    assert.equal(postsOf(WUSCHELGLUECK).length, 1)
    assert.equal(messagesOf(PFOTENGLUECK).length, 2)
    assert.equal(messagesOf(SONNENHANG).length, 1)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM partner_messages').get().n, 3)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM promotions WHERE is_demo = 1 AND erstellt_von_partner = 1').get().n, 3)
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
