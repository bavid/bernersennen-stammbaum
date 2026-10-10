const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, createHousehold, getCookie } = require('./helpers')

// V-Fehler 3 (docs/superpowers/plans/2026-09-30-phase-v-freunde-partner-kalender.md): Freigabe-Verwaltung der
// Beiträge - Verlauf je Beitrag (promotion_events), Sammel-Freigabe, Ablehnungsgründe als Vorlagen, "zuletzt
// entschieden" und vertrauenswürdige Partner (partners.vertrauenswuerdig). Telegram ist ein Fake-Client (erfundene
// Zugangsdaten), nie das Netz. t.test() bleibt auf einer Ebene; POST /api/discover bleibt weit unter seinem Limit.
const ADMIN_TEST_PASSWORD = 'admin-test-promotion-freigabe-1'
const dataDir = useTempDataDir('promotion-freigabe', {
  LOGIN_RATE_LIMIT: '300',
  CODE_RATE_LIMIT: '300',
  TELEGRAM_BOT_TOKEN: '888888:FREIGABE-token_nur-fuer-tests-0000000',
  TELEGRAM_CHAT_ID: '-100777'
})

const PORTAL_TEXT = 'Kleine Gruppen, viel Geduld und jede Menge Leckerli – so arbeiten wir mit euren Hunden.'
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]) // Signatur + IEND
const EINGEREICHT_TEXT = '🐾 Ein Partner hat einen Beitrag eingereicht – bitte im Admin prüfen und freigeben.'
const VERTRAUENSWUERDIG_TEXT = '🐾 Ein Partner hat einen freigegebenen Beitrag geändert (vertrauenswürdig) – die Änderung ist schon online.'
const VORLAGEN = [
  'Gesundheitsversprechen',
  'Kennzeichnung unklar',
  'Bild passt nicht / Rechte unklar',
  'Link führt ins Leere',
  'Kein Bezug zu Tieren',
  'Sonstiges'
]

function samplePost(overrides = {}) {
  return { titel: 'Welpenkurs ab Oktober', text: 'Sechs Termine in kleiner Gruppe.', bereich: 'hundeschule', url: 'https://example.org/kurs', ...overrides }
}

const aktionen = (verlauf) => verlauf.map((event) => event.aktion)

test('Freigaben: Verlauf, Sammel-Freigabe, Begründungs-Vorlagen und vertrauenswürdige Partner', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
  const { setTelegramClientForTests } = require('../lib/telegram')
  const { flushNotificationsForTests } = require('../lib/notify')
  const sent = []
  const restoreClient = setTelegramClientForTests({
    sendMessage: async (message) => {
      sent.push(message)
      return { message_id: sent.length }
    }
  })
  const { server, base } = await startApp()
  t.after(() => {
    restoreClient()
    cleanup(dataDir, server)
  })
  const db = require('../db')

  const adminLogin = await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: ADMIN_TEST_PASSWORD } })
  const adminCookie = getCookie(adminLogin.res)
  const get = (urlPath, cookie) => call(base, urlPath, { cookie })
  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const put = (urlPath, body, cookie) => call(base, urlPath, { method: 'PUT', body, cookie })
  const del = (urlPath, cookie) => call(base, urlPath, { method: 'DELETE', cookie })
  assert.equal((await put('/api/admin/notify-settings', { beitrag: true }, adminCookie)).status, 200)

  const household = await createHousehold(base, 'Familie Freigabeleser')
  const approve = (id) => post(`/api/admin/promotions/${id}/freigeben`, undefined, adminCookie)
  const reject = (id, body) => post(`/api/admin/promotions/${id}/ablehnen`, body, adminCookie)
  const approveMany = (body, cookie = adminCookie) => post('/api/admin/promotions/freigeben', body, cookie)
  const adminVerlauf = (id, cookie = adminCookie) => get(`/api/admin/promotions/${id}/verlauf`, cookie)
  const ownPost = async (cookie, id) => (await get('/api/partner-area/posts', cookie)).data.find((item) => item.id === id)
  const promotionRow = (id) => db.prepare('SELECT * FROM promotions WHERE id = ?').get(id)
  const hundeschulTitel = async () =>
    (await post('/api/discover', {}, household.cookie)).data.hundeschulen
      .flatMap((card) => (card.kind === 'promotion' ? [card] : card.anzeigen || []))
      .map((card) => card.titel)

  async function newMessages(fn) {
    const before = sent.length
    const result = await fn()
    await flushNotificationsForTests()
    return { result, texts: sent.slice(before).map((message) => message.text) }
  }

  let counter = 0
  const partnerInput = (overrides = {}) => {
    counter += 1
    return { name: `Freigabe Partner ${counter}`, slug: `freigabe-partner-${counter}`, typ: 'hundeschule', plz: '10115', portalText: PORTAL_TEXT, status: 'aktiv', ...overrides }
  }
  async function createPartnerArea(overrides = {}) {
    const input = partnerInput(overrides)
    const partner = await post('/api/admin/partners', input, adminCookie)
    assert.equal(partner.status, 201)
    const area = await post(`/api/admin/partners/${partner.data.id}/area`, undefined, adminCookie)
    assert.equal(area.status, 201)
    const login = await post('/api/login', { secret: area.data.key })
    return { partner: partner.data, input, cookie: getCookie(login.res) }
  }

  async function uploadImage(cookie, id) {
    const form = new FormData()
    form.append('file', new Blob([PNG_BYTES], { type: 'image/png' }), 'bild.png')
    const res = await fetch(`${base}/api/partner-area/posts/${id}/image`, { method: 'POST', headers: { Cookie: cookie }, body: form })
    const text = await res.text()
    return { status: res.status, data: text ? JSON.parse(text) : null }
  }

  const school = await createPartnerArea()

  await t.test('Verlauf: Einreichen, Ändern während der Prüfung, Freigeben, erneut Einreichen, Ablehnen, neues Bild', async () => {
    const created = await post('/api/partner-area/posts', samplePost(), school.cookie)
    assert.equal(created.status, 201)
    assert.deepEqual(aktionen(created.data.verlauf), ['eingereicht'])
    const id = created.data.id
    const [first] = created.data.verlauf
    assert.deepEqual(Object.keys(first).sort(), ['aktion', 'createdAt', 'grund', 'id'])
    assert.equal(first.grund, null)
    assert.match(first.createdAt, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)

    const edited = await put(`/api/partner-area/posts/${id}`, samplePost({ text: 'Jetzt mit sieben Terminen.' }), school.cookie)
    assert.equal(edited.status, 200)
    assert.equal(edited.data.freigabe, 'eingereicht')
    assert.deepEqual(aktionen(edited.data.verlauf), ['eingereicht', 'geaendert'])

    assert.equal((await approve(id)).status, 200)
    assert.equal((await approve(id)).status, 200, 'erneutes Freigeben ist erlaubt ...')
    assert.deepEqual(aktionen((await adminVerlauf(id)).data), ['eingereicht', 'geaendert', 'freigegeben'], '... schreibt aber nichts Neues')

    const resubmitted = await put(`/api/partner-area/posts/${id}`, samplePost({ titel: 'Welpenkurs ab November' }), school.cookie)
    assert.equal(resubmitted.data.freigabe, 'eingereicht')
    assert.deepEqual(aktionen(resubmitted.data.verlauf), ['eingereicht', 'geaendert', 'freigegeben', 'eingereicht'])

    const rejected = await reject(id, { vorlage: 'Link führt ins Leere', text: 'Die Kursseite ist nicht erreichbar.' })
    assert.equal(rejected.status, 200)
    assert.equal(rejected.data.freigabe, 'abgelehnt')
    assert.equal(rejected.data.ablehnungsgrund, 'Link führt ins Leere – Die Kursseite ist nicht erreichbar.')
    const own = await ownPost(school.cookie, id)
    assert.equal(own.verlauf.at(-1).aktion, 'abgelehnt')
    assert.equal(own.verlauf.at(-1).grund, 'Link führt ins Leere – Die Kursseite ist nicht erreichbar.')

    const image = await uploadImage(school.cookie, id)
    assert.equal(image.status, 201)
    assert.equal(image.data.freigabe, 'eingereicht')
    assert.equal(image.data.ablehnungsgrund, null)
    assert.deepEqual(aktionen(image.data.verlauf), ['eingereicht', 'geaendert', 'freigegeben', 'eingereicht', 'abgelehnt', 'eingereicht'])

    const full = await adminVerlauf(id)
    assert.equal(full.status, 200)
    assert.deepEqual(full.data, (await ownPost(school.cookie, id)).verlauf, 'Admin und Partner sehen denselben Verlauf')
    assert.equal((await adminVerlauf(999999)).status, 404)
    assert.equal((await adminVerlauf('abc')).status, 404)
    assert.equal((await adminVerlauf(id, household.cookie)).status, 401)
  })

  await t.test('Verlauf beim Partner: höchstens die letzten 10, älteste zuerst; der Admin sieht alles', async () => {
    const created = await post('/api/partner-area/posts', samplePost({ titel: 'Viele Änderungen' }), school.cookie)
    const id = created.data.id
    for (let index = 1; index <= 11; index += 1) {
      const res = await put(`/api/partner-area/posts/${id}`, samplePost({ titel: 'Viele Änderungen', text: `Fassung ${index}` }), school.cookie)
      assert.equal(res.status, 200)
    }
    const own = await ownPost(school.cookie, id)
    assert.equal(own.verlauf.length, 10)
    assert.deepEqual(aktionen(own.verlauf), Array(10).fill('geaendert'))
    const ids = own.verlauf.map((event) => event.id)
    assert.deepEqual(ids, [...ids].sort((a, b) => a - b), 'älteste zuerst')
    const full = (await adminVerlauf(id)).data
    assert.equal(full.length, 12)
    assert.equal(full[0].aktion, 'eingereicht')
    assert.deepEqual(full.slice(-10), own.verlauf)
  })

  await t.test('Löschen nimmt den Verlauf mit', async () => {
    const created = await post('/api/partner-area/posts', samplePost({ titel: 'Gleich wieder weg' }), school.cookie)
    const id = created.data.id
    await approve(id)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM promotion_events WHERE promotion_id = ?').get(id).n, 2)
    assert.equal((await del(`/api/partner-area/posts/${id}`, school.cookie)).status, 204)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM promotion_events WHERE promotion_id = ?').get(id).n, 0)
  })

  await t.test('Ablehnungsgründe: Vorlage mit optionalem Text, "Sonstiges" braucht Text, freier Grund geht weiter', async () => {
    const { ABLEHNUNG_VORLAGEN } = require('../lib/promotionFreigabe')
    assert.deepEqual(ABLEHNUNG_VORLAGEN, VORLAGEN)
    const id = (await post('/api/partner-area/posts', samplePost({ titel: 'Prüfling' }), school.cookie)).data.id

    const onlyTemplate = await reject(id, { vorlage: 'Kennzeichnung unklar' })
    assert.equal(onlyTemplate.status, 200)
    assert.equal(onlyTemplate.data.ablehnungsgrund, 'Kennzeichnung unklar')
    const blankText = await reject(id, { vorlage: 'Gesundheitsversprechen', text: '   ' })
    assert.equal(blankText.data.ablehnungsgrund, 'Gesundheitsversprechen')
    const other = await reject(id, { vorlage: 'Sonstiges', text: '  Bitte den Zeitraum ergänzen.\u0007 ' })
    assert.equal(other.data.ablehnungsgrund, 'Bitte den Zeitraum ergänzen.')

    const invalid = [
      { vorlage: 'Sonstiges' },
      { vorlage: 'Sonstiges', text: '   ' },
      { vorlage: 'Gibt es nicht' },
      { vorlage: 42 },
      { vorlage: 'Kein Bezug zu Tieren', text: 'x'.repeat(300) },
      { vorlage: 'Kein Bezug zu Tieren', text: 17 },
      {}
    ]
    for (const body of invalid) {
      const res = await reject(id, body)
      assert.equal(res.status, 400, JSON.stringify(body).slice(0, 60))
      assert.ok(res.data.error)
    }
    assert.equal(promotionRow(id).ablehnungsgrund, 'Bitte den Zeitraum ergänzen.', 'eine ungültige Ablehnung ändert nichts')

    const free = await reject(id, { grund: 'Bitte ohne Preisangabe im Titel' })
    assert.equal(free.data.ablehnungsgrund, 'Bitte ohne Preisangabe im Titel')
    const verlauf = (await adminVerlauf(id)).data.filter((event) => event.aktion === 'abgelehnt')
    assert.deepEqual(
      verlauf.map((event) => event.grund),
      ['Kennzeichnung unklar', 'Gesundheitsversprechen', 'Bitte den Zeitraum ergänzen.', 'Bitte ohne Preisangabe im Titel']
    )
  })

  await t.test('Sammel-Freigabe: nur eingereichte, in einer Transaktion, mit Zählung', async () => {
    const make = async (titel) => (await post('/api/partner-area/posts', samplePost({ titel }), school.cookie)).data.id
    const a = await make('Sammel A')
    const b = await make('Sammel B')
    const c = await make('Sammel C')
    const d = await make('Sammel D')
    await approve(c)
    await reject(d, { vorlage: 'Kennzeichnung unklar' })
    const eventsBefore = (id) => db.prepare('SELECT COUNT(*) AS n FROM promotion_events WHERE promotion_id = ?').get(id).n
    const cEvents = eventsBefore(c)

    const res = await approveMany({ ids: [a, b, c, d, 999999, a, String(b)] })
    assert.equal(res.status, 200)
    assert.deepEqual(res.data, { freigegeben: 2, uebersprungen: 3, ids: [a, b] })
    assert.equal(promotionRow(a).freigabe, 'freigegeben')
    assert.equal(promotionRow(b).freigabe, 'freigegeben')
    assert.equal(promotionRow(d).freigabe, 'abgelehnt', 'abgelehnte bleiben abgelehnt')
    assert.equal(promotionRow(d).ablehnungsgrund, 'Kennzeichnung unklar')
    assert.deepEqual(aktionen((await adminVerlauf(a)).data), ['eingereicht', 'freigegeben'])
    assert.equal(eventsBefore(c), cEvents, 'schon freigegebene bekommen keinen neuen Eintrag')

    const invalid = [{}, { ids: [] }, { ids: 'alle' }, { ids: [1.5] }, { ids: [0] }, { ids: [null] }, { ids: Array.from({ length: 51 }, (_, i) => i + 1) }]
    for (const body of invalid) assert.equal((await approveMany(body)).status, 400, JSON.stringify(body).slice(0, 40))
    assert.equal((await approveMany({ ids: Array.from({ length: 50 }, (_, i) => i + 900000) })).data.freigegeben, 0, '50 sind erlaubt')
    assert.equal((await approveMany({ ids: [a] }, household.cookie)).status, 401)
  })

  await t.test('Zuletzt entschieden: freigegebene und abgelehnte Beiträge der Partner, neueste Entscheidung zuerst', async () => {
    const make = async (titel) => (await post('/api/partner-area/posts', samplePost({ titel }), school.cookie)).data.id
    const first = await make('Entschieden zuerst')
    const second = await make('Entschieden danach')
    const pending = await make('Noch offen')
    await approve(first)
    await reject(second, { vorlage: 'Gesundheitsversprechen' })

    const res = await get('/api/admin/promotions/entschieden', adminCookie)
    assert.equal(res.status, 200)
    assert.ok(res.data.length <= 30)
    const ids = res.data.map((row) => row.id)
    assert.ok(!ids.includes(pending), 'eingereichte stehen nicht hier')
    assert.ok(ids.indexOf(second) < ids.indexOf(first), 'neueste Entscheidung zuerst')
    const rejected = res.data.find((row) => row.id === second)
    assert.equal(rejected.entscheidung, 'abgelehnt')
    assert.equal(rejected.ablehnungsgrund, 'Gesundheitsversprechen')
    assert.equal(rejected.partnerName, school.partner.name)
    assert.equal(rejected.erstelltVonPartner, true)
    assert.match(rejected.entschiedenAt, /^\d{4}-\d{2}-\d{2} /)
    assert.equal(res.data.find((row) => row.id === first).entscheidung, 'freigegeben')
    for (const row of res.data) assert.equal(row.freigabe, row.entscheidung)

    // Reicht der Partner danach erneut ein, wartet der Beitrag wieder - und steht nicht mehr unter "entschieden".
    await put(`/api/partner-area/posts/${first}`, samplePost({ titel: 'Entschieden zuerst, geändert' }), school.cookie)
    assert.ok(!(await get('/api/admin/promotions/entschieden', adminCookie)).data.some((row) => row.id === first))
    assert.equal((await get('/api/admin/promotions/entschieden', household.cookie)).status, 401)
  })

  let trusted
  await t.test('Vertrauenswürdig: nur der Admin setzt den Schalter, mit Protokoll; der Partner sieht ihn in /api/me', async () => {
    trusted = await createPartnerArea()
    const listed = (await get('/api/admin/partners', adminCookie)).data.find((row) => row.id === trusted.partner.id)
    assert.equal(listed.vertrauenswuerdig, 0)
    assert.equal(trusted.partner.vertrauenswuerdig, 0)

    const wrongType = await put(`/api/admin/partners/${trusted.partner.id}`, { ...trusted.input, vertrauenswuerdig: 'ja' }, adminCookie)
    assert.equal(wrongType.status, 400)
    const own = await put('/api/partner-area/profile', { vertrauenswuerdig: true }, trusted.cookie)
    assert.equal(own.status, 400, 'der Partner selbst kann sich nicht vertrauenswürdig machen')

    const switched = await put(`/api/admin/partners/${trusted.partner.id}`, { ...trusted.input, vertrauenswuerdig: true }, adminCookie)
    assert.equal(switched.status, 200)
    assert.equal(switched.data.vertrauenswuerdig, 1)
    const kept = await put(`/api/admin/partners/${trusted.partner.id}`, { ...trusted.input, portalText: `${PORTAL_TEXT} Neu.` }, adminCookie)
    assert.equal(kept.data.vertrauenswuerdig, 1, 'ohne das Feld bleibt der Schalter')

    const log = (await get('/api/admin/log', adminCookie)).data
    const entries = log.filter((entry) => entry.ziel === `partner:${trusted.partner.id}`)
    assert.deepEqual(entries.map((entry) => entry.aktion), ['partner-vertrauenswuerdig'], 'nur die echte Änderung steht im Protokoll')

    assert.equal((await get('/api/me', trusted.cookie)).data.partner.vertrauenswuerdig, true)
    assert.equal((await get('/api/me', school.cookie)).data.partner.vertrauenswuerdig, false)
  })

  await t.test('Vertrauenswürdig: Änderungen an freigegebenen Beiträgen bleiben online, neue brauchen weiter die Freigabe', async () => {
    const body = samplePost({ titel: 'Vertrauenskurs', url: undefined })
    const created = await newMessages(() => post('/api/partner-area/posts', body, trusted.cookie))
    assert.equal(created.result.data.freigabe, 'eingereicht', 'neue Beiträge brauchen die Freigabe')
    assert.deepEqual(created.texts, [EINGEREICHT_TEXT])
    const id = created.result.data.id

    const whilePending = await newMessages(() => put(`/api/partner-area/posts/${id}`, { ...body, text: 'Noch in Prüfung geändert.' }, trusted.cookie))
    assert.equal(whilePending.result.data.freigabe, 'eingereicht', 'liegt er noch zur Prüfung, bleibt er dort')
    assert.deepEqual(whilePending.texts, [])

    await approve(id)
    const live = await newMessages(() => put(`/api/partner-area/posts/${id}`, { ...body, titel: 'Vertrauenskurs, neu' }, trusted.cookie))
    assert.equal(live.result.status, 200)
    assert.equal(live.result.data.freigabe, 'freigegeben')
    assert.equal(live.result.data.verlauf.at(-1).aktion, 'geaendert')
    assert.deepEqual(live.texts, [VERTRAUENSWUERDIG_TEXT])
    const titles = await hundeschulTitel()
    assert.ok(titles.includes('Vertrauenskurs, neu'), 'die Änderung ist sofort in Entdecken')

    const image = await newMessages(() => uploadImage(trusted.cookie, id))
    assert.equal(image.result.status, 201)
    assert.equal(image.result.data.freigabe, 'freigegeben')
    assert.equal(image.result.data.verlauf.at(-1).aktion, 'geaendert')
    assert.deepEqual(image.texts, [VERTRAUENSWUERDIG_TEXT])

    await put('/api/admin/notify-settings', { beitrag: false }, adminCookie)
    const quiet = await newMessages(() => put(`/api/partner-area/posts/${id}`, { ...body, titel: 'Vertrauenskurs, leise' }, trusted.cookie))
    assert.equal(quiet.result.data.freigabe, 'freigegeben')
    assert.deepEqual(quiet.texts, [], 'nur mit eingeschalteter Beitrags-Benachrichtigung')
    await put('/api/admin/notify-settings', { beitrag: true }, adminCookie)

    await reject(id, { vorlage: 'Bild passt nicht / Rechte unklar' })
    const afterReject = await put(`/api/partner-area/posts/${id}`, { ...body, titel: 'Vertrauenskurs, überarbeitet' }, trusted.cookie)
    assert.equal(afterReject.data.freigabe, 'eingereicht', 'ein abgelehnter Beitrag muss wieder geprüft werden')
    assert.equal(afterReject.data.ablehnungsgrund, null)
    assert.equal(afterReject.data.verlauf.at(-1).aktion, 'eingereicht')

    await approve(id)
    await put(`/api/admin/partners/${trusted.partner.id}`, { ...trusted.input, vertrauenswuerdig: false }, adminCookie)
    const untrusted = await put(`/api/partner-area/posts/${id}`, { ...body, titel: 'Vertrauenskurs, wieder geprüft' }, trusted.cookie)
    assert.equal(untrusted.data.freigabe, 'eingereicht', 'ohne den Schalter wird wieder geprüft')

    // Ein langsamer Bild-Upload trägt noch den Partner vom Anfang der Anfrage (vertrauenswürdig) - entschieden wird
    // trotzdem nach dem frisch gelesenen Schalter.
    const { applyPartnerEdit } = require('../lib/partnerPosts')
    await approve(id)
    const staleOutcome = applyPartnerEdit({ ...trusted.partner, vertrauenswuerdig: 1 }, id)
    assert.equal(staleOutcome.live, false)
    assert.equal(promotionRow(id).freigabe, 'eingereicht')
    const log = (await get('/api/admin/log', adminCookie)).data.filter((entry) => entry.ziel === `partner:${trusted.partner.id}`)
    assert.deepEqual(log.map((entry) => entry.aktion), ['partner-nicht-vertrauenswuerdig', 'partner-vertrauenswuerdig'])
  })
})
