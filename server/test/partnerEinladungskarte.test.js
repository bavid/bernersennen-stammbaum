const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, getCookie } = require('./helpers')

// Einladungskarten im Partner-Bereich (/api/partner-area/visitenkarte): die Gestaltung der Vorderseite getrennt von der
// Visitenkarte gespeichert (PUT /einladung, Tabelle partner_einladungskarte), die Rückseite von Familie auf Pfoten
// (rueckseite, nur lesend) und die Codes über denselben Abruf wie die Visitenkarten (POST /gutscheine): je Karte ein
// eigener Code, gedruckte nie zweimal. Demo und Admin-Ansicht lesen nur. t.test() bleibt auf einer Ebene.
const ADMIN_TEST_PASSWORD = 'admin-test-einladungskarte-1'
const dataDir = useTempDataDir('partner-einladungskarte', { LOGIN_RATE_LIMIT: '300', CODE_RATE_LIMIT: '300' })

const VISITENKARTE = Object.freeze({
  vorlage: 'foto',
  farbe: '#1f5f8b',
  kurztext: 'Training mit Herz',
  zeigeAnsprechperson: false,
  zeigeWebsite: true,
  zeigeTelefon: false,
  zeigeEmail: true,
  mitGutschein: true
})
const EINLADUNG = Object.freeze({
  vorlage: 'schlicht',
  farbe: '#2F6B3F',
  kurztext: 'Gemeinsam lernen auf der Wiese',
  widmung: 'Für unsere Welpenkurs-Familien',
  zeigeAnsprechperson: true,
  zeigeWebsite: true,
  zeigeTelefon: true,
  zeigeEmail: false
})

test('Partner-Bereich: Einladungskarten - Gestaltung, Rückseite und Codes', async (t) => {
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
  const saveEinladung = (body, cookie) => put('/api/partner-area/visitenkarte/einladung', body, cookie)
  const saveVisitenkarte = (body, cookie) => put('/api/partner-area/visitenkarte', body, cookie)
  const takeCodes = (body, cookie) => post('/api/partner-area/visitenkarte/gutscheine', body, cookie)

  async function createPartnerArea(input) {
    const partner = await post('/api/admin/partners', { typ: 'hundeschule', status: 'aktiv', ...input }, adminCookie)
    assert.equal(partner.status, 201)
    const area = await post(`/api/admin/partners/${partner.data.id}/area`, undefined, adminCookie)
    const login = await post('/api/login', { secret: area.data.key })
    return { partner: partner.data, familyId: area.data.familyId, cookie: getCookie(login.res) }
  }

  const school = await createPartnerArea({ name: 'Hundeschule Wiesengrund', slug: 'el-wiesengrund', portalTitel: 'Training mit Herz' })
  db.prepare('UPDATE partners SET farbe = ? WHERE id = ?').run('#2a6f4e', school.partner.id)
  const stack = await post('/api/admin/voucher-batches', { label: 'Wiesengrund-Karten', size: 5, partnerId: school.partner.id }, adminCookie)
  assert.equal(stack.status, 201)

  await t.test('GET: Einladungskarte mit Vorgabe aus dem Profil, Rückseite der Plattform, nie ein Code', async () => {
    const res = await getState(school.cookie)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('cache-control'), 'no-store')
    assert.deepEqual(res.data.einladung, {
      gespeichert: false,
      design: {
        vorlage: 'klassisch',
        farbe: '#2a6f4e',
        kurztext: 'Training mit Herz',
        widmung: '',
        zeigeAnsprechperson: false,
        zeigeWebsite: true,
        zeigeTelefon: true,
        zeigeEmail: true
      }
    })
    assert.deepEqual(res.data.rueckseite, VORGABEN)
    const text = JSON.stringify(res.data)
    for (const code of stack.data.codes) assert.equal(text.includes(code), false)
  })

  await t.test('Vorgabe folgt einer gespeicherten Visitenkarte (ohne Gutschein-Schalter)', async () => {
    assert.equal((await saveVisitenkarte(VISITENKARTE, school.cookie)).status, 200)
    const res = await getState(school.cookie)
    assert.equal(res.data.einladung.gespeichert, false)
    assert.equal(res.data.einladung.design.vorlage, 'foto')
    assert.equal(res.data.einladung.design.farbe, '#1f5f8b')
    assert.equal('mitGutschein' in res.data.einladung.design, false)
  })

  await t.test('PUT /einladung: getrennt von der Visitenkarte gespeichert, beide bleiben erhalten', async () => {
    const saved = await saveEinladung(EINLADUNG, school.cookie)
    assert.equal(saved.status, 200)
    assert.deepEqual(saved.data.einladung, { gespeichert: true, design: { ...EINLADUNG, farbe: '#2f6b3f' } })
    assert.deepEqual(saved.data.design, VISITENKARTE)
    // Die Visitenkarte noch einmal ändern - die Einladungskarte bleibt, wie sie ist.
    assert.equal((await saveVisitenkarte({ ...VISITENKARTE, vorlage: 'klassisch' }, school.cookie)).status, 200)
    const after = await getState(school.cookie)
    assert.equal(after.data.design.vorlage, 'klassisch')
    assert.deepEqual(after.data.einladung.design, { ...EINLADUNG, farbe: '#2f6b3f' })
    const row = db.prepare('SELECT design, is_demo FROM partner_einladungskarte WHERE partner_id = ?').get(school.partner.id)
    assert.equal(row.is_demo, 0)
    assert.equal(JSON.parse(row.design).widmung, 'Für unsere Welpenkurs-Familien')
  })

  await t.test('PUT /einladung: ungültig -> 400, nichts geändert; die Rückseite lässt sich nicht mitschicken', async () => {
    for (const body of [
      { ...EINLADUNG, widmung: 'x'.repeat(81) },
      { ...EINLADUNG, mitGutschein: false },
      { ...EINLADUNG, titel: 'Eigene Rückseite' },
      { ...EINLADUNG, rueckseite: { titel: 'Eigene Rückseite' } },
      { ...EINLADUNG, farbe: 'grün' },
      { vorlage: 'foto' }
    ]) {
      const res = await saveEinladung(body, school.cookie)
      assert.equal(res.status, 400, JSON.stringify(body))
    }
    assert.equal((await getState(school.cookie)).data.einladung.design.widmung, 'Für unsere Welpenkurs-Familien')
    assert.deepEqual((await getState(school.cookie)).data.rueckseite, VORGABEN)
  })

  await t.test('Codes: derselbe Abruf - je Karte ein eigener Code, ein zweiter Druck bekommt neue, ohne Code keine Karte', async () => {
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

  await t.test('Demo: lesen ja (Pfotenglück hat eine Einladungskarte), Speichern 403', async () => {
    const demo = await post('/api/demo', { as: 'partner' })
    const cookie = getCookie(demo.res)
    const res = await getState(cookie)
    assert.equal(res.data.einladung.gespeichert, true)
    assert.match(res.data.einladung.design.widmung, /\S/)
    assert.equal((await saveEinladung(EINLADUNG, cookie)).status, 403)
  })

  await t.test('Admin-Ansicht: lesen ja, Speichern 403', async () => {
    const view = await post(`/api/admin/view/${school.familyId}`, undefined, adminCookie)
    const viewCookie = getCookie(view.res)
    const res = await getState(viewCookie)
    assert.equal(res.status, 200)
    assert.equal(res.data.einladung.design.vorlage, 'schlicht')
    assert.equal((await saveEinladung(EINLADUNG, viewCookie)).status, 403)
  })

  await t.test('ohne Sitzung: 401', async () => {
    assert.equal((await saveEinladung(EINLADUNG)).status, 401)
  })
})
