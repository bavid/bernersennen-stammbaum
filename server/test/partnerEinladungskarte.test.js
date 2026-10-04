const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, getCookie } = require('./helpers')

// Feedback-Runde: Karten als Kombination (/api/partner-area/visitenkarte) - EINE Gestaltung der Vorderseite für
// Visitenkarte, Einladungskarte und Kombi, die gewählte Kombination (karte) wird mit ihr gespeichert. Frühere getrennte
// Gestaltungen (partner_visitenkarte mit Gutschein-Schalter, partner_einladungskarte mit persönlicher Zeile) werden beim
// Lesen zusammengeführt und beim Speichern ersetzt. Die Rückseite der Plattform kommt nur lesend mit, die Codes über
// denselben Abruf (POST /gutscheine). Demo und Admin-Ansicht lesen nur. t.test() bleibt auf einer Ebene. Namen erfunden.
const ADMIN_TEST_PASSWORD = 'admin-test-karten-kombi-1'
const dataDir = useTempDataDir('partner-karten-kombi', { LOGIN_RATE_LIMIT: '300', CODE_RATE_LIMIT: '300' })

const KOMBI = Object.freeze({
  karte: 'kombi',
  vorlage: 'schlicht',
  farbe: '#2F6B3F',
  kurztext: 'Gemeinsam lernen auf der Wiese',
  widmung: 'Für unsere Welpenkurs-Familien',
  zeigeAnsprechperson: true,
  zeigeWebsite: true,
  zeigeTelefon: true,
  zeigeEmail: false
})
const OLD_VISITENKARTE = Object.freeze({
  vorlage: 'foto',
  farbe: '#1f5f8b',
  kurztext: 'Training mit Herz',
  zeigeAnsprechperson: false,
  zeigeWebsite: true,
  zeigeTelefon: false,
  zeigeEmail: true,
  mitGutschein: true
})
const OLD_EINLADUNG = Object.freeze({
  vorlage: 'klassisch',
  farbe: '#2f6b3f',
  kurztext: 'Gemeinsam lernen',
  widmung: 'Für unsere Kursfamilien',
  zeigeAnsprechperson: true,
  zeigeWebsite: true,
  zeigeTelefon: true,
  zeigeEmail: false
})

test('Partner-Bereich: Karten als Kombination - Gestaltung, Zusammenführung, Rückseite und Codes', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const config = require('../config')
  const { replaceDemoPack } = require('../lib/demoPack')
  const { VORGABEN } = require('../lib/einladungRueckseite')
  replaceDemoPack(db, config.uploadDir)

  const adminLogin = await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: ADMIN_TEST_PASSWORD } })
  const adminCookie = getCookie(adminLogin.res)
  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const put = (urlPath, body, cookie) => call(base, urlPath, { method: 'PUT', body, cookie })
  const getState = (cookie) => call(base, '/api/partner-area/visitenkarte', { cookie })
  const save = (body, cookie) => put('/api/partner-area/visitenkarte', body, cookie)
  const takeCodes = (body, cookie) => post('/api/partner-area/visitenkarte/gutscheine', body, cookie)
  const legacyRows = (partnerId) => ({
    visitenkarte: db.prepare('SELECT design FROM partner_visitenkarte WHERE partner_id = ?').get(partnerId)?.design ?? null,
    einladung: db.prepare('SELECT design FROM partner_einladungskarte WHERE partner_id = ?').get(partnerId)?.design ?? null
  })

  async function createPartnerArea(input) {
    const partner = await post('/api/admin/partners', { typ: 'hundeschule', status: 'aktiv', ...input }, adminCookie)
    assert.equal(partner.status, 201)
    const area = await post(`/api/admin/partners/${partner.data.id}/area`, undefined, adminCookie)
    const login = await post('/api/login', { secret: area.data.key })
    return { partner: partner.data, familyId: area.data.familyId, cookie: getCookie(login.res) }
  }

  const school = await createPartnerArea({ name: 'Hundeschule Wiesengrund', slug: 'kk-wiesengrund', portalTitel: 'Training mit Herz' })
  db.prepare('UPDATE partners SET farbe = ? WHERE id = ?').run('#2a6f4e', school.partner.id)
  const stack = await post('/api/admin/voucher-batches', { label: 'Wiesengrund-Karten', size: 5, partnerId: school.partner.id }, adminCookie)
  assert.equal(stack.status, 201)

  await t.test('GET: Vorgabe Kombi mit leerer Zeile, die Rückseite der Plattform, nie ein Code', async () => {
    const res = await getState(school.cookie)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('cache-control'), 'no-store')
    assert.equal(res.data.gespeichert, false)
    assert.equal(res.data.design.karte, 'kombi')
    assert.equal(res.data.design.widmung, '')
    assert.deepEqual(res.data.rueckseite, VORGABEN)
    const text = JSON.stringify(res.data)
    for (const code of stack.data.codes) assert.equal(text.includes(code), false)
  })

  await t.test('PUT: die Kombination wird mit der Gestaltung gespeichert; jede Kombination aus der Liste', async () => {
    const saved = await save(KOMBI, school.cookie)
    assert.equal(saved.status, 200)
    assert.deepEqual(saved.data.design, { ...KOMBI, farbe: '#2f6b3f' })
    assert.equal(saved.data.gespeichert, true)
    for (const karte of ['visitenkarte', 'einladung', 'kombi']) {
      assert.equal((await save({ ...KOMBI, karte }, school.cookie)).data.design.karte, karte)
    }
    for (const body of [{ ...KOMBI, karte: 'gutschein' }, { ...KOMBI, mitGutschein: true }, { ...KOMBI, titel: 'Eigene Rückseite' }]) {
      assert.equal((await save(body, school.cookie)).status, 400, JSON.stringify(body))
    }
    assert.equal((await getState(school.cookie)).data.design.karte, 'kombi')
  })

  await t.test('das frühere PUT /einladung gibt es nicht mehr', async () => {
    assert.equal((await put('/api/partner-area/visitenkarte/einladung', OLD_EINLADUNG, school.cookie)).status, 404)
  })

  await t.test('frühere getrennte Gestaltungen: zusammengeführt gelesen, beim Speichern ersetzt', async () => {
    const old = await createPartnerArea({ name: 'Hundeschule Altbestand', slug: 'kk-altbestand' })
    db.prepare('INSERT INTO partner_visitenkarte (partner_id, design) VALUES (?, ?)').run(old.partner.id, JSON.stringify(OLD_VISITENKARTE))
    db.prepare('INSERT INTO partner_einladungskarte (partner_id, design) VALUES (?, ?)').run(old.partner.id, JSON.stringify(OLD_EINLADUNG))
    const merged = await getState(old.cookie)
    assert.equal(merged.data.gespeichert, true)
    const { mitGutschein, ...front } = OLD_VISITENKARTE
    assert.equal(mitGutschein, true)
    assert.deepEqual(merged.data.design, { karte: 'kombi', ...front, widmung: 'Für unsere Kursfamilien' })

    const saved = await save(merged.data.design, old.cookie)
    assert.equal(saved.status, 200)
    const rows = legacyRows(old.partner.id)
    assert.equal(rows.einladung, null, 'die frühere Einladungskarte fällt weg')
    assert.deepEqual(JSON.parse(rows.visitenkarte), merged.data.design)

    // Nur eine frühere Einladungskarte: deren Vorderseite, Kombination Einladungskarte.
    const nurEinladung = await createPartnerArea({ name: 'Hundesalon Altbestand', slug: 'kk-salon-alt', typ: 'hundesalon' })
    db.prepare('INSERT INTO partner_einladungskarte (partner_id, design) VALUES (?, ?)').run(nurEinladung.partner.id, JSON.stringify(OLD_EINLADUNG))
    const state = await getState(nurEinladung.cookie)
    assert.equal(state.data.gespeichert, true)
    assert.deepEqual(state.data.design, { karte: 'einladung', ...OLD_EINLADUNG })
  })

  await t.test('Codes: derselbe Abruf - je Karte ein eigener Code, ein zweiter Druck bekommt neue', async () => {
    const first = await takeCodes({ anzahl: 3, nurUngedruckt: true }, school.cookie)
    const second = await takeCodes({ anzahl: 3, nurUngedruckt: true }, school.cookie)
    assert.equal(first.status, 200)
    assert.equal(first.data.codes.length, 3)
    // Fünf offene Codes: der zweite Druck bekommt nur noch zwei - die dritte Karte bleibt ohne Code (fehlen).
    assert.equal(second.data.codes.length, 2)
    assert.equal(second.data.fehlen, 1)
    const all = [...first.data.codes, ...second.data.codes]
    assert.equal(new Set(all).size, 5)
    assert.deepEqual([...all].sort(), [...stack.data.codes].sort())
    assert.deepEqual(second.data.gutscheine, { offen: 5, ungedruckt: 0 })
  })

  await t.test('Demo: lesen ja (Pfotenglück zeigt die Kombi mit persönlicher Zeile), Speichern 403', async () => {
    const demo = await post('/api/demo', { as: 'partner' })
    const cookie = getCookie(demo.res)
    const res = await getState(cookie)
    assert.equal(res.data.gespeichert, true)
    assert.equal(res.data.design.karte, 'kombi')
    assert.match(res.data.design.widmung, /\S/)
    assert.equal((await save(KOMBI, cookie)).status, 403)
  })

  await t.test('Admin-Ansicht: lesen ja, Speichern 403', async () => {
    const view = await post(`/api/admin/view/${school.familyId}`, undefined, adminCookie)
    const viewCookie = getCookie(view.res)
    const res = await getState(viewCookie)
    assert.equal(res.status, 200)
    assert.equal(res.data.design.vorlage, 'schlicht')
    assert.equal((await save(KOMBI, viewCookie)).status, 403)
  })

  await t.test('ohne Sitzung: 401', async () => {
    assert.equal((await save(KOMBI)).status, 401)
  })
})
