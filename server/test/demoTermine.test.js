const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, getCookie } = require('./helpers')
const { addDays, weekdayOf, nthWeekdayOf, berlinNow } = require('../lib/terminSerien')

// Phase V4a: der Kalender der Demo-Partner (seed/demo-partner-area.js TERMINE, lib/demoPartnerAreas.js) und die Anzeigen
// mit mehreren Terminen (zeitraeumeInTagen) - alles relativ zum Tag des Aufbaus, geprüft wie echte Eingaben, is_demo = 1,
// bei jedem Demo-Wechsel ohne Waisen ersetzt. APP_ENV=staging: Demo-Partner sind ohne ?demo=1 sichtbar.
// t.test() bleibt auf einer Ebene.
const dataDir = useTempDataDir('demo-termine', { APP_ENV: 'staging', LOGIN_RATE_LIMIT: '300' })

const PFOTENGLUECK = 'hundeschule-pfotenglueck'
const WUSCHELGLUECK = 'hundesalon-wuschelglueck'
const SONNENHANG = 'tierheim-sonnenhang'

test('Demo: Kalender und Anzeigen mit mehreren Terminen', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const { uploadDir } = require('../config')
  const { replaceDemoPack } = require('../lib/demoPack')
  const areaSeed = require('../seed/demo-partner-area')
  const today = berlinNow().datum

  const get = (urlPath, cookie) => call(base, urlPath, { cookie })
  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const termineOf = (slug) =>
    db.prepare('SELECT t.* FROM partner_termine t JOIN partners p ON p.id = t.partner_id WHERE p.slug = ? ORDER BY t.titel').all(slug)
  const absagenOf = (terminId) => db.prepare('SELECT datum FROM partner_termin_absagen WHERE termin_id = ? ORDER BY datum').all(terminId).map((row) => row.datum)
  const postOf = (slug, titel) =>
    db.prepare('SELECT m.* FROM promotions m JOIN partners p ON p.id = m.partner_id WHERE p.slug = ? AND m.titel = ?').get(slug, titel)
  const snapshot = () => ({
    termine: db.prepare('SELECT * FROM partner_termine ORDER BY id').all(),
    absagen: db.prepare('SELECT * FROM partner_termin_absagen ORDER BY termin_id, datum').all(),
    promotions: db.prepare('SELECT * FROM promotions WHERE is_demo = 1 ORDER BY id').all()
  })

  const first = replaceDemoPack(db, uploadDir)

  await t.test('Termine: Pfotenglück drei, Tierheim und Salon je einer - alle Demo, ab heute', () => {
    assert.deepEqual(first.termine, { [PFOTENGLUECK]: 3, [SONNENHANG]: 1, [WUSCHELGLUECK]: 1 })
    const [ersteHilfe, social, welpen] = termineOf(PFOTENGLUECK)
    assert.equal(ersteHilfe.titel, 'Erste-Hilfe-Kurs am Hund')
    assert.equal(ersteHilfe.serie, 'keine')
    assert.equal(ersteHilfe.datum, addDays(today, 16))

    assert.equal(social.titel, 'Social Walk')
    assert.equal(social.serie, 'monatlich_wochentag')
    assert.equal(weekdayOf(social.datum), 0)
    assert.equal(nthWeekdayOf(social.datum), 2)

    assert.equal(welpen.titel, 'Welpenspielstunde')
    assert.equal(welpen.serie, 'woechentlich')
    assert.equal(weekdayOf(welpen.datum), 6)
    assert.ok(welpen.datum >= today && welpen.datum <= addDays(today, 6))
    assert.deepEqual(absagenOf(welpen.id), [addDays(welpen.datum, 7)], 'der zweite Samstag fällt aus')

    const [offen] = termineOf(SONNENHANG)
    assert.deepEqual([offen.titel, offen.uhrzeit, offen.ende, weekdayOf(offen.datum), nthWeekdayOf(offen.datum)], ['Tag der offenen Tür', '14:00', '17:00', 0, 1])
    const [krallen] = termineOf(WUSCHELGLUECK)
    assert.deepEqual([krallen.titel, krallen.serie, Number(krallen.datum.slice(8))], ['Krallen-Sprechstunde', 'monatlich_tag', 12])

    const all = db.prepare('SELECT * FROM partner_termine').all()
    assert.ok(all.every((row) => row.is_demo === 1 && row.ausgeblendet === 0 && row.datum >= today))
  })

  await t.test('Anzeigen mit mehreren Terminen: Flohmarkt des Tierheims und Tag der offenen Tür bei Pfotenglück', () => {
    const flohmarkt = postOf(SONNENHANG, 'Pfoten-Flohmarkt')
    assert.equal(flohmarkt.freigabe, 'freigegeben')
    assert.equal(flohmarkt.bereich, 'unterstuetzen')
    assert.deepEqual(JSON.parse(flohmarkt.zeitraeume), [
      { von: addDays(today, 9), bis: null },
      { von: addDays(today, 37), bis: null },
      { von: addDays(today, 65), bis: null },
      { von: addDays(today, 120), bis: addDays(today, 124) }
    ])
    assert.equal(JSON.parse(postOf(PFOTENGLUECK, 'Tag der offenen Tür').zeitraeume).length, 2)
  })

  await t.test('öffentlich: Portal mit Terminen, Karte mit "Nächster Termin", Anzeige mit Terminen', async () => {
    const portal = await get(`/api/public/partners/${PFOTENGLUECK}`)
    assert.equal(portal.status, 200)
    const titles = new Set(portal.data.termine.map((item) => item.titel))
    assert.deepEqual([...titles].sort(), ['Erste-Hilfe-Kurs am Hund', 'Social Walk', 'Welpenspielstunde'])
    assert.equal(portal.data.termine.filter((item) => item.abgesagt).length, 1)

    const demoLogin = await post('/api/demo')
    const discover = await post('/api/discover', {}, getCookie(demoLogin.res))
    assert.equal(discover.status, 200)
    const card = discover.data.hundeschulen.find((item) => item.kind === 'partner' && item.slug === PFOTENGLUECK)
    assert.ok(['Welpenspielstunde', 'Social Walk', 'Erste-Hilfe-Kurs am Hund'].includes(card.naechsterTermin.titel))
    const sonnenhang = discover.data.begleiter.partner.find((item) => item.slug === SONNENHANG)
    assert.equal(sonnenhang.naechsterTermin.titel, 'Tag der offenen Tür')
    const flohmarkt = discover.data.unterstuetzen.promotions.find((item) => item.titel === 'Pfoten-Flohmarkt')
    assert.equal(flohmarkt.zeitraeume.length, 4)
  })

  await t.test('Demo-Partner liest seinen Kalender, ändern geht nicht', async () => {
    const login = await post('/api/demo', { as: 'partner' })
    const cookie = getCookie(login.res)
    const own = await get('/api/partner-area/termine', cookie)
    assert.equal(own.status, 200)
    assert.equal(own.data.termine.length, 3)
    assert.ok(own.data.vorkommen.some((item) => item.abgesagt))
    const welpen = own.data.termine.find((item) => item.titel === 'Welpenspielstunde')
    assert.equal((await post('/api/partner-area/termine', { titel: 'Neu', datum: today, uhrzeit: '23:59' }, cookie)).status, 403)
    assert.equal((await post(`/api/partner-area/termine/${welpen.id}/absagen`, { datum: welpen.datum }, cookie)).status, 403)
  })

  await t.test('zweites Ersetzen: keine Duplikate, keine Termine oder Absagen an alten Demo-Partnern', () => {
    const oldPartnerIds = db.prepare('SELECT id FROM partners WHERE is_demo = 1').all().map((row) => row.id)
    replaceDemoPack(db, uploadDir)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM partner_termine').get().n, areaSeed.TERMINE.length)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM partner_termin_absagen').get().n, 1)
    const placeholders = oldPartnerIds.map(() => '?').join(', ')
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM partner_termine WHERE partner_id IN (${placeholders})`).get(...oldPartnerIds).n, 0)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM partner_termin_absagen WHERE termin_id NOT IN (SELECT id FROM partner_termine)').get().n, 0)
  })

  await t.test('Rollback: ein Termin, der die echte Prüfung nicht besteht, lässt alles unverändert', () => {
    const cases = [
      { entry: { partnerSlug: PFOTENGLUECK, titel: 'Mehr unter www.example.org', start: { inTagen: 3 }, uhrzeit: '10:00' }, error: /reinen Text/ },
      { entry: { partnerSlug: PFOTENGLUECK, titel: 'Ohne Uhrzeit', start: { inTagen: 3 } }, error: /Uhrzeit/ },
      { entry: { partnerSlug: PFOTENGLUECK, titel: 'Kein Start', start: {}, uhrzeit: '10:00' }, error: /start passt/ },
      { entry: { partnerSlug: PFOTENGLUECK, titel: 'Absage ins Leere', start: { inTagen: 3 }, uhrzeit: '10:00', abgesagt: [1] }, error: /2\. Termin/ },
      { entry: { partnerSlug: 'gibt-es-nicht', titel: 'Unbekannt', start: { inTagen: 3 }, uhrzeit: '10:00' }, error: /Demo-Partner/ }
    ]
    for (const { entry, error } of cases) {
      const before = snapshot()
      areaSeed.TERMINE.push(entry)
      try {
        assert.throws(() => replaceDemoPack(db, uploadDir), error)
      } finally {
        areaSeed.TERMINE.pop()
      }
      assert.deepEqual(snapshot(), before, entry.titel)
    }
  })
})
