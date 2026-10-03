const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, createHousehold, getCookie } = require('./helpers')

// Phase V5: Visitenkarten-Designer im Partner-Bereich (/api/partner-area/visitenkarte) - die gespeicherte Gestaltung
// und die Gutschein-Codes für den Druck: nur offene Codes aus dem eigenen Kunden-Stapel, im Klartext nur hier, mit
// no-store und ohne ETag, gedruckte vermerkt (gedruckt_at). Demo und Admin-Ansicht lesen nur und bekommen nie Codes.
// t.test() bleibt auf einer Ebene.
const ADMIN_TEST_PASSWORD = 'admin-test-visitenkarte-1'
const dataDir = useTempDataDir('partner-visitenkarte', { LOGIN_RATE_LIMIT: '300', CODE_RATE_LIMIT: '300' })

const CODE_RE = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/
const VALID_DESIGN = Object.freeze({
  vorlage: 'schlicht',
  farbe: '#3F4B39',
  kurztext: 'Gemeinsam lernen auf der Wiese',
  zeigeAnsprechperson: false,
  zeigeWebsite: true,
  zeigeTelefon: false,
  zeigeEmail: true,
  mitGutschein: true
})

test('Partner-Bereich: Visitenkarten-Gestaltung und Gutschein-Codes für den Druck', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const config = require('../config')
  const { replaceDemoPack } = require('../lib/demoPack')
  replaceDemoPack(db, config.uploadDir)

  const adminLogin = await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: ADMIN_TEST_PASSWORD } })
  const adminCookie = getCookie(adminLogin.res)
  const get = (urlPath, cookie) => call(base, urlPath, { cookie })
  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const put = (urlPath, body, cookie) => call(base, urlPath, { method: 'PUT', body, cookie })
  const getDesign = (cookie) => get('/api/partner-area/visitenkarte', cookie)
  const saveDesign = (body, cookie) => put('/api/partner-area/visitenkarte', body, cookie)
  const takeCodes = (body, cookie) => post('/api/partner-area/visitenkarte/gutscheine', body, cookie)

  let counter = 0
  async function createPartnerArea(overrides = {}) {
    counter += 1
    const input = { name: `Partner ${counter}`, slug: `vk-partner-${counter}`, typ: 'hundeschule', status: 'aktiv', ...overrides }
    const partner = await post('/api/admin/partners', input, adminCookie)
    assert.equal(partner.status, 201)
    const area = await post(`/api/admin/partners/${partner.data.id}/area`, undefined, adminCookie)
    assert.equal(area.status, 201)
    const login = await post('/api/login', { secret: area.data.key })
    assert.equal(login.status, 200)
    return { partner: partner.data, familyId: area.data.familyId, cookie: getCookie(login.res) }
  }

  async function adminStack(label, size, partnerId, extra = {}) {
    const res = await post('/api/admin/voucher-batches', { label, size, ...(partnerId ? { partnerId } : {}), ...extra }, adminCookie)
    assert.equal(res.status, 201)
    return res.data
  }

  async function voucherIdOf(batchId, formattedCode) {
    const detail = await get(`/api/admin/voucher-batches/${batchId}`, adminCookie)
    return detail.data.vouchers.find((voucher) => voucher.code === formattedCode).id
  }

  const { hashCode, normalizeCode } = require('../lib/codes')
  const gedrucktAt = (formattedCode) =>
    db.prepare('SELECT gedruckt_at FROM vouchers WHERE code_hash = ?').get(hashCode(normalizeCode(formattedCode)))?.gedruckt_at

  // --- Aufbau ---------------------------------------------------------------------------------------

  const school = await createPartnerArea({
    name: 'Hundeschule Wiesengrund',
    slug: 'vk-wiesengrund',
    portalTitel: 'Training mit Herz',
    ansprechperson: 'Wilma Feld'
  })
  db.prepare('UPDATE partners SET farbe = ? WHERE id = ?').run('#2a6f4e', school.partner.id)

  // Admin-Stapel der Hundeschule: 6 Codes, einer eingelöst, einer widerrufen -> 4 offen.
  const own = await adminStack('Wiesengrund-Karten', 6, school.partner.id)
  const [eingeloest, widerrufen, ...ownOpen] = own.codes
  assert.equal((await post('/api/vouchers/redeem', { code: eingeloest, name: 'Zuhause Kundschaft' })).status, 201)
  assert.equal((await post(`/api/admin/vouchers/${await voucherIdOf(own.batch.id, widerrufen)}/revoke`, undefined, adminCookie)).status, 200)
  // Weitergabe-Gutscheine des Bereichs (GET /vouchers/mine legt das Kontingent an) zählen ebenfalls dazu.
  const mine = await get('/api/vouchers/mine', school.cookie)
  assert.equal(mine.data.length, config.voucherQuota)
  const weitergabe = mine.data.map((voucher) => voucher.code)
  const ownOpenAll = [...ownOpen, ...weitergabe]

  // Fremd: ein anderer Partner, ein allgemeiner Admin-Stapel, ein Partner-Zugang.
  const salon = await createPartnerArea({ name: 'Hundesalon Fellfein', slug: 'vk-fellfein', typ: 'hundesalon' })
  const foreign = await adminStack('Fellfein-Karten', 3, salon.partner.id)
  const general = await adminStack('Kundenkarten allgemein', 3)
  const access = await adminStack('Zugänge', 2, null, { zweck: 'partnerzugang' })
  const foreignCodes = [...foreign.codes, ...general.codes, ...access.codes]

  await t.test('GET: Vorgabe aus dem Profil, noch nicht gespeichert, Zähler ohne Codes, no-store', async () => {
    const res = await getDesign(school.cookie)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('cache-control'), 'no-store')
    assert.equal(res.headers.get('etag'), null)
    assert.equal(res.data.gespeichert, false)
    assert.deepEqual(res.data.design, {
      vorlage: 'klassisch',
      farbe: '#2a6f4e',
      kurztext: 'Training mit Herz',
      zeigeAnsprechperson: true,
      zeigeWebsite: true,
      zeigeTelefon: true,
      zeigeEmail: true,
      mitGutschein: false
    })
    assert.deepEqual(res.data.gutscheine, { offen: ownOpenAll.length, ungedruckt: ownOpenAll.length })
    assert.equal(res.data.maxJeAbruf, 50)
    assert.equal(res.data.vorschlag, 'Training mit Herz')
    const text = JSON.stringify(res.data)
    for (const code of [...own.codes, ...weitergabe]) assert.equal(text.includes(code), false)
  })

  await t.test('PUT: speichert die ganze Gestaltung; ungültige Angaben -> 400, nichts gespeichert', async () => {
    for (const body of [
      { ...VALID_DESIGN, vorlage: 'bunt' },
      { ...VALID_DESIGN, farbe: 'grün' },
      { ...VALID_DESIGN, kurztext: 'x'.repeat(121) },
      { ...VALID_DESIGN, mitGutschein: 'ja' },
      { ...VALID_DESIGN, schriftart: 'Comic' },
      { vorlage: 'foto' }
    ]) {
      const res = await saveDesign(body, school.cookie)
      assert.equal(res.status, 400, JSON.stringify(body))
      assert.equal(typeof res.data.error, 'string')
    }
    assert.equal((await getDesign(school.cookie)).data.gespeichert, false)

    const saved = await saveDesign(VALID_DESIGN, school.cookie)
    assert.equal(saved.status, 200)
    assert.equal(saved.data.gespeichert, true)
    assert.deepEqual(saved.data.design, { ...VALID_DESIGN, farbe: '#3f4b39' })
    assert.deepEqual((await getDesign(school.cookie)).data.design, { ...VALID_DESIGN, farbe: '#3f4b39' })
    // Ein anderer Partner sieht weiter seine eigene Vorgabe.
    const other = await getDesign(salon.cookie)
    assert.equal(other.data.gespeichert, false)
    assert.equal(other.data.design.vorlage, 'klassisch')
  })

  await t.test('Gutscheine: nur offene Codes aus dem eigenen Stapel, Admin-Stapel zuerst, no-store ohne ETag', async () => {
    const res = await takeCodes({ anzahl: 3 }, school.cookie)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('cache-control'), 'no-store')
    assert.equal(res.headers.get('etag'), null)
    assert.equal(res.data.codes.length, 3)
    for (const code of res.data.codes) assert.match(code, CODE_RE)
    assert.deepEqual(res.data.codes, ownOpen.slice(0, 3))
    assert.equal(res.data.fehlen, 0)
    assert.deepEqual(res.data.gutscheine, { offen: ownOpenAll.length, ungedruckt: ownOpenAll.length - 3 })
    for (const code of res.data.codes) assert.match(gedrucktAt(code), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })

  await t.test('Gutscheine: gedruckte kommen nicht noch einmal; mehr als offen -> fehlen; nie fremde Codes', async () => {
    const rest = await takeCodes({ anzahl: 50, nurUngedruckt: true }, school.cookie)
    assert.equal(rest.status, 200)
    // Erst der Rest des Admin-Stapels, dann die Weitergabe-Codes (die Liste /mine sortiert anders).
    assert.deepEqual(rest.data.codes.slice(0, ownOpen.length - 3), ownOpen.slice(3))
    assert.deepEqual(rest.data.codes.slice(ownOpen.length - 3).sort(), [...weitergabe].sort())
    assert.equal(rest.data.fehlen, 50 - rest.data.codes.length)
    assert.deepEqual(rest.data.gutscheine, { offen: ownOpenAll.length, ungedruckt: 0 })

    const none = await takeCodes({ anzahl: 5 }, school.cookie)
    assert.deepEqual(none.data.codes, [])
    assert.equal(none.data.fehlen, 5)

    for (const code of [eingeloest, widerrufen, ...foreignCodes]) {
      assert.equal(JSON.stringify(rest.data).includes(code), false)
      assert.equal(gedrucktAt(code) ?? null, null)
    }
  })

  await t.test('Gutscheine: mit nurUngedruckt false wieder verwendbar, zuerst die am längsten gedruckten', async () => {
    db.prepare("UPDATE vouchers SET gedruckt_at = datetime('now', '-3 days') WHERE batch_id = ? AND gedruckt_at IS NOT NULL").run(own.batch.id)
    const again = await takeCodes({ anzahl: 2, nurUngedruckt: false }, school.cookie)
    assert.equal(again.status, 200)
    assert.deepEqual(again.data.codes, ownOpen.slice(0, 2))
    // Ein gedruckter Code bleibt einlösbar - gedruckt heißt nicht verbraucht.
    assert.equal((await post('/api/vouchers/redeem', { code: again.data.codes[0], name: 'Zuhause Visitenkarte' })).status, 201)
    const after = await getDesign(school.cookie)
    assert.deepEqual(after.data.gutscheine, { offen: ownOpenAll.length - 1, ungedruckt: 0 })
  })

  await t.test('Gutscheine: Anzahl als ganze Zahl von 1 bis 50, nurUngedruckt als Boolean', async () => {
    for (const body of [{}, { anzahl: 0 }, { anzahl: 51 }, { anzahl: 2.5 }, { anzahl: '3' }, { anzahl: 3, nurUngedruckt: 'ja' }, []]) {
      const res = await takeCodes(body, school.cookie)
      assert.equal(res.status, 400, JSON.stringify(body))
      assert.equal(res.headers.get('cache-control'), 'no-store')
    }
  })

  await t.test('Protokoll: Anzahl ja, Codes nie', async () => {
    const fresh = await adminStack('Wiesengrund Nachschub', 2, school.partner.id)
    const lines = []
    const originals = { info: console.info, warn: console.warn, log: console.log }
    for (const level of Object.keys(originals)) console[level] = (...args) => lines.push(args.join(' '))
    let res
    try {
      res = await takeCodes({ anzahl: 2 }, school.cookie)
    } finally {
      Object.assign(console, originals)
    }
    assert.deepEqual(res.data.codes, fresh.codes)
    const logText = lines.join('\n')
    assert.match(logText, /2 Gutscheine/)
    for (const code of fresh.codes) {
      assert.equal(logText.includes(code), false)
      assert.equal(logText.includes(code.replace(/-/g, '')), false)
    }
  })

  await t.test('Demo: Gestaltung lesbar (Pfotenglück Foto, Tierheim Klassisch), Speichern und Codes 403', async () => {
    const demoLogin = await post('/api/demo', { as: 'partner' })
    assert.equal(demoLogin.status, 200)
    const demoCookie = getCookie(demoLogin.res)
    const res = await getDesign(demoCookie)
    assert.equal(res.status, 200)
    assert.equal(res.data.gespeichert, true)
    assert.equal(res.data.design.vorlage, 'foto')
    assert.equal(res.data.design.mitGutschein, true)
    assert.equal((await saveDesign(VALID_DESIGN, demoCookie)).status, 403)
    const codes = await takeCodes({ anzahl: 3 }, demoCookie)
    assert.equal(codes.status, 403)
    assert.equal('codes' in (codes.data || {}), false)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM vouchers WHERE gedruckt_at IS NOT NULL AND partner_id = ?').get(demoLogin.data.partner.id).c, 0)

    const shelterLogin = await post('/api/demo', { as: 'tierheim' })
    assert.equal(shelterLogin.status, 200)
    const shelter = await getDesign(getCookie(shelterLogin.res))
    assert.equal(shelter.status, 200)
    assert.equal(shelter.data.gespeichert, true)
    assert.equal(shelter.data.design.vorlage, 'klassisch')
  })

  await t.test('Admin-Ansicht: lesen ja, Speichern und Codes 403', async () => {
    const view = await post(`/api/admin/view/${school.familyId}`, undefined, adminCookie)
    assert.equal(view.status, 200)
    const viewCookie = getCookie(view.res)
    const res = await getDesign(viewCookie)
    assert.equal(res.status, 200)
    assert.equal(res.data.design.vorlage, 'schlicht')
    const before = db.prepare('SELECT COUNT(*) AS c FROM vouchers WHERE gedruckt_at IS NOT NULL').get().c
    const codes = await takeCodes({ anzahl: 1 }, viewCookie)
    assert.equal(codes.status, 403)
    assert.equal('codes' in (codes.data || {}), false)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM vouchers WHERE gedruckt_at IS NOT NULL').get().c, before)
    assert.equal((await saveDesign(VALID_DESIGN, viewCookie)).status, 403)
  })

  await t.test('ohne Partner-Bereich oder Sitzung: kein Zugang', async () => {
    const household = await createHousehold(base, 'Zuhause Ohne Partner')
    assert.equal((await getDesign(household.cookie)).status, 403)
    assert.equal((await takeCodes({ anzahl: 1 }, household.cookie)).status, 403)
    const anonymous = await takeCodes({ anzahl: 1 })
    assert.equal(anonymous.status, 401)
  })

  await t.test('Grenze: höchstens 20 Abrufe von Codes je Stunde und Partner', async () => {
    const busy = await createPartnerArea({ name: 'Tierpension Eilig', slug: 'vk-eilig', typ: 'betreuung' })
    for (let index = 0; index < 20; index += 1) assert.equal((await takeCodes({ anzahl: 1 }, busy.cookie)).status, 200)
    const limited = await takeCodes({ anzahl: 1 }, busy.cookie)
    assert.equal(limited.status, 429)
    assert.equal(typeof limited.data.error, 'string')
    // Andere Partner trifft die Grenze nicht.
    assert.equal((await takeCodes({ anzahl: 1 }, salon.cookie)).status, 200)
  })
})
