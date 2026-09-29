const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, createFamily, getCookie } = require('./helpers')

// Phase N Task 1: Gutschein- und Partner-Anfragen (POST /api/public/anfragen) und ihre Bearbeitung im Admin.
// Das Limit (3 je Stunde und IP) testet test/anfragenLimit.test.js - hier großzügig, damit die Fälle unten nicht
// daran scheitern. DNS nur über einen Stub-Resolver (lib/emailCheck.js useResolverForTests), nie echt.
const ADMIN_TEST_PASSWORD = 'admin-test-anfragen-1'
const dataDir = useTempDataDir('anfragen', { ANFRAGE_RATE_LIMIT: '1000' })

function dnsError(code) {
  const err = new Error(code)
  err.code = code
  return err
}

// example.org hat MX, gibt-es-nicht.example gar nichts, langsam.example antwortet mit einem vorübergehenden Fehler.
const stubResolver = {
  resolveMx: async (domain) => {
    if (domain === 'example.org') return [{ exchange: 'mail.example.org', priority: 10 }]
    if (domain === 'langsam.example') throw dnsError('ETIMEOUT')
    throw dnsError('ENOTFOUND')
  },
  resolve4: async () => {
    throw dnsError('ENOTFOUND')
  },
  resolve6: async () => {
    throw dnsError('ENOTFOUND')
  }
}

test('Anfragen: öffentlich stellen, im Admin bearbeiten und einen Gutschein zuweisen', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
  const { useResolverForTests } = require('../lib/emailCheck')
  const restoreResolver = useResolverForTests(stubResolver)
  const { server, base } = await startApp()
  t.after(() => {
    restoreResolver()
    cleanup(dataDir, server)
  })
  const db = require('../db')

  const login = await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: ADMIN_TEST_PASSWORD } })
  const adminCookie = getCookie(login.res)
  const ask = (body, cookie) => call(base, '/api/public/anfragen', { method: 'POST', body, cookie })
  const admin = (urlPath, { method = 'GET', body } = {}) => call(base, urlPath, { method, body, cookie: adminCookie })
  const countRows = () => db.prepare('SELECT COUNT(*) AS n FROM anfragen').get().n
  const lastRow = () => db.prepare('SELECT * FROM anfragen ORDER BY id DESC LIMIT 1').get()

  await t.test('Gutschein-Anfrage: 201 { ok: true } ohne Echo, gespeichert als offen', async () => {
    const res = await ask({
      typ: 'gutschein',
      name: 'Wilma Beispiel',
      email: 'wilma@example.org',
      nachricht: 'Ich habe die Seite gesehen und hätte gern einen Gutschein.'
    })
    assert.equal(res.status, 201)
    assert.deepEqual(res.data, { ok: true })
    const row = lastRow()
    assert.equal(row.typ, 'gutschein')
    assert.equal(row.name, 'Wilma Beispiel')
    assert.equal(row.email, 'wilma@example.org')
    assert.equal(row.status, 'offen')
    assert.equal(row.voucher_id, null)
    assert.equal(row.firma, null)
  })

  await t.test('E-Mail ist Pflicht und muss dem Format entsprechen', async () => {
    const before = countRows()
    const unsafe = ['"><svg/onload=alert(1)>@example.org', 'a,b@example.org', 'a;b@example.org', 'a%40b@example.org', 'a\\b@example.org']
    for (const email of [undefined, '', '   ', 'kein-at-zeichen', 'a@b', 'frage@example.org?x=1', 'a b@example.org', 42, ...unsafe]) {
      const res = await ask({ typ: 'gutschein', email })
      assert.equal(res.status, 400, `E-Mail ${JSON.stringify(email)}`)
      assert.ok(res.data.error)
    }
    assert.equal(countRows(), before)
  })

  await t.test('Domain ohne MX/A/AAAA -> 400 mit Hinweis, nichts gespeichert', async () => {
    const before = countRows()
    const res = await ask({ typ: 'gutschein', email: 'pepper@gibt-es-nicht.example' })
    assert.equal(res.status, 400)
    assert.equal(res.data.error, 'Diese E-Mail-Adresse scheint es nicht zu geben.')
    assert.equal(countRows(), before)
  })

  await t.test('vorübergehender DNS-Fehler -> die Anfrage wird angenommen', async () => {
    const res = await ask({ typ: 'gutschein', email: 'flocke@langsam.example' })
    assert.equal(res.status, 201)
    assert.equal(lastRow().email, 'flocke@langsam.example')
  })

  await t.test('Honigtopf (website) und unbekannter Typ werden abgelehnt', async () => {
    const before = countRows()
    const honeypot = await ask({ typ: 'gutschein', email: 'bot@example.org', website: 'https://spam.example' })
    assert.equal(honeypot.status, 400)
    for (const typ of [undefined, 'rabatt', 'GUTSCHEIN']) {
      const res = await ask({ typ, email: 'typ@example.org' })
      assert.equal(res.status, 400, `Typ ${typ}`)
    }
    const notObject = await call(base, '/api/public/anfragen', { method: 'POST', body: ['gutschein'] })
    assert.equal(notObject.status, 400)
    assert.equal(countRows(), before)
  })

  await t.test('Längen, reiner Text, Steuerzeichen raus', async () => {
    const before = countRows()
    assert.equal((await ask({ typ: 'gutschein', email: 'lang@example.org', name: 'x'.repeat(81) })).status, 400)
    assert.equal((await ask({ typ: 'gutschein', email: 'lang@example.org', nachricht: 'x'.repeat(1001) })).status, 400)
    assert.equal((await ask({ typ: 'gutschein', email: 'html@example.org', nachricht: 'Hallo <b>fett</b>' })).status, 400)
    assert.equal((await ask({ typ: 'gutschein', email: 'html@example.org', name: '<img>' })).status, 400)
    assert.equal((await ask({ typ: 'gutschein', email: 'nichttext@example.org', name: { a: 1 } })).status, 400)
    assert.equal((await ask({ typ: 'gutschein', email: `${'x'.repeat(115)}@example.org` })).status, 400)
    assert.equal(countRows(), before)

    const ok = await ask({ typ: 'gutschein', email: 'steuer@example.org', name: 'Flocke\u0000 ‮Beispiel', nachricht: 'Zeile eins\nZeile zwei\u0007' })
    assert.equal(ok.status, 201)
    const row = lastRow()
    assert.equal(row.name, 'Flocke Beispiel')
    assert.equal(row.nachricht, 'Zeile eins\nZeile zwei')
  })

  await t.test('Partner-Anfrage: Firma Pflicht, Typ aus der Liste, PLZ optional geprüft, Züchter-Schutz', async () => {
    const valid = { typ: 'partner', email: 'kontakt@example.org', firma: 'Hundeschule Pfotenweg', partnerTyp: 'hundeschule' }
    const before = countRows()
    assert.equal((await ask({ ...valid, firma: undefined })).status, 400)
    assert.equal((await ask({ ...valid, firma: '  ' })).status, 400)
    assert.equal((await ask({ ...valid, firma: 'x'.repeat(121) })).status, 400)
    assert.equal((await ask({ ...valid, partnerTyp: undefined })).status, 400)
    assert.equal((await ask({ ...valid, partnerTyp: 'zuechter' })).status, 400)
    assert.equal((await ask({ ...valid, plz: '00000' })).status, 400)
    assert.equal((await ask({ ...valid, plz: 'abc' })).status, 400)
    const breederName = await ask({ ...valid, firma: 'Zwinger vom Waldrand' })
    assert.equal(breederName.status, 400)
    assert.match(breederName.data.error, /Züchter/)
    assert.equal((await ask({ ...valid, nachricht: 'Wir haben Welpen abzugeben und suchen Käufer.' })).status, 400)
    assert.equal(countRows(), before)

    const ok = await ask({ ...valid, name: 'Greta Beispiel', plz: '10115', nachricht: 'Wir würden gern mitmachen.' })
    assert.equal(ok.status, 201)
    assert.deepEqual(ok.data, { ok: true })
    const row = lastRow()
    assert.equal(row.typ, 'partner')
    assert.equal(row.firma, 'Hundeschule Pfotenweg')
    assert.equal(row.partner_typ, 'hundeschule')
    assert.equal(row.plz, '10115')
    assert.equal(row.name, 'Greta Beispiel')

    const withoutPlz = await ask({ ...valid, email: 'ohne-plz@example.org' })
    assert.equal(withoutPlz.status, 201)
    assert.equal(lastRow().plz, null)
  })

  await t.test('Gutschein-Anfrage übernimmt keine Partner-Felder', async () => {
    const res = await ask({ typ: 'gutschein', email: 'nurgutschein@example.org', firma: 'Irgendwas', partnerTyp: 'futter', plz: '10115' })
    assert.equal(res.status, 201)
    const row = lastRow()
    assert.equal(row.firma, null)
    assert.equal(row.partner_typ, null)
    assert.equal(row.plz, null)
  })

  await t.test('Doppelte offene Anfrage (E-Mail + Typ) binnen 24 Stunden -> gleiche Antwort, keine neue Zeile', async () => {
    const first = await ask({ typ: 'gutschein', email: 'doppelt@example.org' })
    assert.equal(first.status, 201)
    const before = countRows()

    const again = await ask({ typ: 'gutschein', email: 'Doppelt@Example.org', nachricht: 'Noch einmal, sicher ist sicher.' })
    assert.equal(again.status, 201)
    assert.deepEqual(again.data, { ok: true })
    assert.equal(countRows(), before, 'keine zweite Zeile')

    const otherTyp = await ask({ typ: 'partner', email: 'doppelt@example.org', firma: 'Futterladen Napf', partnerTyp: 'futter' })
    assert.equal(otherTyp.status, 201)
    assert.equal(countRows(), before + 1, 'anderer Typ zählt extra')

    db.prepare("UPDATE anfragen SET created_at = datetime('now', '-25 hours') WHERE email = 'doppelt@example.org' AND typ = 'gutschein'").run()
    assert.equal((await ask({ typ: 'gutschein', email: 'doppelt@example.org' })).status, 201)
    assert.equal(countRows(), before + 2, 'nach 24 Stunden wieder möglich')

    db.prepare("UPDATE anfragen SET status = 'erledigt' WHERE email = 'doppelt@example.org' AND typ = 'gutschein'").run()
    assert.equal((await ask({ typ: 'gutschein', email: 'doppelt@example.org' })).status, 201)
    assert.equal(countRows(), before + 3, 'eine erledigte Anfrage sperrt nicht')
  })

  await t.test('Demo-Sitzung: 403, nichts gespeichert', async () => {
    const demo = await createFamily(base, 'Rudel Demo Anfragen', 'demo-anfragen-pw-1')
    db.prepare('UPDATE families SET is_demo = 1 WHERE id = ?').run(demo.data.id)
    const before = countRows()
    const res = await ask({ typ: 'gutschein', email: 'demo@example.org' }, demo.cookie)
    assert.equal(res.status, 403)
    assert.match(res.data.error, /Demo/)
    assert.equal(countRows(), before)
  })

  await t.test('Admin-Liste: nur mit Admin-Cookie, offene zuerst, ?status filtert', async () => {
    assert.equal((await call(base, '/api/admin/anfragen')).status, 401)

    const all = await admin('/api/admin/anfragen')
    assert.equal(all.status, 200)
    assert.equal(all.data.length, countRows())
    const wilma = all.data.find((item) => item.email === 'wilma@example.org')
    assert.deepEqual(Object.keys(wilma).sort(), [
      'createdAt', 'email', 'erledigtAt', 'firma', 'gutschein', 'id', 'nachricht', 'name', 'notiz', 'ort', 'partnerTyp', 'plz', 'status', 'typ'
    ])
    assert.equal(wilma.gutschein, null)
    const greta = all.data.find((item) => item.firma === 'Hundeschule Pfotenweg' && item.plz)
    assert.equal(greta.ort, 'Berlin')
    assert.equal(greta.partnerTyp, 'hundeschule')
    const firstClosed = all.data.findIndex((item) => item.status !== 'offen')
    assert.ok(all.data.slice(firstClosed).every((item) => item.status !== 'offen'), 'offene stehen vorn')

    const offen = await admin('/api/admin/anfragen?status=offen')
    assert.ok(offen.data.length > 0)
    assert.ok(offen.data.every((item) => item.status === 'offen'))
    const erledigt = await admin('/api/admin/anfragen?status=erledigt')
    assert.ok(erledigt.data.every((item) => item.status === 'erledigt'))
    assert.equal((await admin('/api/admin/anfragen?status=quatsch')).status, 400)
  })

  await t.test('PUT: Status und Notiz, Abschluss-Zeitpunkt, 404 für Unbekanntes', async () => {
    const id = db.prepare("SELECT id FROM anfragen WHERE email = 'wilma@example.org'").get().id
    assert.equal((await call(base, `/api/admin/anfragen/${id}`, { method: 'PUT', body: { status: 'erledigt' } })).status, 401)
    assert.equal((await admin(`/api/admin/anfragen/${id}`, { method: 'PUT', body: { status: 'vielleicht' } })).status, 400)
    assert.equal((await admin(`/api/admin/anfragen/${id}`, { method: 'PUT', body: { notiz: 'x'.repeat(1001) } })).status, 400)
    assert.equal((await admin(`/api/admin/anfragen/${id}`, { method: 'PUT', body: {} })).status, 400)
    assert.equal((await admin('/api/admin/anfragen/999999', { method: 'PUT', body: { status: 'erledigt' } })).status, 404)
    assert.equal((await admin('/api/admin/anfragen/abc', { method: 'PUT', body: { status: 'erledigt' } })).status, 404)

    const noted = await admin(`/api/admin/anfragen/${id}`, { method: 'PUT', body: { notiz: '  Per E-Mail nachgefragt.  ' } })
    assert.equal(noted.status, 200)
    assert.equal(noted.data.notiz, 'Per E-Mail nachgefragt.')
    assert.equal(noted.data.status, 'offen')

    const rejected = await admin(`/api/admin/anfragen/${id}`, { method: 'PUT', body: { status: 'abgelehnt' } })
    assert.equal(rejected.data.status, 'abgelehnt')
    assert.ok(rejected.data.erledigtAt)
    assert.equal(rejected.data.notiz, 'Per E-Mail nachgefragt.', 'Notiz bleibt, wenn sie fehlt')

    db.prepare("UPDATE anfragen SET erledigt_at = '2026-01-01 10:00:00' WHERE id = ?").run(id)
    const again = await admin(`/api/admin/anfragen/${id}`, { method: 'PUT', body: { status: 'abgelehnt', notiz: 'Zweimal abgelehnt.' } })
    assert.equal(again.data.erledigtAt, '2026-01-01 10:00:00', 'derselbe Status behält den Abschluss-Zeitpunkt')
    const switched = await admin(`/api/admin/anfragen/${id}`, { method: 'PUT', body: { status: 'erledigt' } })
    assert.notEqual(switched.data.erledigtAt, '2026-01-01 10:00:00', 'ein anderer Abschluss setzt ihn neu')

    const reopened = await admin(`/api/admin/anfragen/${id}`, { method: 'PUT', body: { status: 'offen', notiz: '' } })
    assert.equal(reopened.data.status, 'offen')
    assert.equal(reopened.data.erledigtAt, null)
    assert.equal(reopened.data.notiz, null)
  })

  await t.test('Gutschein zuweisen: passender Stapel, Code einmal, no-store ohne ETag, Protokoll ohne Code', async () => {
    const chronik = await admin('/api/admin/voucher-batches', { method: 'POST', body: { label: 'Anfragen Herbst', size: 2 } })
    const zugang = await admin('/api/admin/voucher-batches', { method: 'POST', body: { label: 'Partner Herbst', size: 1, zweck: 'partnerzugang' } })
    assert.equal(chronik.status, 201)
    assert.equal(zugang.status, 201)
    const chronikBatch = chronik.data.batch.id
    const zugangBatch = zugang.data.batch.id

    const gutscheinIds = db.prepare("SELECT id FROM anfragen WHERE typ = 'gutschein' AND status = 'offen' ORDER BY id").all().map((row) => row.id)
    const partnerId = db.prepare("SELECT id FROM anfragen WHERE typ = 'partner' AND status = 'offen' ORDER BY id").get().id
    const [first, second, third] = gutscheinIds
    const assign = (id, batchId, cookie = adminCookie) => call(base, `/api/admin/anfragen/${id}/gutschein`, { method: 'POST', body: { batchId }, cookie })

    assert.equal((await assign(first, chronikBatch, null)).status, 401, 'ohne Admin-Cookie')
    const mismatch = await assign(first, zugangBatch)
    assert.equal(mismatch.status, 400)
    assert.equal((await assign(partnerId, chronikBatch)).status, 400)
    assert.equal((await assign(first, 999999)).status, 404)
    assert.equal((await assign(first, 'abc')).status, 404)
    assert.equal((await assign(999999, chronikBatch)).status, 404)

    const ok = await assign(first, chronikBatch)
    assert.equal(ok.status, 200)
    assert.match(ok.data.code, /^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/)
    assert.ok(chronik.data.codes.includes(ok.data.code))
    assert.equal(ok.headers.get('cache-control'), 'no-store')
    assert.equal(ok.headers.get('etag'), null)
    assert.equal(ok.data.anfrage.status, 'erledigt')
    assert.ok(ok.data.anfrage.erledigtAt)
    assert.equal(ok.data.anfrage.gutschein.hint, ok.data.code.slice(-4))
    assert.equal(ok.data.anfrage.gutschein.status, 'offen')
    assert.equal(JSON.stringify(ok.data.anfrage).includes(ok.data.code), false, 'die Anfrage selbst trägt den Code nie')

    const twice = await assign(first, chronikBatch)
    assert.equal(twice.status, 409)
    assert.equal(twice.headers.get('cache-control'), 'no-store')

    const other = await assign(second, chronikBatch)
    assert.equal(other.status, 200)
    assert.notEqual(other.data.code, ok.data.code, 'ein Code wird nie zweimal vergeben')

    const empty = await assign(third, chronikBatch)
    assert.equal(empty.status, 409)
    assert.match(empty.data.error, /kein freier/)
    assert.equal(db.prepare('SELECT status FROM anfragen WHERE id = ?').get(third).status, 'offen')

    const partner = await assign(partnerId, zugangBatch)
    assert.equal(partner.status, 200)
    assert.ok(zugang.data.codes.includes(partner.data.code))

    // Stapel-Details: zugewiesene Gutscheine sind markiert (bleiben aber offen und druckbar).
    const detail = await admin(`/api/admin/voucher-batches/${chronikBatch}`)
    assert.deepEqual(detail.data.vouchers.map((voucher) => voucher.zugewiesen), [true, true])
    assert.ok(detail.data.vouchers.every((voucher) => voucher.status === 'offen' && voucher.code))
    const list = await admin('/api/admin/voucher-batches')
    const listed = list.data.find((batch) => batch.id === chronikBatch)
    assert.equal(listed.open, 2)
    assert.equal(listed.assigned, 2)

    const log = await admin('/api/admin/log')
    const entries = log.data.filter((entry) => entry.aktion === 'gutschein-zugewiesen')
    assert.deepEqual(entries.map((entry) => entry.ziel).sort(), [`anfrage:${first}`, `anfrage:${second}`, `anfrage:${partnerId}`].sort())
    const logText = JSON.stringify(log.data)
    for (const code of [ok.data.code, other.data.code, partner.data.code]) {
      assert.equal(logText.includes(code) || logText.includes(code.replace(/-/g, '')), false)
    }

    // Der zugewiesene Code funktioniert ganz normal.
    const redeemed = await call(base, '/api/vouchers/redeem', { method: 'POST', body: { code: ok.data.code, name: 'Zuhause Wilma' } })
    assert.equal(redeemed.status, 201)
    const listedAfter = await admin('/api/admin/anfragen?status=erledigt')
    assert.equal(listedAfter.data.find((item) => item.id === first).gutschein.status, 'eingelöst')
  })

  await t.test('Gutschein zuweisen: nur aus Admin-Stapeln ohne Rudel, Übergabe oder Bindung', async () => {
    const { createBatch } = require('../lib/vouchers')
    const rudel = await createFamily(base, 'Familie Anfragen-Rudel', 'anfragen-rudel-pw-1')
    const join = createBatch(db, { label: 'Einladung', kind: 'admin', size: 1, joinFamilyId: rudel.data.id })
    const weitergabe = createBatch(db, { label: 'Weitergabe', kind: 'rudel', size: 1, issuedByFamilyId: rudel.data.id })
    const id = db.prepare("INSERT INTO anfragen (typ, email) VALUES ('gutschein', 'stapel@example.org')").run().lastInsertRowid

    const joinRes = await admin(`/api/admin/anfragen/${id}/gutschein`, { method: 'POST', body: { batchId: join.batchId } })
    assert.equal(joinRes.status, 409, 'eine Rudel-Einladung ist kein freier Gutschein')
    const weitergabeRes = await admin(`/api/admin/anfragen/${id}/gutschein`, { method: 'POST', body: { batchId: weitergabe.batchId } })
    assert.equal(weitergabeRes.status, 400)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM vouchers WHERE zugewiesen_an_anfrage_id IS NOT NULL').get().n, 3)
  })

  await t.test('Zurückgezogener oder abgelaufener Gutschein: die Anfrage bekommt einen neuen, ein offener bleibt', async () => {
    const batch = await admin('/api/admin/voucher-batches', { method: 'POST', body: { label: 'Ersatz', size: 3 } })
    const id = db.prepare("INSERT INTO anfragen (typ, email) VALUES ('gutschein', 'ersatz@example.org')").run().lastInsertRowid
    const assign = () => admin(`/api/admin/anfragen/${id}/gutschein`, { method: 'POST', body: { batchId: batch.data.batch.id } })

    const first = await assign()
    assert.equal(first.status, 200)
    assert.equal((await assign()).status, 409, 'offen: bleibt die Zuweisung')

    const revoked = await admin(`/api/admin/vouchers/${first.data.anfrage.gutschein.id}/revoke`, { method: 'POST' })
    assert.equal(revoked.data.status, 'widerrufen')
    const second = await assign()
    assert.equal(second.status, 200)
    assert.notEqual(second.data.code, first.data.code)
    assert.equal(second.data.anfrage.gutschein.status, 'offen')

    db.prepare("UPDATE vouchers SET expires_at = '2020-01-01 00:00:00' WHERE id = ?").run(second.data.anfrage.gutschein.id)
    const third = await assign()
    assert.equal(third.status, 200, 'abgelaufen: ebenfalls neu')
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM vouchers WHERE zugewiesen_an_anfrage_id = ?').get(id).n, 3)
  })

  await t.test('Partner-Zugang mit Typ-Vorgabe passt nur zu einer Anfrage desselben Typs', async () => {
    const tierheim = await admin('/api/admin/voucher-batches', { method: 'POST', body: { label: 'Tierheime', size: 1, zweck: 'partnerzugang', partnerTyp: 'tierheim' } })
    const id = db
      .prepare("INSERT INTO anfragen (typ, email, firma, partner_typ) VALUES ('partner', 'salon@example.org', 'Salon Locke', 'hundesalon')")
      .run().lastInsertRowid
    const res = await admin(`/api/admin/anfragen/${id}/gutschein`, { method: 'POST', body: { batchId: tierheim.data.batch.id } })
    assert.equal(res.status, 400)
    assert.match(res.data.error, /tierheim/)
  })

  await t.test('DELETE: löscht die Anfrage, der zugewiesene Gutschein bleibt vergeben', async () => {
    const assigned = db.prepare('SELECT id, voucher_id FROM anfragen WHERE voucher_id IS NOT NULL ORDER BY id LIMIT 1').get()
    assert.equal((await call(base, `/api/admin/anfragen/${assigned.id}`, { method: 'DELETE' })).status, 401)
    const res = await admin(`/api/admin/anfragen/${assigned.id}`, { method: 'DELETE' })
    assert.equal(res.status, 204)
    assert.equal((await admin(`/api/admin/anfragen/${assigned.id}`, { method: 'DELETE' })).status, 404)
    assert.equal(db.prepare('SELECT zugewiesen_an_anfrage_id AS a FROM vouchers WHERE id = ?').get(assigned.voucher_id).a, assigned.id)
  })
})
