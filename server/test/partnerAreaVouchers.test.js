const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, createFamily, createHousehold, getCookie } = require('./helpers')

// Phase 5 Task 4: Partner sehen ihre Kunden-Gutschein-Stapel (/api/partner-area/vouchers) - die Stapel, die der
// Admin für sie angelegt hat, und ihre Weitergabe-Gutscheine - samt Druckdaten (Klartext nur für offene Codes,
// no-store, kein ETag, nur eigene Stapel). Demo-Partner sehen ihren Demo-Stapel. t.test() bleibt auf einer Ebene.
const ADMIN_TEST_PASSWORD = 'admin-test-partner-vouchers-1'
const dataDir = useTempDataDir('partner-vouchers', { LOGIN_RATE_LIMIT: '300', CODE_RATE_LIMIT: '300' })

const SCHOOL_NAME = 'Hundeschule Wiesengrund'
const SCHOOL_FARBE = '#2a6f4e'
const STAPEL_KEYS = ['id', 'label', 'quelle', 'size', 'offen', 'eingeloest', 'widerrufen', 'erstelltAm']

const rawCode = (formatted) => formatted.replace(/-/g, '')

test('Partner-Bereich: Kunden-Gutschein-Stapel und Druckdaten', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const config = require('../config')
  const { replaceDemoPack } = require('../lib/demoPack')
  const { createBatch, DEMO_BATCH_KIND } = require('../lib/vouchers')
  replaceDemoPack(db, config.uploadDir)

  const adminLogin = await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: ADMIN_TEST_PASSWORD } })
  const adminCookie = getCookie(adminLogin.res)
  const get = (urlPath, cookie) => call(base, urlPath, { cookie })
  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const redeem = (code, name) => post('/api/vouchers/redeem', { code, name })
  const listStacks = (cookie) => get('/api/partner-area/vouchers', cookie)
  const printStack = (id, cookie) => get(`/api/partner-area/vouchers/${id}/print`, cookie)

  let counter = 0
  async function createPartnerArea(overrides = {}) {
    counter += 1
    const input = { name: `Partner ${counter}`, slug: `partner-${counter}`, typ: 'hundeschule', status: 'aktiv', ...overrides }
    const partner = await post('/api/admin/partners', input, adminCookie)
    assert.equal(partner.status, 201)
    const area = await post(`/api/admin/partners/${partner.data.id}/area`, undefined, adminCookie)
    assert.equal(area.status, 201)
    const login = await post('/api/login', { secret: area.data.key })
    assert.equal(login.status, 200)
    return { partner: partner.data, familyId: area.data.familyId, cookie: getCookie(login.res) }
  }

  async function voucherIdOf(batchId, formattedCode) {
    const detail = await get(`/api/admin/voucher-batches/${batchId}`, adminCookie)
    return detail.data.vouchers.find((voucher) => voucher.code === formattedCode).id
  }

  // --- Aufbau ---------------------------------------------------------------------------------------

  const school = await createPartnerArea({ name: SCHOOL_NAME, slug: 'wiesengrund' })
  db.prepare('UPDATE partners SET farbe = ? WHERE id = ?').run(SCHOOL_FARBE, school.partner.id)

  // Admin-Stapel für die Hundeschule: eingelöst, widerrufen, offen.
  const adminStack = await post('/api/admin/voucher-batches', { label: 'Wiesengrund-Karten', size: 3, partnerId: school.partner.id }, adminCookie)
  assert.equal(adminStack.status, 201)
  const [eingeloestCode, widerrufenCode, offenCode] = adminStack.data.codes
  assert.equal((await redeem(eingeloestCode, 'Zuhause Kundschaft Eins')).status, 201)
  assert.equal((await post(`/api/admin/vouchers/${await voucherIdOf(adminStack.data.batch.id, widerrufenCode)}/revoke`, undefined, adminCookie)).status, 200)

  // Weitergabe-Gutscheine des Bereichs (GET /vouchers/mine legt sie an), einer davon eingelöst.
  const mine = await get('/api/vouchers/mine', school.cookie)
  assert.equal(mine.status, 200)
  assert.equal(mine.data.length, config.voucherQuota)
  assert.equal((await redeem(mine.data[0].code, 'Zuhause Kundschaft Zwei')).status, 201)

  // Stapel ohne Partner und Stapel eines anderen Partners gehören nicht dazu.
  const kundenkarten = await post('/api/admin/voucher-batches', { label: 'Kundenkarten allgemein', size: 2 }, adminCookie)
  assert.equal(kundenkarten.status, 201)
  const salon = await createPartnerArea({ name: 'Hundesalon Fellfein', slug: 'fellfein', typ: 'hundesalon' })
  const salonStack = await post('/api/admin/voucher-batches', { label: 'Fellfein-Karten', size: 2, partnerId: salon.partner.id }, adminCookie)
  assert.equal(salonStack.status, 201)

  const household = await createHousehold(base, 'Zuhause Ohne Partner')
  const rudel = await createFamily(base, 'Rudel Ohne Partner', 'rudel-ohne-partner-pw')

  // --- Liste ------------------------------------------------------------------------------------------

  await t.test('Liste: eigene Admin-Stapel und Weitergabe mit Zählern und Quelle, keine Codes, keine fremden Stapel', async () => {
    const res = await listStacks(school.cookie)
    assert.equal(res.status, 200)
    const { stapel } = res.data
    assert.ok(Array.isArray(stapel))
    for (const row of stapel) assert.deepEqual(Object.keys(row).sort(), [...STAPEL_KEYS].sort())

    const admin = stapel.find((row) => row.id === adminStack.data.batch.id)
    assert.deepEqual(
      { ...admin, erstelltAm: undefined },
      { id: adminStack.data.batch.id, label: 'Wiesengrund-Karten', quelle: 'admin', size: 3, offen: 1, eingeloest: 1, widerrufen: 1, erstelltAm: undefined }
    )
    assert.match(admin.erstelltAm, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)

    const weitergabe = stapel.filter((row) => row.quelle === 'weitergabe')
    assert.equal(weitergabe.length, 1)
    assert.equal(weitergabe[0].label, `Weitergabe ${SCHOOL_NAME}`)
    assert.equal(weitergabe[0].size, config.voucherQuota)
    assert.equal(weitergabe[0].offen, config.voucherQuota - 1)
    assert.equal(weitergabe[0].eingeloest, 1)
    assert.equal(weitergabe[0].widerrufen, 0)

    assert.equal(stapel.length, 2)
    assert.equal(stapel.some((row) => row.id === salonStack.data.batch.id), false)
    assert.equal(stapel.some((row) => row.id === kundenkarten.data.batch.id), false)

    const text = JSON.stringify(res.data)
    for (const code of [...adminStack.data.codes, ...mine.data.map((voucher) => voucher.code)]) {
      assert.equal(text.includes(code), false)
      assert.equal(text.includes(rawCode(code)), false)
    }
  })

  await t.test('Liste: neueste Stapel zuerst; ein Partner-Zugang oder ein Übergabe-Gutschein ist kein Kunden-Stapel', async () => {
    const shelter = await createPartnerArea({ name: 'Tierheim Uferweg', slug: 'uferweg', typ: 'tierheim' })
    const dog = await post('/api/dogs', { name: 'Filou', geschlecht: 'ruede', tierart: 'hund', vermittlungStatus: 'in_vermittlung' }, shelter.cookie)
    assert.equal(dog.status, 201)
    // Wie routes/dogs.js POST /:id/handover: kind 'partner' MIT ausgebendem Bereich und dog_id.
    createBatch(db, { label: 'Übergabe Filou', kind: 'partner', size: 1, issuedByFamilyId: shelter.familyId, partnerId: shelter.partner.id, dogId: dog.data.id })
    // Ein Partner-Zugang mit Typ-Vorgabe ist kein Kunden-Stapel - auch nicht mit derselben partner_id.
    createBatch(db, { label: 'Zugang Uferweg', kind: 'partner', size: 1, partnerId: shelter.partner.id, zweck: 'partnerzugang', partnerTyp: 'tierheim' })
    const first = await post('/api/admin/voucher-batches', { label: 'Uferweg Erste', size: 1, partnerId: shelter.partner.id }, adminCookie)
    db.prepare("UPDATE voucher_batches SET created_at = datetime('now', '-1 day') WHERE id = ?").run(first.data.batch.id)
    const second = await post('/api/admin/voucher-batches', { label: 'Uferweg Zweite', size: 1, partnerId: shelter.partner.id }, adminCookie)

    const res = await listStacks(shelter.cookie)
    assert.equal(res.status, 200)
    assert.deepEqual(
      res.data.stapel.map((row) => row.label),
      ['Uferweg Zweite', 'Uferweg Erste'],
      `Stapel: ${res.data.stapel.map((row) => row.label).join(', ')}`
    )
    assert.equal(res.data.stapel[0].id, second.data.batch.id)
  })

  // --- Druckdaten -----------------------------------------------------------------------------------

  await t.test('Druckdaten: nur offene Codes, Partner-Motiv mit Name/Logo/Farbe, no-store, kein ETag, Log ohne Codes', async () => {
    const info = t.mock.method(console, 'info')
    const res = await printStack(adminStack.data.batch.id, school.cookie)
    info.mock.restore()
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('cache-control'), 'no-store')
    assert.equal(res.headers.get('etag'), null)
    assert.deepEqual(res.data.codes, [offenCode])
    assert.equal(res.data.nichtDruckbar, 2)
    assert.deepEqual(res.data.batch, {
      id: adminStack.data.batch.id,
      label: 'Wiesengrund-Karten',
      zweck: 'chronik',
      partnerTyp: null,
      partner: { name: SCHOOL_NAME, logoUrl: null, farbe: SCHOOL_FARBE }
    })

    const logged = info.mock.calls.map((entry) => entry.arguments.join(' ')).join('\n')
    assert.match(logged, /1 Codes/)
    assert.equal(logged.includes(offenCode), false)
    assert.equal(logged.includes(rawCode(offenCode)), false)
  })

  await t.test('Druckdaten: der Weitergabe-Stapel trägt ebenfalls das Partner-Motiv', async () => {
    const weitergabe = (await listStacks(school.cookie)).data.stapel.find((row) => row.quelle === 'weitergabe')
    const res = await printStack(weitergabe.id, school.cookie)
    assert.equal(res.status, 200)
    assert.equal(res.data.codes.length, config.voucherQuota - 1)
    assert.deepEqual(res.data.codes.sort(), mine.data.slice(1).map((voucher) => voucher.code).sort())
    assert.equal(res.data.nichtDruckbar, 1)
    assert.equal(res.data.batch.partner.name, SCHOOL_NAME)
    assert.equal(res.data.batch.zweck, 'chronik')
  })

  // --- Zugriff ----------------------------------------------------------------------------------------

  await t.test('fremde oder unbekannte Stapel 404 (mit no-store), Zuhause/Rudel 403, ohne Sitzung 401', async () => {
    for (const id of [salonStack.data.batch.id, kundenkarten.data.batch.id, 999999, 'abc']) {
      const res = await printStack(id, school.cookie)
      assert.equal(res.status, 404, `Stapel ${id}`)
      assert.equal(res.headers.get('cache-control'), 'no-store')
      assert.equal(res.headers.get('etag'), null)
    }
    for (const cookie of [household.cookie, rudel.cookie]) {
      assert.equal((await listStacks(cookie)).status, 403)
      assert.equal((await printStack(adminStack.data.batch.id, cookie)).status, 403)
    }
    assert.equal((await listStacks()).status, 401)
    assert.equal((await printStack(adminStack.data.batch.id)).status, 401)
    // Der Salon sieht nur seinen eigenen Stapel.
    const salonList = await listStacks(salon.cookie)
    assert.deepEqual(salonList.data.stapel.map((row) => row.id), [salonStack.data.batch.id])
  })

  // --- Demo ---------------------------------------------------------------------------------------------

  await t.test('Demo-Partner: Demo-Stapel mit Beispielzahlen, Druck liefert Codes, die sich nie einlösen lassen', async () => {
    const demoLogin = await post('/api/demo', { as: 'partner' })
    assert.equal(demoLogin.status, 200)
    const demoCookie = getCookie(demoLogin.res)

    const res = await listStacks(demoCookie)
    assert.equal(res.status, 200)
    assert.equal(res.data.stapel.length, 1)
    const [stack] = res.data.stapel
    assert.equal(stack.quelle, 'weitergabe')
    assert.equal(stack.label, `Weitergabe ${demoLogin.data.partner.name}`)
    assert.ok(stack.offen > 0)
    assert.ok(stack.eingeloest > 0)
    assert.equal(stack.size, stack.offen + stack.eingeloest + stack.widerrufen)

    const print = await printStack(stack.id, demoCookie)
    assert.equal(print.status, 200)
    assert.equal(print.headers.get('cache-control'), 'no-store')
    assert.equal(print.data.codes.length, stack.offen)
    assert.equal(print.data.batch.partner.name, demoLogin.data.partner.name)

    const [code] = print.data.codes
    assert.deepEqual((await post('/api/vouchers/check', { code })).data, { status: 'unbekannt' })
    assert.equal((await redeem(code, 'Zuhause Demo-Versuch')).status, 404)
    assert.equal((await post('/api/login', { secret: code })).status, 401)

    // Der Salon hat seinen eigenen Demo-Stapel.
    const salonDemo = await post('/api/demo', { as: 'partner', slug: 'hundesalon-wuschelglueck' })
    const salonStacks = await listStacks(getCookie(salonDemo.res))
    assert.equal(salonStacks.data.stapel.length, 1)
    assert.notEqual(salonStacks.data.stapel[0].id, stack.id)
  })

  await t.test('Demo-Wechsel: die Demo-Stapel werden ersetzt, ohne verwaiste Gutscheine oder leere Stapel', async () => {
    const countDemo = () => ({
      vouchers: db.prepare('SELECT COUNT(*) AS c FROM vouchers v JOIN voucher_batches b ON b.id = v.batch_id WHERE b.kind = ?').get(DEMO_BATCH_KIND).c,
      batches: db.prepare('SELECT COUNT(*) AS c FROM voucher_batches WHERE kind = ?').get(DEMO_BATCH_KIND).c,
      empty: db.prepare('SELECT COUNT(*) AS c FROM voucher_batches b WHERE b.kind = ? AND NOT EXISTS (SELECT 1 FROM vouchers WHERE batch_id = b.id)').get(DEMO_BATCH_KIND).c,
      orphans: db
        .prepare(
          `SELECT COUNT(*) AS c FROM vouchers v JOIN voucher_batches b ON b.id = v.batch_id
           WHERE b.kind = ? AND v.join_family_id IS NULL AND (v.issued_by_family_id IS NULL OR NOT EXISTS (SELECT 1 FROM families WHERE id = v.issued_by_family_id))`
        )
        .get(DEMO_BATCH_KIND).c
    })
    const before = countDemo()
    assert.ok(before.vouchers > 0)
    assert.equal(before.empty, 0)
    assert.equal(before.orphans, 0)

    replaceDemoPack(db, config.uploadDir)
    replaceDemoPack(db, config.uploadDir)
    assert.deepEqual(countDemo(), before)

    // Echte Stapel bleiben unberührt.
    assert.equal((await listStacks(school.cookie)).data.stapel.length, 2)
  })
})
