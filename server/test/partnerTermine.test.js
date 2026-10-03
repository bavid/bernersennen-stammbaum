const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, createHousehold, getCookie } = require('./helpers')
const { addDays, addYears, berlinNow } = require('../lib/terminSerien')

// Phase V4a: Kalender der Partner (/api/partner-area/termine) - Termine mit Serien und Absagen, ohne Freigabe online,
// öffentlich auf dem Portal (termine), als "Nächster Termin" auf der Karte in "Entdecken", in der Kundensicht und im
// Admin (ausblenden, löschen, Protokoll). Daten relativ zu heute (Berliner Ortszeit), damit der Test nie veraltet.
// t.test() bleibt auf einer Ebene. POST /api/discover und /preview/discover teilen sich ein Limit von 30 Anfragen je IP.
const ADMIN_TEST_PASSWORD = 'admin-test-partner-termine-1'
const dataDir = useTempDataDir('partner-termine', { LOGIN_RATE_LIMIT: '300', CODE_RATE_LIMIT: '300' })

const PORTAL_TEXT = 'Kleine Gruppen, viel Geduld und jede Menge Leckerli – so arbeiten wir mit euren Hunden.'
const today = berlinNow().datum
const inDays = (days) => addDays(today, days)

function sampleTermin(overrides = {}) {
  return { titel: 'Welpenspielstunde', text: 'Für Welpen bis 16 Wochen.', ort: 'Trainingsplatz am Deich', datum: inDays(7), uhrzeit: '10:00', ende: '11:00', ...overrides }
}

test('Partner-Kalender: Termine, Serien, Absagen und wo sie erscheinen', async (t) => {
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

  let counter = 0
  async function createPartnerArea(overrides = {}) {
    counter += 1
    const input = { name: `Termin Partner ${counter}`, slug: `termin-partner-${counter}`, typ: 'hundeschule', plz: '10115', portalText: PORTAL_TEXT, status: 'aktiv', ...overrides }
    const partner = await post('/api/admin/partners', input, adminCookie)
    assert.equal(partner.status, 201)
    const area = await post(`/api/admin/partners/${partner.data.id}/area`, undefined, adminCookie)
    assert.equal(area.status, 201)
    const login = await post('/api/login', { secret: area.data.key })
    return { partner: partner.data, cookie: getCookie(login.res), familyId: area.data.familyId }
  }

  const schule = await createPartnerArea()
  const createTermin = (body, cookie = schule.cookie) => post('/api/partner-area/termine', body, cookie)
  const termineOf = async (cookie = schule.cookie) => (await get('/api/partner-area/termine', cookie)).data

  await t.test('ohne Anmeldung im Partner-Bereich kein Kalender', async () => {
    assert.equal((await get('/api/partner-area/termine')).status, 401)
    const household = await createHousehold(base, 'Familie Ohne Kalender')
    assert.equal((await get('/api/partner-area/termine', household.cookie)).status, 403)
  })

  await t.test('leer: höchstens 50, noch keine Termine', async () => {
    const data = await termineOf()
    assert.equal(data.max, 50)
    assert.equal(data.heute, today)
    assert.deepEqual(data.termine, [])
    assert.deepEqual(data.vorkommen, [])
  })

  await t.test('einzelner Termin: angelegt, gesäubert, sofort in der Übersicht', async () => {
    const res = await createTermin(sampleTermin({ titel: '  Erste-Hilfe-Kurs am Hund ‮', serie: 'keine', serieBis: inDays(30) }))
    assert.equal(res.status, 201)
    assert.equal(res.data.termin.titel, 'Erste-Hilfe-Kurs am Hund')
    assert.equal(res.data.termin.serie, 'keine')
    assert.equal(res.data.termin.serieBis, null, 'ein einzelner Termin hat kein Serien-Ende')
    assert.equal(res.data.termin.ausgeblendet, false)
    assert.deepEqual(res.data.termin.absagen, [])
    assert.equal(res.data.termine.length, 1)
    assert.deepEqual(
      res.data.vorkommen.map(({ datum, uhrzeit, ende, titel, ort, abgesagt }) => ({ datum, uhrzeit, ende, titel, ort, abgesagt })),
      [{ datum: inDays(7), uhrzeit: '10:00', ende: '11:00', titel: 'Erste-Hilfe-Kurs am Hund', ort: 'Trainingsplatz am Deich', abgesagt: false }]
    )
    assert.equal(res.data.vorkommen[0].terminId, res.data.termin.id)
  })

  await t.test('Prüfung: Pflichtfelder, Längen, Uhrzeiten, Daten, reiner Text', async () => {
    const cases = [
      [{ titel: '' }, 'Der Titel ist Pflicht'],
      [{ titel: 'x'.repeat(81) }, 'Der Titel darf höchstens 80 Zeichen haben'],
      [{ text: 'x'.repeat(501) }, 'Der Text darf höchstens 500 Zeichen haben'],
      [{ ort: 'x'.repeat(121) }, 'Der Ort darf höchstens 120 Zeichen haben'],
      [{ titel: '<b>Kurs</b>' }, 'Termine dürfen nur reinen Text enthalten (kein HTML, keine Links).'],
      [{ text: 'Mehr unter https://example.org/kurs' }, 'Termine dürfen nur reinen Text enthalten (kein HTML, keine Links).'],
      [{ ort: 'www.example.org' }, 'Termine dürfen nur reinen Text enthalten (kein HTML, keine Links).'],
      [{ datum: '2026-02-30' }, 'Bitte ein gültiges Datum angeben (JJJJ-MM-TT).'],
      [{ datum: inDays(-1) }, 'Der Termin liegt in der Vergangenheit.'],
      [{ datum: addDays(addYears(today, 1), 1) }, 'Termine höchstens ein Jahr im Voraus.'],
      [{ text: 'Infos auf hundeschule-beispiel.de' }, 'Termine dürfen nur reinen Text enthalten (kein HTML, keine Links).'],
      [{ ort: 'mailto:kurs@example.org' }, 'Termine dürfen nur reinen Text enthalten (kein HTML, keine Links).'],
      [{ uhrzeit: '' }, 'Bitte eine Uhrzeit angeben (HH:MM).'],
      [{ uhrzeit: '24:00' }, 'Bitte eine Uhrzeit angeben (HH:MM).'],
      [{ ende: '9:5' }, 'Das Ende bitte als Uhrzeit angeben (HH:MM).'],
      [{ ende: '10:00' }, 'Das Ende muss nach dem Beginn liegen.'],
      [{ serie: 'taeglich' }, 'Bitte eine der vorgegebenen Wiederholungen wählen.'],
      [{ serie: 'woechentlich', serieBis: inDays(6) }, 'Die Serie darf nicht vor dem ersten Termin enden.'],
      [{ serie: 'woechentlich', serieBis: addDays(addYears(inDays(7), 1), 1) }, 'Eine Serie läuft höchstens ein Jahr.'],
      [{ serie: 'woechentlich', serieBis: 'bald' }, 'Bitte ein gültiges Datum angeben (JJJJ-MM-TT).']
    ]
    for (const [overrides, message] of cases) {
      const res = await createTermin(sampleTermin(overrides))
      assert.equal(res.status, 400, JSON.stringify(overrides))
      assert.equal(res.data.error, message, JSON.stringify(overrides))
    }
    assert.equal((await termineOf()).termine.length, 1, 'nichts davon wurde gespeichert')
  })

  let serieId
  await t.test('Serie: wöchentlich, ohne Ende ein Jahr lang', async () => {
    const res = await createTermin(sampleTermin({ titel: 'Welpenspielstunde', datum: inDays(2), serie: 'woechentlich' }))
    assert.equal(res.status, 201)
    serieId = res.data.termin.id
    assert.equal(res.data.termin.serieBis, addYears(inDays(2), 1))
    // Die Übersicht zeigt die nächsten zwölf Monate - das Ende der Serie liegt zwei Tage dahinter.
    const own = res.data.vorkommen.filter((item) => item.terminId === serieId)
    assert.equal(own.at(-1).datum <= addYears(today, 1), true)
    assert.equal(addDays(own.at(-1).datum, 7) > addYears(today, 1), true)
    assert.equal(own[1].datum, inDays(9))
    assert.ok(own.every((item) => item.serie === 'woechentlich' && item.abgesagt === false))
  })

  await t.test('absagen und wieder stattfinden lassen - nur echte, kommende Termine', async () => {
    const absagen = (datum, id = serieId) => post(`/api/partner-area/termine/${id}/absagen`, { datum }, schule.cookie)
    const cancelled = await absagen(inDays(9))
    assert.equal(cancelled.status, 200)
    assert.deepEqual(cancelled.data.termin.absagen, [inDays(9)])
    const item = cancelled.data.vorkommen.find((entry) => entry.terminId === serieId && entry.datum === inDays(9))
    assert.equal(item.abgesagt, true)
    assert.equal((await absagen(inDays(9))).status, 200, 'doppelt absagen schadet nicht')

    assert.equal((await absagen(inDays(10))).status, 400, 'kein Termin der Serie')
    assert.equal((await absagen('kein-datum')).status, 400)
    assert.equal((await absagen(inDays(9), 999999)).status, 404)

    const back = await del(`/api/partner-area/termine/${serieId}/absagen/${inDays(9)}`, schule.cookie)
    assert.equal(back.status, 200)
    assert.deepEqual(back.data.termin.absagen, [])
    assert.equal((await del(`/api/partner-area/termine/${serieId}/absagen/kein-datum`, schule.cookie)).status, 400)
  })

  await t.test('ganze Serie bearbeiten: Absagen außerhalb der neuen Serie verschwinden', async () => {
    await post(`/api/partner-area/termine/${serieId}/absagen`, { datum: inDays(9) }, schule.cookie)
    await post(`/api/partner-area/termine/${serieId}/absagen`, { datum: inDays(23) }, schule.cookie)
    const res = await put(`/api/partner-area/termine/${serieId}`, sampleTermin({ titel: 'Welpenspielstunde (neu)', datum: inDays(2), serie: 'zweiwoechentlich', serieBis: inDays(60), uhrzeit: '10:30', ende: null }), schule.cookie)
    assert.equal(res.status, 200)
    assert.equal(res.data.termin.titel, 'Welpenspielstunde (neu)')
    assert.equal(res.data.termin.ende, null)
    // Alle zwei Wochen ab inDays(2): inDays(16), inDays(30) … - inDays(9) und inDays(23) sind keine Termine mehr.
    assert.deepEqual(res.data.termin.absagen, [])
    const own = res.data.vorkommen.filter((item) => item.terminId === serieId).map((item) => item.datum)
    assert.deepEqual(own, [2, 16, 30, 44, 58].map(inDays))

    await post(`/api/partner-area/termine/${serieId}/absagen`, { datum: inDays(16) }, schule.cookie)
    const kept = await put(`/api/partner-area/termine/${serieId}`, sampleTermin({ titel: 'Welpenspielstunde', datum: inDays(2), serie: 'zweiwoechentlich', serieBis: inDays(60) }), schule.cookie)
    assert.deepEqual(kept.data.termin.absagen, [inDays(16)], 'eine Absage, die weiter passt, bleibt')
  })

  await t.test('eine laufende Serie mit erstem Termin in der Vergangenheit lässt sich weiter bearbeiten', async () => {
    db.prepare('UPDATE partner_termine SET datum = ?, serie_bis = ? WHERE id = ?').run(inDays(-12), inDays(60), serieId)
    const unchanged = await put(`/api/partner-area/termine/${serieId}`, sampleTermin({ datum: inDays(-12), serie: 'zweiwoechentlich', serieBis: inDays(60) }), schule.cookie)
    assert.equal(unchanged.status, 200)
    const moved = await put(`/api/partner-area/termine/${serieId}`, sampleTermin({ datum: inDays(-5), serie: 'zweiwoechentlich', serieBis: inDays(60) }), schule.cookie)
    assert.equal(moved.status, 400)
    assert.equal(moved.data.error, 'Der Termin liegt in der Vergangenheit.')
    await put(`/api/partner-area/termine/${serieId}`, sampleTermin({ datum: inDays(2), serie: 'zweiwoechentlich', serieBis: inDays(60) }), schule.cookie)
  })

  await t.test('nur eigene Termine: fremde sind 404', async () => {
    const other = await createPartnerArea({ name: 'Fremde Hundeschule', slug: 'fremde-hundeschule' })
    assert.equal((await put(`/api/partner-area/termine/${serieId}`, sampleTermin(), other.cookie)).status, 404)
    assert.equal((await del(`/api/partner-area/termine/${serieId}`, other.cookie)).status, 404)
    assert.equal((await post(`/api/partner-area/termine/${serieId}/absagen`, { datum: inDays(16) }, other.cookie)).status, 404)
    assert.equal((await del(`/api/partner-area/termine/${serieId}/absagen/${inDays(16)}`, other.cookie)).status, 404)
    assert.deepEqual((await termineOf(other.cookie)).termine, [])
  })

  await t.test('höchstens 50 Termine je Partner - eine Serie zählt als einer', async () => {
    const voll = await createPartnerArea({ name: 'Volle Hundeschule', slug: 'volle-hundeschule' })
    const insert = db.prepare("INSERT INTO partner_termine (partner_id, titel, datum, uhrzeit, serie) VALUES (?, 'Kurs', ?, '09:00', 'keine')")
    for (let i = 0; i < 49; i += 1) insert.run(voll.partner.id, inDays(3))
    assert.equal((await createTermin(sampleTermin(), voll.cookie)).status, 201)
    const full = await createTermin(sampleTermin(), voll.cookie)
    assert.equal(full.status, 409)
    assert.equal(full.data.error, 'Höchstens 50 Termine – bitte ältere löschen.')
  })

  await t.test('Portal: kommende Termine mit Absagen, ausgeblendete fehlen', async () => {
    await post(`/api/partner-area/termine/${serieId}/absagen`, { datum: inDays(30) }, schule.cookie)
    const portal = await get(`/api/public/partners/${schule.partner.slug}`)
    assert.equal(portal.status, 200)
    const termine = portal.data.termine
    assert.ok(Array.isArray(termine))
    assert.deepEqual(termine.slice(0, 2).map((item) => [item.titel, item.datum]), [['Welpenspielstunde', inDays(2)], ['Erste-Hilfe-Kurs am Hund', inDays(7)]])
    const cancelled = termine.find((item) => item.terminId === serieId && item.datum === inDays(30))
    assert.equal(cancelled.abgesagt, true)
    assert.deepEqual(Object.keys(cancelled).sort(), ['abgesagt', 'datum', 'ende', 'ort', 'serie', 'terminId', 'text', 'titel', 'uhrzeit'])

    db.prepare('UPDATE partner_termine SET ausgeblendet = 1 WHERE id = ?').run(serieId)
    const hidden = await get(`/api/public/partners/${schule.partner.slug}`)
    assert.ok(hidden.data.termine.every((item) => item.terminId !== serieId))
    const own = await termineOf()
    assert.equal(own.termine.find((item) => item.id === serieId).ausgeblendet, true, 'der Partner sieht ihn weiter, markiert')
    db.prepare('UPDATE partner_termine SET ausgeblendet = 0 WHERE id = ?').run(serieId)
  })

  await t.test('Portal: vergangene Termine fehlen, ein Termin von heute bleibt bis zu seinem Ende', async () => {
    const pastId = db.prepare("INSERT INTO partner_termine (partner_id, titel, datum, uhrzeit, serie) VALUES (?, 'Gestern', ?, '09:00', 'keine')").run(schule.partner.id, inDays(-1)).lastInsertRowid
    const todayId = db.prepare("INSERT INTO partner_termine (partner_id, titel, datum, uhrzeit, ende, serie) VALUES (?, 'Heute', ?, '00:00', '23:59', 'keine')").run(schule.partner.id, today).lastInsertRowid
    const termine = (await get(`/api/public/partners/${schule.partner.slug}`)).data.termine
    assert.ok(termine.every((item) => item.terminId !== Number(pastId)))
    assert.equal(termine[0].terminId, Number(todayId))
    db.prepare('DELETE FROM partner_termine WHERE id IN (?, ?)').run(pastId, todayId)
  })

  await t.test('Entdecken: "Nächster Termin" auf der Partner-Karte, abgesagte übersprungen', async () => {
    await post(`/api/partner-area/termine/${serieId}/absagen`, { datum: inDays(2) }, schule.cookie)
    const household = await createHousehold(base, 'Familie Kalenderleser')
    const discover = await post('/api/discover', {}, household.cookie)
    assert.equal(discover.status, 200)
    const card = discover.data.hundeschulen.find((item) => item.kind === 'partner' && item.id === schule.partner.id)
    assert.deepEqual(card.naechsterTermin, { datum: inDays(7), uhrzeit: '10:00', ende: '11:00', titel: 'Erste-Hilfe-Kurs am Hund', ort: 'Trainingsplatz am Deich' })
    const other = discover.data.hundeschulen.find((item) => item.kind === 'partner' && item.slug === 'fremde-hundeschule')
    assert.equal(other.naechsterTermin, null)
  })

  await t.test('Kundensicht: Portal mit Terminen und die eigene Karte mit dem nächsten Termin', async () => {
    const portal = await get('/api/partner-area/preview/portal', schule.cookie)
    assert.equal(portal.status, 200)
    assert.ok(portal.data.termine.some((item) => item.titel === 'Erste-Hilfe-Kurs am Hund'))
    const preview = await post('/api/partner-area/preview/discover', {}, schule.cookie)
    assert.equal(preview.status, 200)
    const own = preview.data.hundeschulen.find((item) => item.vorschau === true && item.kind === 'partner')
    assert.equal(own.naechsterTermin.titel, 'Erste-Hilfe-Kurs am Hund')
  })

  await t.test('Admin: Termine eines Partners, ausblenden und löschen - mit Protokoll', async () => {
    assert.equal((await get(`/api/admin/termine?partnerId=${schule.partner.id}`)).status, 401)
    const list = await get(`/api/admin/termine?partnerId=${schule.partner.id}`, adminCookie)
    assert.equal(list.status, 200)
    assert.deepEqual(list.data.map((item) => item.titel).sort(), ['Erste-Hilfe-Kurs am Hund', 'Welpenspielstunde'])
    assert.equal((await get('/api/admin/termine?partnerId=abc', adminCookie)).status, 400)

    const hidden = await post(`/api/admin/termine/${serieId}/ausblenden`, { ausgeblendet: true }, adminCookie)
    assert.equal(hidden.status, 200)
    assert.equal(hidden.data.ausgeblendet, true)
    assert.equal((await post(`/api/admin/termine/${serieId}/ausblenden`, { ausgeblendet: 'ja' }, adminCookie)).status, 400)
    assert.equal((await post('/api/admin/termine/999999/ausblenden', { ausgeblendet: true }, adminCookie)).status, 404)

    // Der Partner kann einen ausgeblendeten Termin bearbeiten, aber nicht wieder einblenden.
    const edited = await put(`/api/partner-area/termine/${serieId}`, sampleTermin({ datum: inDays(2), serie: 'zweiwoechentlich', serieBis: inDays(60), ausgeblendet: false }), schule.cookie)
    assert.equal(edited.data.termin.ausgeblendet, true)

    const erste = list.data.find((item) => item.titel === 'Erste-Hilfe-Kurs am Hund')
    assert.equal((await del(`/api/admin/termine/${erste.id}`, adminCookie)).status, 204)
    assert.equal((await del(`/api/admin/termine/${erste.id}`, adminCookie)).status, 404)
    assert.ok((await termineOf()).termine.every((item) => item.id !== erste.id))

    const log = await get('/api/admin/log', adminCookie)
    const aktionen = log.data.map((row) => `${row.aktion} ${row.ziel}`)
    assert.ok(aktionen.includes(`termin-ausgeblendet termin:${serieId}`))
    assert.ok(aktionen.includes(`termin-geloescht termin:${erste.id}`))
    await post(`/api/admin/termine/${serieId}/ausblenden`, { ausgeblendet: false }, adminCookie)
    assert.ok((await get('/api/admin/log', adminCookie)).data.some((row) => row.aktion === 'termin-eingeblendet'))
  })

  await t.test('Termin löschen nimmt seine Absagen mit', async () => {
    const res = await del(`/api/partner-area/termine/${serieId}`, schule.cookie)
    assert.equal(res.status, 200)
    assert.ok(res.data.termine.every((item) => item.id !== serieId))
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM partner_termin_absagen WHERE termin_id = ?').get(serieId).n, 0)
    assert.equal((await del(`/api/partner-area/termine/${serieId}`, schule.cookie)).status, 404)
  })

  await t.test('Tierheime haben denselben Kalender', async () => {
    const tierheim = await createPartnerArea({ name: 'Tierheim Kalenderhof', slug: 'tierheim-kalenderhof', typ: 'tierheim' })
    const res = await createTermin(sampleTermin({ titel: 'Tag der offenen Tür', serie: 'monatlich_wochentag' }), tierheim.cookie)
    assert.equal(res.status, 201)
    assert.equal(res.data.termin.serie, 'monatlich_wochentag')
  })

  await t.test('Demo-Sitzungen lesen nur', async () => {
    const demo = await createPartnerArea({ name: 'Demo Kalenderschule', slug: 'demo-kalenderschule' })
    db.prepare('UPDATE families SET is_demo = 1 WHERE id = ?').run(demo.familyId)
    assert.equal((await get('/api/partner-area/termine', demo.cookie)).status, 200)
    assert.equal((await createTermin(sampleTermin(), demo.cookie)).status, 403)
  })
})
