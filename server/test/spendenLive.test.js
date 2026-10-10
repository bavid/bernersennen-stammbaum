const test = require('node:test')
const { before } = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, getCookie } = require('./helpers')

// „Spenden live“: erfasste Spenden (lib/spenden.js, routes/adminSpenden.js), der öffentliche Stand und Live-Strom
// (lib/spendenLive.js, routes/finanzierung.js), der vorbereitete Webhook (lib/spendenWebhook.js) und die Vorleistung
// „Anschub“ in der Rechnung (lib/finanzierungVerteilung.js). t.test() bleibt auf einer Ebene.
const ADMIN_TEST_PASSWORD = 'admin-test-spenden-1'
const FAKE_SECRET = 'test-webhook-secret-1234567890'
const dataDir = useTempDataDir('spenden-live', { LOGIN_RATE_LIMIT: '300' })
delete process.env.SPENDEN_WEBHOOK_SECRET

before(async () => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
})

function expectError(fn, feld) {
  assert.throws(fn, (err) => {
    assert.equal(err.status, 400)
    if (feld) assert.equal(err.feld, feld)
    return true
  })
}

// Erstes SSE-Ereignis „stand“ lesen; liefert { data, next(), close() }.
function openStream(base) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${base}/api/finanzierung/live/stream`, (res) => {
      let buffer = ''
      const waiting = []
      res.setEncoding('utf8')
      res.on('data', (chunk) => {
        buffer += chunk
        let match
        while ((match = /event: stand\ndata: (.*)\n\n/.exec(buffer))) {
          buffer = buffer.slice(match.index + match[0].length)
          const payload = JSON.parse(match[1])
          const waiter = waiting.shift()
          if (waiter) waiter(payload)
        }
      })
      const next = () => new Promise((done) => waiting.push(done))
      next().then((data) => resolve({ res, data, next, close: () => req.destroy() }))
    })
    req.on('error', reject)
  })
}

test('lib/spenden: Prüfung einer Spende', () => {
  const { validateSpende, heuteIso } = require('../lib/spenden')
  const now = new Date('2026-10-10T12:00:00')
  assert.deepEqual(validateSpende({ betragCents: 2000, quelle: 'gofundme' }, now), {
    betrag_cents: 2000,
    datum: '2026-10-10',
    quelle: 'gofundme',
    anzeigename: null,
    nachricht: null,
    oeffentlich: 1
  })
  assert.equal(heuteIso(now), '2026-10-10')
  const voll = validateSpende({ betragCents: 1, datum: '2026-10-01', quelle: 'bar', anzeigename: ' Wilma ', nachricht: 'Für die Fellnasen!', oeffentlich: false }, now)
  assert.equal(voll.anzeigename, 'Wilma')
  assert.equal(voll.oeffentlich, 0)
  expectError(() => validateSpende({ betragCents: 0, quelle: 'bar' }, now), 'betragCents')
  expectError(() => validateSpende({ betragCents: 12.5, quelle: 'bar' }, now), 'betragCents')
  expectError(() => validateSpende({ quelle: 'bar' }, now), 'betragCents')
  expectError(() => validateSpende({ betragCents: 100, quelle: 'bitcoin' }, now), 'quelle')
  expectError(() => validateSpende({ betragCents: 100, quelle: 'bar', anzeigename: 'x'.repeat(41) }, now), 'anzeigename')
  expectError(() => validateSpende({ betragCents: 100, quelle: 'bar', anzeigename: '<b>Benno</b>' }, now), 'anzeigename')
  expectError(() => validateSpende({ betragCents: 100, quelle: 'bar', nachricht: 'x'.repeat(141) }, now), 'nachricht')
  expectError(() => validateSpende({ betragCents: 100, quelle: 'bar', nachricht: 'a > b' }, now), 'nachricht')
  expectError(() => validateSpende({ betragCents: 100, quelle: 'bar', datum: '2026-12-24' }, now), 'datum')
  expectError(() => validateSpende({ betragCents: 100, quelle: 'bar', oeffentlich: 'ja' }, now), 'oeffentlich')
  expectError(() => validateSpende({ betragCents: 100, quelle: 'bar', isDemo: true }, now))
})

test('lib/spendenWebhook: Zeitkopf nur ganze Sekunden, höchstens 5 Minuten daneben; Signatur über Zeit und Body', () => {
  const { zeitGueltig, signatur, signaturGueltig } = require('../lib/spendenWebhook')
  const nowMs = 1_800_000_000_000
  const sek = nowMs / 1000
  assert.equal(zeitGueltig(String(sek), nowMs), true)
  assert.equal(zeitGueltig(String(sek - 300), nowMs), true)
  assert.equal(zeitGueltig(String(sek + 301), nowMs), false)
  for (const falsch of [undefined, '', 'abc', '1.5', '-1']) assert.equal(zeitGueltig(falsch, nowMs), false)
  const raw = Buffer.from('{"id":"x"}')
  const sig = signatur(FAKE_SECRET, String(sek), raw)
  assert.equal(signaturGueltig(FAKE_SECRET, raw, sig, String(sek), nowMs), true)
  assert.equal(signaturGueltig(FAKE_SECRET, raw, sig, String(sek + 1), nowMs), false)
})

test('lib/finanzierungVerteilung: Reihenfolge Kosten -> Vorleistung -> Überschuss', () => {
  const { berechneFinanzen } = require('../lib/finanzierungVerteilung')
  const heute = new Date('2026-10-10T12:00:00')
  const posten = [{ titel: 'Server', betragCents: 10000, intervall: 'monat', kategorie: 'technik', ab: '2026-01-01', bis: null }]
  const vorleistungen = [{ titel: 'Flyer', kategorie: 'druck', betragCents: 300000, datum: '2026-02-15' }]
  const quartale = [
    { jahr: 2026, quartal: 1, einnahmenSpendenCents: 230000, kostenCents: 0 },
    { jahr: 2026, quartal: 2, einnahmenSpendenCents: 230000, kostenCents: 0 }
  ]
  const r = berechneFinanzen({ quartale, posten, vorleistungen, heute })
  // Q1: 2.300 € Spenden − 300 € Kosten = 2.000 € -> alles in die Vorleistung, kein Überschuss.
  assert.equal(r.verteilung[0].vorleistungCents, 200000)
  assert.equal(r.verteilung[0].ueberschussCents, 0)
  // Q2: wieder 2.000 € nach Kosten -> 1.000 € decken den Rest der Vorleistung, 1.000 € Überschuss (20 % Rücklage).
  assert.equal(r.verteilung[1].vorleistungCents, 100000)
  assert.equal(r.verteilung[1].ueberschussCents, 100000)
  assert.equal(r.verteilung[1].reserveCents, 20000)
  assert.deepEqual(r.vorleistung, {
    gesamtCents: 300000,
    gedecktCents: 300000,
    offenCents: 0,
    posten: [{ titel: 'Flyer', kategorie: 'druck', betragCents: 300000, datum: '2026-02-15', gedecktCents: 300000 }]
  })
  // Die Vorleistung zählt in die Kosten bisher (Saldo), nicht in die Jahreskosten.
  assert.equal(r.kostenProJahrCents, 120000)
  assert.equal(r.kostenBisherCents, 100000 + 300000)
  // Eine Vorleistung NACH dem Quartal wird dort nicht gedeckt.
  const spaet = berechneFinanzen({ quartale: quartale.slice(0, 1), posten, vorleistungen: [{ ...vorleistungen[0], datum: '2026-05-01' }], heute })
  assert.equal(spaet.verteilung[0].vorleistungCents, 0)
  assert.equal(spaet.vorleistung.offenCents, 300000)
})

test('Spenden live: Admin, Summen, öffentlicher Stand, Demo, Live-Strom, Webhook', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const { heuteIso } = require('../lib/spenden')
  const db = require('../db')
  const heute = heuteIso()
  const [jahr, monat] = heute.split('-').map(Number)
  const quartal = Math.ceil(monat / 3)
  const login = await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: ADMIN_TEST_PASSWORD } })
  const adminCookie = getCookie(login.res)
  const adminLog = () => db.prepare('SELECT aktion, ziel FROM admin_log ORDER BY id').all()
  let spendeId

  await t.test('Admin-Routen: ohne Anmeldung 401, no-store', async () => {
    const res = await call(base, '/api/admin/spenden')
    assert.equal(res.status, 401)
    assert.equal(res.headers.get('cache-control'), 'no-store')
    assert.equal((await call(base, '/api/admin/spenden', { method: 'POST', body: { betragCents: 100, quelle: 'bar' } })).status, 401)
    assert.equal((await call(base, '/api/admin/spenden/1', { method: 'DELETE' })).status, 401)
  })

  await t.test('Demo-Spenden erscheinen nur, solange es keine echten gibt - nie in Quartalen', async () => {
    const { replaceDemoSpenden } = require('../lib/demoSpenden')
    replaceDemoSpenden(db)
    const live = await call(base, '/api/finanzierung/live')
    assert.equal(live.status, 200)
    assert.equal(live.data.demo, true)
    assert.ok(live.data.summeGesamt > 0)
    const pub = await call(base, '/api/finanzierung')
    assert.deepEqual(pub.data.quartale, [])
    // Demo-Regel aus (wie in Produktion): keine Demo-Zahlen.
    db.prepare("INSERT INTO settings (key, value) VALUES ('community_demo_partner_erlaubt', '0')").run()
    const aus = await call(base, '/api/finanzierung/live')
    assert.equal(aus.data.demo, false)
    assert.equal(aus.data.summeGesamt, 0)
    db.prepare("DELETE FROM settings WHERE key = 'community_demo_partner_erlaubt'").run()
  })

  await t.test('Admin erfasst eine Spende: Prüfung am Feld, 201, Protokoll ohne Inhalt', async () => {
    const bad = await call(base, '/api/admin/spenden', { method: 'POST', body: { betragCents: 0, quelle: 'bar' }, cookie: adminCookie })
    assert.equal(bad.status, 400)
    assert.equal(bad.data.feld, 'betragCents')
    const res = await call(base, '/api/admin/spenden', {
      method: 'POST',
      body: { betragCents: 2000, quelle: 'gofundme', nachricht: 'Für die Fellnasen!' },
      cookie: adminCookie
    })
    assert.equal(res.status, 201)
    assert.equal(res.headers.get('cache-control'), 'no-store')
    spendeId = res.data.id
    assert.equal(res.data.datum, heute)
    assert.equal(res.data.oeffentlich, true)
    assert.equal(res.data.isDemo, false)
    assert.deepEqual(adminLog().at(-1), { aktion: 'spende-erfasst', ziel: `spende:${spendeId}` })
    const privat = await call(base, '/api/admin/spenden', {
      method: 'POST',
      body: { betragCents: 1000, quelle: 'bar', anzeigename: 'Lotte', oeffentlich: false },
      cookie: adminCookie
    })
    assert.equal(privat.status, 201)
    const list = await call(base, '/api/admin/spenden', { cookie: adminCookie })
    assert.equal(list.data.spenden.filter((s) => !s.isDemo).length, 2)
  })

  await t.test('öffentlicher Stand: Schlüssel, nur echte Spenden, nur Öffentliches', async () => {
    db.prepare("INSERT INTO finanzierung_kosten (titel, betrag_cents, intervall, ab) VALUES ('Server', 4000, 'monat', '2026-01-01')").run()
    const res = await call(base, '/api/finanzierung/live')
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('cache-control'), 'public, max-age=30')
    assert.deepEqual(Object.keys(res.data).sort(), ['deckungProzent', 'demo', 'kostenMonat', 'letzte', 'stand', 'summeGesamt', 'summeJahr', 'summeMonat', 'vorleistung'].sort())
    assert.equal(res.data.demo, false)
    assert.equal(res.data.summeMonat, 3000)
    assert.equal(res.data.summeJahr, 3000)
    assert.equal(res.data.summeGesamt, 3000)
    assert.equal(res.data.kostenMonat, 4000)
    assert.equal(res.data.deckungProzent, 75)
    assert.equal(res.data.letzte.length, 1)
    const [eintrag] = res.data.letzte
    assert.deepEqual(Object.keys(eintrag).sort(), ['betragCents', 'datum', 'erfasst', 'nachricht', 'name', 'quelle'])
    assert.deepEqual({ ...eintrag, erfasst: undefined }, { betragCents: 2000, datum: heute, erfasst: undefined, name: null, nachricht: 'Für die Fellnasen!', quelle: 'gofundme' })
    assert.equal(JSON.stringify(res.data).includes('Lotte'), false)
  })

  await t.test('Quartale: erfasste Spenden ersetzen den Handwert ihres Quartals, Laufband zählt mit', async () => {
    const pub = await call(base, '/api/finanzierung')
    assert.deepEqual(pub.data.quartale.map((q) => [q.jahr, q.quartal, q.einnahmenSpendenCents]), [[jahr, quartal, 3000]])
    db.prepare('INSERT INTO finanzierung_quartale (jahr, quartal, einnahmen_spenden_cents) VALUES (?, ?, 99900)').run(jahr, quartal)
    db.prepare('INSERT INTO finanzierung_quartale (jahr, quartal, einnahmen_spenden_cents) VALUES (2025, 1, 5000)').run()
    const merged = await call(base, '/api/finanzierung')
    assert.deepEqual(merged.data.quartale.map((q) => [q.jahr, q.quartal, q.einnahmenSpendenCents]), [[jahr, quartal, 3000], [2025, 1, 5000]])
    require('../lib/community').clearCommunityCache()
    const community = await call(base, '/api/community')
    assert.equal(community.data.spendenCents, 8000)
  })

  await t.test('Live-Strom: erster Stand sofort, neuer Stand nach einer Änderung', async () => {
    const stream = await openStream(base)
    assert.equal(stream.res.headers['content-type'], 'text/event-stream; charset=utf-8')
    assert.equal(stream.data.summeMonat, 3000)
    const naechster = stream.next()
    const upd = await call(base, `/api/admin/spenden/${spendeId}`, { method: 'PUT', body: { betragCents: 2500, quelle: 'gofundme', datum: heute }, cookie: adminCookie })
    assert.equal(upd.status, 200)
    assert.equal((await naechster).summeMonat, 3500)
    stream.close()
    assert.equal((await call(base, '/api/admin/spenden/999', { method: 'PUT', body: { betragCents: 1, quelle: 'bar' }, cookie: adminCookie })).status, 404)
  })

  await t.test('Webhook: ohne Secret 404, nur gofundme/paypal, Zeit + HMAC-Signatur, doppelt nur einmal, privat als Vorgabe', async () => {
    const { signatur } = require('../lib/spendenWebhook')
    const jetzt = () => String(Math.floor(Date.now() / 1000))
    const post = (quelle, raw, { sig, zeit } = {}) =>
      fetch(`${base}/api/finanzierung/webhook/${quelle}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(sig ? { 'X-Spenden-Signatur': sig } : {}), ...(zeit ? { 'X-Spenden-Zeit': zeit } : {}) },
        body: raw
      })
    const signiert = (quelle, raw, secret = FAKE_SECRET, zeit = jetzt()) => post(quelle, raw, { sig: signatur(secret, zeit, raw), zeit })
    const body = JSON.stringify({ id: 'gfm-1', betragCents: 1500, anzeigename: 'Pepper', oeffentlich: true })
    assert.equal((await post('gofundme', body, { sig: 'sha256=00', zeit: jetzt() })).status, 404)
    // Aus: auch ein Body über dem Limit bekommt 404 (wird gar nicht gelesen).
    assert.equal((await post('gofundme', 'x'.repeat(20 * 1024))).status, 404)
    process.env.SPENDEN_WEBHOOK_SECRET = FAKE_SECRET
    try {
      assert.equal((await post('gofundme', body)).status, 401)
      assert.equal((await signiert('gofundme', body, 'falsches-secret-123456')).status, 401)
      // Zeit fehlt, ist zu alt oder passt nicht zur Signatur -> 401.
      assert.equal((await post('gofundme', body, { sig: signatur(FAKE_SECRET, jetzt(), body) })).status, 401)
      const alt = String(Math.floor(Date.now() / 1000) - 6 * 60)
      assert.equal((await signiert('gofundme', body, FAKE_SECRET, alt)).status, 401)
      assert.equal((await post('gofundme', body, { sig: signatur(FAKE_SECRET, alt, body), zeit: jetzt() })).status, 401)
      // Nur Anbieter-Quellen: andere (auch gültige Admin-Quellen) 404.
      for (const quelle of ['bitcoin', 'ueberweisung', 'bar', 'sonstiges']) assert.equal((await signiert(quelle, body)).status, 404, quelle)
      const ok = await signiert('gofundme', body)
      assert.equal(ok.status, 201)
      assert.equal((await ok.json()).doppelt, false)
      const nochmal = await signiert('gofundme', body)
      assert.equal(nochmal.status, 200)
      assert.equal((await nochmal.json()).doppelt, true)
      const kaputt = JSON.stringify({ id: 'gfm-2', betragCents: -5 })
      assert.equal((await signiert('gofundme', kaputt)).status, 400)
      // Ohne ausdrückliches oeffentlich: true bleibt die Spende privat (zählt, aber ohne Name/Nachricht).
      const privat = JSON.stringify({ id: 'pp-1', betragCents: 500, anzeigename: 'Geheim', nachricht: 'Nur für euch' })
      assert.equal((await signiert('paypal', privat)).status, 201)
      assert.equal(db.prepare("SELECT oeffentlich FROM spenden_eingaenge WHERE extern_ref = 'paypal:pp-1'").get().oeffentlich, 0)
      const live = await call(base, '/api/finanzierung/live')
      assert.equal(live.data.summeMonat, 5500)
      assert.equal(live.data.letzte[0].name, 'Pepper')
      assert.ok(!live.data.letzte.some((eintrag) => eintrag.name === 'Geheim' || eintrag.nachricht === 'Nur für euch'))
    } finally {
      delete process.env.SPENDEN_WEBHOOK_SECRET
    }
  })

  await t.test('Webhook: eigenes Limit je IP (60 je Minute) -> 429', async () => {
    let status = 0
    for (let i = 0; i < 70 && status !== 429; i += 1) {
      status = (await fetch(`${base}/api/finanzierung/webhook/gofundme`, { method: 'POST', body: '{}' })).status
    }
    assert.equal(status, 429)
  })

  await t.test('Live-Strom: höchstens 4 je IP (dann 503), Platz wird beim Schließen frei', async () => {
    const offen = []
    for (let i = 0; i < 4; i += 1) offen.push(await openStream(base))
    const fuenfter = await fetch(`${base}/api/finanzierung/live/stream`)
    assert.equal(fuenfter.status, 503)
    offen.forEach((stream) => stream.close())
    const { offeneStreams } = require('../lib/spendenLive')
    for (let i = 0; i < 50 && offeneStreams() > 0; i += 1) await new Promise((done) => setTimeout(done, 20))
    assert.equal(offeneStreams(), 0)
    const wieder = await openStream(base)
    wieder.close()
  })

  await t.test('Live-Strom: ein Client, der nicht mitliest (Puffer > 64 kB), wird getrennt', () => {
    const live = require('../lib/spendenLive')
    const handler = {}
    let zerstoert = false
    const res = { writableLength: 0, writeHead() {}, write() {}, destroy() { zerstoert = true; handler.close() }, on() {} }
    const req = { ip: '198.51.100.7', on: (name, fn) => { handler[name] = fn } }
    const vorher = live.offeneStreams()
    assert.equal(live.openStream(req, res), true)
    assert.equal(live.offeneStreams(), vorher + 1)
    res.writableLength = live.MAX_PUFFER_BYTES + 1
    live.meldeSpendenAenderung()
    assert.equal(zerstoert, true)
    assert.equal(live.offeneStreams(), vorher)
  })

  await t.test('Vorleistung: Admin legt sie an, öffentlich mit gedecktem Teil, löschen', async () => {
    const bad = await call(base, '/api/admin/finanzierung/vorleistungen', { method: 'POST', body: { betragCents: 300000, kategorie: 'werbung', datum: '2026-01-01' }, cookie: adminCookie })
    assert.equal(bad.status, 400)
    assert.equal(bad.data.feld, 'kategorie')
    const res = await call(base, '/api/admin/finanzierung/vorleistungen', {
      method: 'POST',
      body: { titel: 'Anschub', kategorie: 'druck', betragCents: 300000, datum: '2026-01-01', notiz: 'privat vorgestreckt' },
      cookie: adminCookie
    })
    assert.equal(res.status, 201)
    assert.deepEqual(adminLog().at(-1), { aktion: 'finanzierung-vorleistung-angelegt', ziel: `vorleistung:${res.data.id}` })
    const pub = await call(base, '/api/finanzierung')
    assert.equal(pub.data.vorleistung.gesamtCents, 300000)
    assert.equal(JSON.stringify(pub.data).includes('privat vorgestreckt'), false)
    const live = await call(base, '/api/finanzierung/live')
    assert.deepEqual(live.data.vorleistung.kategorien, ['druck'])
    assert.equal((await call(base, `/api/admin/finanzierung/vorleistungen/${res.data.id}`, { method: 'DELETE', cookie: adminCookie })).status, 204)
    assert.equal((await call(base, `/api/admin/spenden/${spendeId}`, { method: 'DELETE', cookie: adminCookie })).status, 204)
    assert.equal((await call(base, `/api/admin/spenden/${spendeId}`, { method: 'DELETE', cookie: adminCookie })).status, 404)
  })
})
