const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, getCookie } = require('./helpers')
const { validateTermine, formatTermin, heuteBerlin, datumPlusTage, MAX_TAGE_VORAUS } = require('../lib/terminvorschlaege')

// Geschäftsanfrage (/partner-werden): POST /api/public/anfragen mit body.geschaeft, Terminvorschläge, Bestätigung im
// Admin, Text der Admin-Benachrichtigung. DNS nur über einen Stub-Resolver.
const ADMIN_TEST_PASSWORD = 'admin-test-geschaeft-1'
const dataDir = useTempDataDir('geschaeft-anfragen', { ANFRAGE_RATE_LIMIT: '1000' })

// Fester Zeitpunkt für die reinen Prüfungen: Samstag, 10.10.2026, mittags in Berlin.
const NOW = Date.parse('2026-10-10T10:00:00Z')

// Der n-te Werktag (Mo–Sa) ab morgen, bezogen auf heute in Berlin.
function werktag(n, now = Date.now()) {
  const heute = heuteBerlin(now)
  let found = 0
  for (let tage = 1; tage <= MAX_TAGE_VORAUS; tage += 1) {
    const datum = datumPlusTage(heute, tage)
    if (new Date(`${datum}T00:00:00Z`).getUTCDay() !== 0 && ++found === n) return datum
  }
  throw new Error('kein Werktag')
}

function geschaeftBody(overrides = {}, geschaeft = {}) {
  return {
    typ: 'partner',
    firma: 'Hundeschule Wiesengrund',
    name: 'Wilma Beispiel',
    email: 'wilma@example.org',
    plz: '10115',
    nachricht: 'Wir möchten gern mitmachen.',
    geschaeft: {
      art: 'hundeschule',
      ort: 'Berlin',
      telefon: '+49 30 1234567',
      webseite: 'https://wiesengrund.example.org',
      bundesweit: false,
      einwilligung: true,
      termine: [{ datum: werktag(1), zeitfenster: 'vormittag', kanal: 'telefon' }, { datum: werktag(2), zeitfenster: 'abend' }],
      ...geschaeft
    },
    ...overrides
  }
}

test('Terminvorschläge: Regeln für Anzahl, Datum, Zeitfenster und Kanal', () => {
  const ok = validateTermine([{ datum: '2026-10-12', zeitfenster: 'mittag', kanal: 'video' }], { now: NOW })
  assert.deepEqual(ok, [{ datum: '2026-10-12', zeitfenster: 'mittag', kanal: 'video' }])
  const fails = (termine) => assert.throws(() => validateTermine(termine, { now: NOW }), (err) => err.status === 400)
  fails([])
  fails('2026-10-12')
  fails(Array.from({ length: 4 }, (_, i) => ({ datum: `2026-10-1${i + 2}`, zeitfenster: 'mittag' })))
  fails([{ datum: '2026-10-10', zeitfenster: 'mittag' }]) // heute
  fails([{ datum: '2026-10-11', zeitfenster: 'mittag' }]) // Sonntag
  fails([{ datum: datumPlusTage('2026-10-10', 61), zeitfenster: 'mittag' }])
  fails([{ datum: '2026-02-30', zeitfenster: 'mittag' }])
  fails([{ datum: '2026-10-12', zeitfenster: 'nachts' }])
  fails([{ datum: '2026-10-12', zeitfenster: 'mittag', kanal: 'brief' }])
  fails([{ datum: '2026-10-12', zeitfenster: 'mittag' }, { datum: '2026-10-12', zeitfenster: 'mittag', kanal: 'video' }])
  assert.equal(formatTermin({ datum: '2026-10-13', zeitfenster: 'vormittag', kanal: 'telefon' }), 'Dienstag, 13.10.2026, Vormittag (9–12 Uhr), Telefon')
})

test('Geschäftsanfrage: prüfen, speichern, im Admin zeigen und einen Termin bestätigen', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
  const { useResolverForTests } = require('../lib/emailCheck')
  const restoreResolver = useResolverForTests({
    resolveMx: async () => [{ exchange: 'mail.example.org', priority: 10 }],
    resolve4: async () => [],
    resolve6: async () => []
  })
  const { server, base } = await startApp()
  t.after(() => {
    restoreResolver()
    cleanup(dataDir, server)
  })
  const db = require('../db')
  const login = await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: ADMIN_TEST_PASSWORD } })
  const adminCookie = getCookie(login.res)
  const ask = (body) => call(base, '/api/public/anfragen', { method: 'POST', body })
  const admin = (urlPath, { method = 'GET', body } = {}) => call(base, urlPath, { method, body, cookie: adminCookie })
  const countRows = () => db.prepare('SELECT COUNT(*) AS n FROM geschaeft_anfragen').get().n

  await t.test('Pflichtfelder und Regeln werden serverseitig geprüft', async () => {
    const cases = [
      [{ email: undefined }, {}, /E-Mail-Adresse/],
      [{ email: 'kein-at' }, {}, /E-Mail-Adresse ist ungültig/],
      [{ name: '' }, {}, /Ansprechperson/],
      [{ plz: '' }, {}, /Postleitzahl/],
      [{ firma: '' }, {}, /Namen eurer Hundeschule/],
      [{}, { art: 'zuechter' }, /aus der Liste/],
      [{}, { ort: '' }, /Ort/],
      [{}, { webseite: 'http://wiesengrund.example.org' }, /https/],
      [{}, { telefon: 'ruf an' }, /Telefonnummer/],
      [{}, { einwilligung: false }, /kontaktieren/],
      [{}, { termine: [] }, /mindestens 1/],
      [{}, { termine: [{ datum: heuteBerlin(), zeitfenster: 'mittag' }] }, /zwischen morgen/],
      [{ nachricht: 'x'.repeat(1001) }, {}, /Nachricht/]
    ]
    for (const [overrides, geschaeft, pattern] of cases) {
      const res = await ask(geschaeftBody(overrides, geschaeft))
      assert.equal(res.status, 400, JSON.stringify({ overrides, geschaeft }))
      assert.match(res.data.error, pattern)
    }
    assert.equal(countRows(), 0)
  })

  await t.test('Honigtopf (website) lehnt ab, die echte Webseite steht in geschaeft.webseite', async () => {
    const res = await ask({ ...geschaeftBody(), website: 'https://spam.example' })
    assert.equal(res.status, 400)
    assert.equal(countRows(), 0)
  })

  await t.test('gültige Anfrage: 201 ohne Echo, Grunddaten in anfragen, Vorschläge in geschaeft_anfragen', async () => {
    const res = await ask(geschaeftBody({}, { art: 'tierarzt', bundesweit: true }))
    assert.equal(res.status, 201)
    assert.deepEqual(res.data, { ok: true })
    const row = db.prepare('SELECT * FROM anfragen ORDER BY id DESC LIMIT 1').get()
    assert.equal(row.typ, 'partner')
    assert.equal(row.partner_typ, 'sonstige')
    assert.equal(row.plz, '10115')
    const extra = db.prepare('SELECT * FROM geschaeft_anfragen WHERE anfrage_id = ?').get(row.id)
    assert.equal(extra.art, 'tierarzt')
    assert.equal(extra.bundesweit, 1)
    assert.equal(JSON.parse(extra.termine).length, 2)
  })

  await t.test('ältere Partner-Anfrage ohne Geschäftsangaben bleibt möglich und lesbar', async () => {
    const res = await ask({ typ: 'partner', email: 'lotte@example.org', firma: 'Hundesalon Lotte', partnerTyp: 'hundesalon' })
    assert.equal(res.status, 201)
    const list = await admin('/api/admin/anfragen')
    const alt = list.data.anfragen.find((a) => a.email === 'lotte@example.org')
    assert.equal(alt.geschaeft, null)
  })

  await t.test('Admin sieht Details und Vorschläge und bestätigt einen davon', async () => {
    const list = await admin('/api/admin/anfragen')
    const anfrage = list.data.anfragen.find((a) => a.email === 'wilma@example.org')
    assert.equal(anfrage.geschaeft.art, 'tierarzt')
    assert.equal(anfrage.geschaeft.webseite, 'https://wiesengrund.example.org/')
    assert.equal(anfrage.geschaeft.termine[0].kanal, 'telefon')
    assert.equal(anfrage.geschaeft.bestaetigt, null)

    const bad = await admin(`/api/admin/anfragen/${anfrage.id}/termin`, { method: 'PUT', body: { index: 2 } })
    assert.equal(bad.status, 400, 'nur zwei Vorschläge')
    const ok = await admin(`/api/admin/anfragen/${anfrage.id}/termin`, { method: 'PUT', body: { index: 1, notiz: 'Wir rufen an.' } })
    assert.equal(ok.status, 200)
    assert.equal(ok.data.geschaeft.bestaetigt.index, 1)
    assert.equal(ok.data.geschaeft.bestaetigt.notiz, 'Wir rufen an.')
    assert.ok(ok.data.aktualisiertAt)
    const undo = await admin(`/api/admin/anfragen/${anfrage.id}/termin`, { method: 'PUT', body: { index: null } })
    assert.equal(undo.data.geschaeft.bestaetigt, null)

    const alt = list.data.anfragen.find((a) => a.email === 'lotte@example.org')
    assert.equal((await admin(`/api/admin/anfragen/${alt.id}/termin`, { method: 'PUT', body: { index: 0 } })).status, 404)
    assert.equal((await call(base, `/api/admin/anfragen/${anfrage.id}/termin`, { method: 'PUT', body: { index: 0 } })).status, 401)
  })

  await t.test('Löschen der Anfrage nimmt die Geschäftsangaben mit', async () => {
    const id = db.prepare("SELECT id FROM anfragen WHERE email = 'wilma@example.org'").get().id
    assert.equal((await admin(`/api/admin/anfragen/${id}`, { method: 'DELETE' })).status, 204)
    assert.equal(countRows(), 0)
  })
})

// Nach dem App-Test: lib/notify.js lädt config - vorher wäre ADMIN_PASSWORD_HASH noch nicht gesetzt.
test('Admin-Benachrichtigung mit Details nennt Ort und Termine, ohne Details nur die Kopfzeile', () => {
  const { buildText, EREIGNIS } = require('../lib/notify')
  const daten = { firma: 'Hundeschule Wiesengrund', partnerTyp: 'hundeschule', ort: '10115 Berlin', termine: '1) Dienstag, 13.10.2026, Vormittag (9–12 Uhr)' }
  const text = buildText(EREIGNIS.partnerAnfrage, daten, { details: true })
  assert.match(text, /Ort: 10115 Berlin/)
  assert.match(text, /Termine: 1\) Dienstag, 13\.10\.2026, Vormittag/)
  assert.doesNotMatch(buildText(EREIGNIS.partnerAnfrage, daten), /Termine/)
})
