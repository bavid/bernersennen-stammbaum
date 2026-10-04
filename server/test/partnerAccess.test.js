const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, createHousehold, getCookie } = require('./helpers')

// Phase P Task 2: Partner-Zugang per Gutschein - der Admin gibt Partner-Zugang-Gutscheine aus
// (voucher_batches.zweck = 'partnerzugang'), wer einen einlöst, richtet sein Partnerprofil selbst ein.
// t.test() bleibt auf einer Ebene.
const ADMIN_TEST_PASSWORD = 'admin-test-partnerzugang-1'
const dataDir = useTempDataDir('partner-access', { LOGIN_RATE_LIMIT: '300', CODE_RATE_LIMIT: '300' })
const KEY_RE = /^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/
const CLAIM_MESSAGE = 'Dieser Code ist ein Partner-Zugang – bitte über „Einladungscode einlösen“ einrichten.'
const BLOCKED_PARTNER_MESSAGE = 'Dieser Partner-Zugang kann gerade nicht eingelöst werden – bitte meldet euch beim Betreiber.'

test('Partner-Zugang per Gutschein: Admin-Stapel, Prüfen, Einlösen, Abgrenzung', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const { hashCode, normalizeCode } = require('../lib/codes')

  const adminLogin = await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: ADMIN_TEST_PASSWORD } })
  const adminCookie = getCookie(adminLogin.res)
  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const adminPost = (urlPath, body) => post(urlPath, body, adminCookie)
  const adminGet = (urlPath) => call(base, urlPath, { cookie: adminCookie })
  const redeem = (body) => post('/api/vouchers/redeem', body)
  const check = (code) => post('/api/vouchers/check', { code })

  const voucherRow = (code) => db.prepare('SELECT * FROM vouchers WHERE code_hash = ?').get(hashCode(normalizeCode(code)))
  const countRows = (table) => db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c

  async function accessBatch(extra = {}) {
    const res = await adminPost('/api/admin/voucher-batches', { label: 'Partner-Zugang', size: 1, zweck: 'partnerzugang', ...extra })
    assert.equal(res.status, 201, JSON.stringify(res.data))
    return res.data
  }

  async function accessCode(extra) {
    return (await accessBatch(extra)).codes[0]
  }

  async function createPartner(overrides = {}) {
    const body = { name: 'Hundeschule Wiesengrund', typ: 'hundeschule', plz: '10115', status: 'aktiv', ...overrides }
    const res = await adminPost('/api/admin/partners', body)
    assert.equal(res.status, 201, JSON.stringify(res.data))
    return res.data
  }

  async function loginWithKey(key) {
    const res = await post('/api/login', { secret: key })
    assert.equal(res.status, 200)
    return res.data
  }

  // Prüft, dass ein fehlgeschlagenes Einlösen nichts angelegt und den Gutschein nicht verbraucht hat.
  function assertNothingCreated(code, before) {
    assert.equal(voucherRow(code).redeemed_at, null)
    assert.equal(voucherRow(code).redeemed_by_family_id, null)
    assert.equal(countRows('partners'), before.partners)
    assert.equal(countRows('families'), before.families)
    assert.equal(countRows('users'), before.users)
  }

  const snapshot = () => ({ partners: countRows('partners'), families: countRows('families'), users: countRows('users') })

  let presetBatchId
  let boundPartner
  let boundCode

  await t.test('Admin: Partner-Zugang-Stapel ohne Typ-Vorgabe', async () => {
    const created = await accessBatch({ label: 'Partner-Zugang offen', size: 3 })
    assert.equal(created.codes.length, 3)
    for (const code of created.codes) assert.match(code, KEY_RE)
    assert.equal(created.batch.zweck, 'partnerzugang')
    assert.equal(created.batch.partnerTyp, null)

    const row = db.prepare('SELECT kind, zweck, partner_typ, partner_id FROM voucher_batches WHERE id = ?').get(created.batch.id)
    assert.deepEqual({ ...row }, { kind: 'admin', zweck: 'partnerzugang', partner_typ: null, partner_id: null })
  })

  await t.test('Admin: Partner-Zugang-Stapel mit Typ-Vorgabe, Liste und Details zeigen zweck/partnerTyp', async () => {
    const created = await accessBatch({ label: 'Partner-Zugang Salon', size: 2, partnerTyp: 'hundesalon' })
    presetBatchId = created.batch.id
    assert.equal(created.batch.partnerTyp, 'hundesalon')
    assert.equal(db.prepare('SELECT partner_typ FROM voucher_batches WHERE id = ?').get(presetBatchId).partner_typ, 'hundesalon')

    const list = await adminGet('/api/admin/voucher-batches')
    const listed = list.data.find((batch) => batch.id === presetBatchId)
    assert.equal(listed.zweck, 'partnerzugang')
    assert.equal(listed.partnerTyp, 'hundesalon')
    assert.equal(listed.kind, 'admin')

    const detail = await adminGet(`/api/admin/voucher-batches/${presetBatchId}`)
    assert.equal(detail.status, 200)
    assert.equal(detail.data.batch.zweck, 'partnerzugang')
    assert.equal(detail.data.batch.partnerTyp, 'hundesalon')

    const chronik = await adminPost('/api/admin/voucher-batches', { label: 'Karten Chronik', size: 1 })
    assert.equal(chronik.status, 201)
    assert.equal(chronik.data.batch.zweck, 'chronik')
    const chronikListed = (await adminGet('/api/admin/voucher-batches')).data.find((batch) => batch.id === chronik.data.batch.id)
    assert.equal(chronikListed.zweck, 'chronik')
    assert.equal(chronikListed.partnerTyp, null)
  })

  await t.test('Admin: an einen bestehenden Partner gebundener Partner-Zugang', async () => {
    boundPartner = await createPartner({ name: 'Hundeschule Lindenhof', plz: '80331' })
    const created = await accessBatch({ label: 'Zugang Lindenhof', partnerId: boundPartner.id })
    boundCode = created.codes[0]

    const batch = db.prepare('SELECT kind, zweck, partner_id FROM voucher_batches WHERE id = ?').get(created.batch.id)
    assert.deepEqual({ ...batch }, { kind: 'admin', zweck: 'partnerzugang', partner_id: boundPartner.id })
    assert.equal(voucherRow(boundCode).partner_id, boundPartner.id)

    const listed = (await adminGet('/api/admin/voucher-batches')).data.find((b) => b.id === created.batch.id)
    assert.equal(listed.partner_name, 'Hundeschule Lindenhof')
  })

  await t.test('Admin: Validierung - 400 für falsche Angaben, 404 ohne Partner, 409 mit vorhandenem Bereich', async () => {
    const create = (body) => adminPost('/api/admin/voucher-batches', { label: 'Ungültig', size: 1, ...body })
    assert.equal((await create({ zweck: 'geschenk' })).status, 400)
    assert.equal((await create({ zweck: 'partnerzugang', partnerTyp: 'zuechter' })).status, 400)
    assert.equal((await create({ partnerTyp: 'hundeschule' })).status, 400)
    assert.equal((await create({ zweck: 'chronik', partnerTyp: 'hundeschule' })).status, 400)
    assert.equal((await create({ zweck: 'partnerzugang', partnerId: boundPartner.id, size: 2 })).status, 400)
    assert.equal((await create({ zweck: 'partnerzugang', partnerId: boundPartner.id, partnerTyp: 'tierheim' })).status, 400)
    assert.equal((await create({ zweck: 'partnerzugang', partnerId: 999999 })).status, 404)
    assert.equal((await create({ zweck: 'partnerzugang', partnerId: 'abc' })).status, 404)

    const rudel = db.prepare("INSERT INTO families (name, password_hash, art) VALUES ('Rudel Zugangstest', '!', 'rudel')").run()
    assert.equal((await create({ zweck: 'partnerzugang', joinFamilyId: rudel.lastInsertRowid })).status, 400)

    const withArea = await createPartner({ name: 'Hundeschule Mit Bereich' })
    assert.equal((await adminPost(`/api/admin/partners/${withArea.id}/area`)).status, 201)
    const conflict = await create({ zweck: 'partnerzugang', partnerId: withArea.id })
    assert.equal(conflict.status, 409)
    assert.match(conflict.data.error, /Partner-Bereich/)

    const demoPartner = await createPartner({ name: 'Hundeschule Demo' })
    db.prepare('UPDATE partners SET is_demo = 1 WHERE id = ?').run(demoPartner.id)
    assert.equal((await create({ zweck: 'partnerzugang', partnerId: demoPartner.id })).status, 404)
  })

  await t.test('lib: ein Partner-Zugang kann weder Rudel, Übergabe noch ausgebenden Bereich tragen', () => {
    const { createBatch } = require('../lib/vouchers')
    const family = db.prepare("INSERT INTO families (name, password_hash, art) VALUES ('Rudel Lib-Test', '!', 'rudel')").run()
    const familyId = Number(family.lastInsertRowid)
    for (const extra of [{ joinFamilyId: familyId }, { issuedByFamilyId: familyId }, { dogId: 1 }]) {
      assert.throws(() => createBatch(db, { label: 'Unzulässig', kind: 'admin', size: 1, zweck: 'partnerzugang', ...extra }))
    }
    assert.throws(() => createBatch(db, { label: 'Unzulässig', kind: 'admin', size: 1, zweck: 'geschenk' }))
  })

  await t.test('check: zweck, partnerTyp und partnerName - nie Codes oder IDs', async () => {
    const unbound = await check(await accessCode())
    assert.deepEqual(unbound.data, { status: 'offen', zweck: 'partnerzugang' })

    const presetCode = await accessCode({ partnerTyp: 'betreuung' })
    const preset = await check(presetCode)
    assert.deepEqual(preset.data, { status: 'offen', zweck: 'partnerzugang', partnerTyp: 'betreuung' })

    const bound = await check(boundCode)
    assert.deepEqual(bound.data, { status: 'offen', zweck: 'partnerzugang', partnerTyp: 'hundeschule', partnerName: 'Hundeschule Lindenhof' })
    const raw = JSON.stringify(bound.data)
    assert.ok(!raw.includes(normalizeCode(boundCode)))
    assert.ok(!/"(id|partnerId|partner_id|code)"/.test(raw))

    const customer = await adminPost('/api/admin/voucher-batches', { label: 'Kunde Check', size: 1 })
    assert.deepEqual((await check(customer.data.codes[0])).data, { status: 'offen' })
  })

  await t.test('redeem ungebunden, Hundeschule: Partner im Entwurf, Bereich art partner, Login per Schlüssel', async () => {
    const code = await accessCode()
    const res = await redeem({ code, name: 'Hundeschule Pfotenglück', typ: 'hundeschule', plz: '10115' })
    assert.equal(res.status, 201, JSON.stringify(res.data))
    assert.equal(res.data.art, 'partner')
    assert.equal(res.data.name, 'Hundeschule Pfotenglück')
    assert.match(res.data.key, KEY_RE)
    assert.equal(res.data.partner.typ, 'hundeschule')
    assert.equal(res.data.partner.status, 'entwurf')

    const partner = db.prepare('SELECT * FROM partners WHERE id = ?').get(res.data.partner.id)
    assert.equal(partner.slug, 'hundeschule-pfotenglueck')
    assert.equal(partner.status, 'entwurf')
    assert.equal(partner.ist_partner, 1)
    assert.equal(partner.is_demo, 0)
    assert.equal(partner.gesperrt, 0)
    assert.equal(partner.plz, '10115')
    assert.equal(partner.ort, 'Berlin')
    assert.ok(Number.isFinite(partner.lat) && Number.isFinite(partner.lon))

    const voucher = voucherRow(code)
    const family = db.prepare('SELECT * FROM families WHERE id = ?').get(res.data.id)
    assert.equal(family.art, 'partner')
    assert.equal(family.partner_id, partner.id)
    assert.equal(family.access_key_hash, hashCode(normalizeCode(code)))
    assert.equal(family.voucher_id, voucher.id)
    assert.equal(family.legacy_password, 0)
    assert.equal(family.theme, 'standard')
    assert.equal(family.is_demo, 0)
    assert.ok(voucher.redeemed_at)
    assert.equal(voucher.redeemed_by_family_id, family.id)
    assert.equal(voucher.code_cipher, null)

    const me = await call(base, '/api/me', { cookie: getCookie(res.res) })
    assert.equal(me.status, 200)
    assert.equal(me.data.id, family.id)

    const loggedIn = await loginWithKey(res.data.key)
    assert.equal(loggedIn.id, family.id)
    assert.equal(loggedIn.partner.typ, 'hundeschule')
  })

  await t.test('redeem ungebunden, Typ tierheim: Bereich art tierheim', async () => {
    const res = await redeem({ code: await accessCode(), name: 'Tierheim Am Wiesenrand', typ: 'tierheim', plz: '80331' })
    assert.equal(res.status, 201, JSON.stringify(res.data))
    assert.equal(res.data.art, 'tierheim')
    assert.equal(res.data.partner.typ, 'tierheim')
    assert.equal(db.prepare('SELECT ort FROM partners WHERE id = ?').get(res.data.partner.id).ort, 'München')
  })

  await t.test('redeem: die Typ-Vorgabe des Stapels schlägt den Typ aus der Anfrage', async () => {
    const res = await redeem({ code: await accessCode({ partnerTyp: 'vermittlung' }), name: 'Vermittlung Pfotenbrücke', typ: 'hundeschule', plz: '10115' })
    assert.equal(res.status, 201, JSON.stringify(res.data))
    assert.equal(res.data.partner.typ, 'vermittlung')
    assert.equal(res.data.art, 'tierheim')

    const loose = await redeem({ code: await accessCode({ partnerTyp: 'betreuung' }), name: 'Tagesstätte Lichtblick', typ: 'zuechter', plz: '10115' })
    assert.equal(loose.status, 201, JSON.stringify(loose.data))
    assert.equal(loose.data.partner.typ, 'betreuung')
    assert.equal(loose.data.art, 'partner')
  })

  await t.test('redeem gebunden: nutzt den bestehenden Partner, legt keinen neuen an, Benutzer-Login optional', async () => {
    const before = snapshot()
    const res = await redeem({ code: boundCode, username: 'lindenhof.team', password: 'lindenhof-pw-1', email: 'team@example.org' })
    assert.equal(res.status, 201, JSON.stringify(res.data))
    assert.equal(countRows('partners'), before.partners)
    assert.equal(res.data.partner.id, boundPartner.id)
    assert.equal(res.data.partner.status, 'aktiv')
    assert.equal(res.data.art, 'partner')
    assert.equal(res.data.name, 'Hundeschule Lindenhof')

    const family = db.prepare('SELECT * FROM families WHERE id = ?').get(res.data.id)
    assert.equal(family.partner_id, boundPartner.id)
    assert.equal(family.voucher_id, voucherRow(boundCode).id)

    const user = db.prepare('SELECT family_id, email FROM users WHERE username = ?').get('lindenhof.team')
    assert.deepEqual({ ...user }, { family_id: family.id, email: 'team@example.org' })
    const userLogin = await post('/api/login', { username: 'lindenhof.team', password: 'lindenhof-pw-1' })
    assert.equal(userLogin.status, 200)
    assert.equal(userLogin.data.partner.id, boundPartner.id)
  })

  await t.test('redeem gebunden: hat der Partner inzwischen einen Bereich -> 409, Gutschein bleibt offen', async () => {
    const partner = await createPartner({ name: 'Hundeschule Zwischendurch' })
    const code = await accessCode({ partnerId: partner.id })
    assert.equal((await adminPost(`/api/admin/partners/${partner.id}/area`)).status, 201)

    const before = snapshot()
    const res = await redeem({ code })
    assert.equal(res.status, 409)
    assertNothingCreated(code, before)
    assert.equal((await check(code)).data.status, 'offen')
  })

  await t.test('redeem gebunden: gesperrter oder Demo-Partner -> 409, Gutschein bleibt offen', async () => {
    const partner = await createPartner({ name: 'Hundeschule Sperrprobe' })
    const code = await accessCode({ partnerId: partner.id })

    for (const flags of [{ gesperrt: 1, is_demo: 0 }, { gesperrt: 0, is_demo: 1 }]) {
      db.prepare('UPDATE partners SET gesperrt = ?, is_demo = ? WHERE id = ?').run(flags.gesperrt, flags.is_demo, partner.id)
      const before = snapshot()
      const res = await redeem({ code })
      assert.equal(res.status, 409, JSON.stringify(flags))
      assert.equal(res.data.error, BLOCKED_PARTNER_MESSAGE)
      assertNothingCreated(code, before)
    }

    // pausiert (ohne Sperre) ist erlaubt - wie entwurf und aktiv
    db.prepare("UPDATE partners SET gesperrt = 0, is_demo = 0, status = 'pausiert' WHERE id = ?").run(partner.id)
    const res = await redeem({ code })
    assert.equal(res.status, 201, JSON.stringify(res.data))
    assert.equal(res.data.partner.id, partner.id)
    assert.equal(res.data.partner.status, 'pausiert')
  })

  await t.test('redeem: gleichzeitiges Einlösen eines Partner-Zugangs -> genau ein Partner und ein Bereich', async () => {
    const code = await accessCode()
    const before = snapshot()
    const [a, b] = await Promise.all([
      redeem({ code, name: 'Hundeschule Gleichzeitig A', typ: 'hundeschule', plz: '10115' }),
      redeem({ code, name: 'Hundeschule Gleichzeitig B', typ: 'hundeschule', plz: '10115' })
    ])
    assert.deepEqual([a.status, b.status].sort(), [201, 410])
    assert.equal(countRows('partners'), before.partners + 1)
    assert.equal(countRows('families'), before.families + 1)

    const winner = a.status === 201 ? a : b
    const areas = db.prepare('SELECT id FROM families WHERE voucher_id = ?').all(voucherRow(code).id)
    assert.deepEqual(areas.map((row) => row.id), [winner.data.id])
    assert.equal(voucherRow(code).redeemed_by_family_id, winner.data.id)
  })

  await t.test('redeem: Züchter-Namen -> 400, nichts angelegt, Gutschein bleibt offen', async () => {
    const code = await accessCode()
    const before = snapshot()
    for (const name of ['Zucht vom Sonnenhang', 'Züchterin Beispielhof']) {
      const res = await redeem({ code, name, typ: 'hundeschule', plz: '10115' })
      assert.equal(res.status, 400)
      assert.match(res.data.error, /Züchter/)
    }
    assertNothingCreated(code, before)
  })

  await t.test('redeem: PLZ, Name und Typ werden geprüft - 400, nichts angelegt', async () => {
    const code = await accessCode()
    const before = snapshot()
    const valid = { code, name: 'Hundeschule Prüfstand', typ: 'hundeschule', plz: '10115' }
    const cases = [
      { plz: '00000' },
      { plz: undefined },
      { plz: 10115 },
      { name: '' },
      { name: 'x'.repeat(121) },
      { typ: 'zuechter' },
      { typ: undefined },
      { username: 'ab', password: 'kurz' },
      { username: 'pruefstand' }
    ]
    for (const override of cases) {
      const res = await redeem({ ...valid, ...override })
      assert.equal(res.status, 400, JSON.stringify(override))
    }
    const unknownPlz = await redeem({ ...valid, plz: '00000' })
    assert.match(unknownPlz.data.error, /Postleitzahl/)
    assertNothingCreated(code, before)
  })

  await t.test('redeem: vergebener Benutzername -> 409, Gutschein bleibt offen, kein Partner angelegt', async () => {
    const code = await accessCode()
    const before = snapshot()
    const res = await redeem({ code, name: 'Hundesalon Doppelt', typ: 'hundesalon', plz: '10115', username: 'lindenhof.team', password: 'noch-ein-pw-1' })
    assert.equal(res.status, 409)
    assertNothingCreated(code, before)
  })

  await t.test('redeem: gleicher Name zweimal -> zweiter Partner bekommt einen eigenen Kurznamen', async () => {
    const first = await redeem({ code: await accessCode(), name: 'Hundesitter Morgenrot', typ: 'betreuung', plz: '10115' })
    const second = await redeem({ code: await accessCode(), name: 'Hundesitter Morgenrot', typ: 'betreuung', plz: '10115' })
    assert.equal(first.status, 201)
    assert.equal(second.status, 201)
    assert.equal(first.data.partner.slug, 'hundesitter-morgenrot')
    assert.equal(second.data.partner.slug, 'hundesitter-morgenrot-2')
  })

  await t.test('redeem: zweimal einlösen -> 410', async () => {
    const code = await accessCode()
    const body = { code, name: 'Hundeschule Doppelklick', typ: 'hundeschule', plz: '10115' }
    assert.equal((await redeem(body)).status, 201)
    const again = await redeem({ ...body, name: 'Hundeschule Nochmal' })
    assert.equal(again.status, 410)
    assert.match(again.data.error, /schon eingelöst/)
  })

  await t.test('claim mit Partner-Zugang -> 400, Gutschein wird nicht verbraucht', async () => {
    const household = await createHousehold(base, 'Zuhause Claim-Versuch')
    const code = await accessCode()
    const res = await post('/api/vouchers/claim', { code }, household.cookie)
    assert.equal(res.status, 400)
    assert.equal(res.data.error, CLAIM_MESSAGE)
    assert.equal(voucherRow(code).redeemed_at, null)
  })

  await t.test('claim: ein geschlossener Partner-Zugang verhält sich wie jeder andere geschlossene Code', async () => {
    const household = await createHousehold(base, 'Zuhause Claim-Geschlossen')
    const claim = (code) => post('/api/vouchers/claim', { code }, household.cookie)
    const chronikCode = async () => (await adminPost('/api/admin/voucher-batches', { label: 'Kunde Claim', size: 1 })).data.codes[0]
    const close = {
      zurückgezogen: (code) => db.prepare("UPDATE vouchers SET revoked_at = datetime('now') WHERE code_hash = ?").run(hashCode(normalizeCode(code))),
      eingelöst: (code) => db.prepare("UPDATE vouchers SET redeemed_at = datetime('now') WHERE code_hash = ?").run(hashCode(normalizeCode(code))),
      abgelaufen: (code) => db.prepare("UPDATE vouchers SET expires_at = '2000-01-01 00:00:00' WHERE code_hash = ?").run(hashCode(normalizeCode(code)))
    }

    for (const [label, closeCode] of Object.entries(close)) {
      const partnerCode = await accessCode()
      const customerCode = await chronikCode()
      closeCode(partnerCode)
      closeCode(customerCode)

      const partnerRes = await claim(partnerCode)
      const customerRes = await claim(customerCode)
      assert.equal(partnerRes.status, 410, label)
      assert.deepEqual(partnerRes.data, customerRes.data, label)
      assert.equal(customerRes.status, 410, label)
      assert.ok(!partnerRes.data.error.includes('Partner-Zugang'), label)
    }
  })

  await t.test('lib: redeemVoucher legt mit einem Partner-Zugang keine Chronik an', () => {
    const { createBatch, redeemVoucher } = require('../lib/vouchers')
    const { codes } = createBatch(db, { label: 'Lib-Zugang', kind: 'admin', size: 1, zweck: 'partnerzugang' })
    const before = snapshot()
    assert.throws(() => redeemVoucher(db, { code: codes[0], name: 'Zuhause Irrtum' }), (err) => err.status === 400)
    assertNothingCreated(codes[0], before)
  })

  await t.test('Weitergabe-Gutscheine eines Partner-Bereichs: nur Chronik-Gutscheine, der Zugang zählt nicht mit', async () => {
    const config = require('../config')
    const res = await redeem({ code: await accessCode(), name: 'Hundeschule Weitergabe', typ: 'hundeschule', plz: '10115' })
    assert.equal(res.status, 201)
    const mine = await call(base, '/api/vouchers/mine', { cookie: getCookie(res.res) })
    assert.equal(mine.status, 200)
    assert.equal(mine.data.length, config.voucherQuota)
    assert.ok(mine.data.every((voucher) => voucher.status === 'offen'))

    const zwecke = db
      .prepare('SELECT DISTINCT b.zweck FROM vouchers v JOIN voucher_batches b ON b.id = v.batch_id WHERE v.issued_by_family_id = ?')
      .all(res.data.id)
      .map((row) => row.zweck)
    assert.deepEqual(zwecke, ['chronik'])
  })

  await t.test('Kunden-Gutschein: Einlösen bleibt wie bisher (Zuhause, kein Partner)', async () => {
    const created = await adminPost('/api/admin/voucher-batches', { label: 'Kunde Regression', size: 1 })
    const before = snapshot()
    const res = await redeem({ code: created.data.codes[0], name: 'Zuhause Regression', typ: 'tierheim', plz: '10115' })
    assert.equal(res.status, 201)
    assert.equal(res.data.art, 'zuhause')
    assert.equal(res.data.partner, undefined)
    assert.equal(res.data.fromOthers, true)
    assert.match(res.data.key, KEY_RE)
    assert.equal(countRows('partners'), before.partners)
    assert.equal(countRows('families'), before.families + 1)

    const missingName = await redeem({ code: (await adminPost('/api/admin/voucher-batches', { label: 'Kunde ohne Name', size: 1 })).data.codes[0] })
    assert.equal(missingName.status, 400)
  })
})
