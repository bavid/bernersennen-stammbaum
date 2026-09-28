const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, createHousehold, getCookie } = require('./helpers')

// Phase 3 Task 2: POST /api/discover (Übersicht) und GET /r/:type/:id (anonyme Klickzählung), siehe
// docs/superpowers/plans/2026-09-29-phase-3-entdecken.md. t.test() bleibt auf einer Ebene.
const ADMIN_TEST_PASSWORD = 'admin-test-discover-1'
const dataDir = useTempDataDir('discover')

test('Entdecken: POST /api/discover (Abschnitte, PLZ/Umkreis, Demo-Trennung) und GET /r (Klickzählung)', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))

  const db = require('../db')
  const config = require('../config')
  const { lookupPlz, distanceKm } = require('../lib/geo')

  const adminLogin = await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: ADMIN_TEST_PASSWORD } })
  const adminCookie = getCookie(adminLogin.res)
  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const put = (urlPath, body, cookie) => call(base, urlPath, { method: 'PUT', body, cookie })
  const discover = (body, cookie) => call(base, '/api/discover', { method: 'POST', body: body || {}, cookie })

  // --- Fixtures -------------------------------------------------------------------------------------

  let nextSlug = 0
  function insertPartner(overrides = {}) {
    const slug = `discover-partner-${(nextSlug += 1)}`
    const row = {
      slug,
      name: 'Partner ohne Namen',
      typ: 'tierheim',
      status: 'aktiv',
      lat: null,
      lon: null,
      website: null,
      spenden_url: null,
      is_demo: 0,
      ...overrides
    }
    db.prepare(
      `INSERT INTO partners (slug, name, typ, status, lat, lon, website, spenden_url, is_demo)
       VALUES (@slug, @name, @typ, @status, @lat, @lon, @website, @spenden_url, @is_demo)`
    ).run(row)
    return db.prepare('SELECT * FROM partners WHERE slug = ?').get(slug)
  }

  let nextPromo = 0
  function insertPromotion(overrides = {}) {
    const row = {
      partner_id: null,
      bereich: 'futter',
      kennzeichnung: 'Anzeige',
      empfohlen_von: null,
      titel: `Anzeige ${(nextPromo += 1)}`,
      text: null,
      url: null,
      tierart: null,
      aktiv: 1,
      start: null,
      ende: null,
      sort: 0,
      is_demo: 0,
      ...overrides
    }
    const id = db
      .prepare(
        `INSERT INTO promotions (partner_id, bereich, kennzeichnung, empfohlen_von, titel, text, url, tierart, aktiv, start, ende, sort, is_demo)
         VALUES (@partner_id, @bereich, @kennzeichnung, @empfohlen_von, @titel, @text, @url, @tierart, @aktiv, @start, @ende, @sort, @is_demo)`
      )
      .run(row).lastInsertRowid
    return db.prepare('SELECT * FROM promotions WHERE id = ?').get(id)
  }

  function putSetting(key, value) {
    db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, value)
  }

  function insertDonationReport(overrides = {}) {
    const row = {
      zeitraum: '2026 Q3',
      eingang_cents: 125000,
      kosten_cents: 18000,
      weitergeleitet_cents: 100000,
      empfaenger: 'Tierheim Sonnenhang',
      nachweis_url: null,
      is_demo: 0,
      ...overrides
    }
    const id = db
      .prepare(
        `INSERT INTO donation_reports (zeitraum, eingang_cents, kosten_cents, weitergeleitet_cents, empfaenger, nachweis_url, is_demo)
         VALUES (@zeitraum, @eingang_cents, @kosten_cents, @weitergeleitet_cents, @empfaenger, @nachweis_url, @is_demo)`
      )
      .run(row).lastInsertRowid
    return db.prepare('SELECT * FROM donation_reports WHERE id = ?').get(id)
  }

  // Tierheim mit eigenem Login (wie steckbrief.test.js createShelter) - für begleiter.tiere. Immer
  // zunächst ECHT anlegen: eine Demo-Familie darf laut requireAuth nicht schreiben (nur GET), ein
  // Steckbrief müsste sonst schon vor dem Veröffentlichen an der Demo-Sperre scheitern. Ein Partner wird
  // erst NACH dem Veröffentlichen per Rohzugriff zu is_demo=1 (siehe unten) - das genügt, weil die
  // Sichtbarkeit für begleiter.tiere allein von partners.is_demo abhängt, nicht von families.is_demo.
  async function createShelter(name, slug, { website, spendenUrl } = {}) {
    const partner = await post(
      '/api/admin/partners',
      { name, typ: 'tierheim', plz: '10115', status: 'aktiv', slug, website, spendenUrl },
      adminCookie
    )
    assert.equal(partner.status, 201)
    const shelter = await post(`/api/admin/partners/${partner.data.id}/shelter`, undefined, adminCookie)
    assert.equal(shelter.status, 201)
    const login = await post('/api/login', { secret: shelter.data.key }, null)
    assert.equal(login.status, 200)
    return { partnerId: partner.data.id, slug: partner.data.slug, cookie: getCookie(login.res) }
  }

  async function publishDog(shelter, name) {
    const dog = await post('/api/dogs', { name, geschlecht: 'huendin', tierart: 'hund', vermittlungStatus: 'in_vermittlung' }, shelter.cookie)
    assert.equal(dog.status, 201)
    const published = await put(`/api/dogs/${dog.data.id}/steckbrief`, { published: true }, shelter.cookie)
    assert.equal(published.status, 200)
    return published.data
  }

  const household = await createHousehold(base, 'Familie Entdecken Echt')
  const demoHousehold = await createHousehold(base, 'Familie Entdecken Demo')
  db.prepare('UPDATE families SET is_demo = 1 WHERE id = ?').run(demoHousehold.data.id)

  await t.test('ohne Session -> 401', async () => {
    const res = await discover({}, undefined)
    assert.equal(res.status, 401)
  })

  await t.test('Validierung: unbekannte PLZ -> 400, ungültiger Radius -> 400', async () => {
    assert.equal((await discover({ plz: '00000', radius: 10 }, household.cookie)).status, 400)
    assert.equal((await discover({ plz: '10115', radius: 7 }, household.cookie)).status, 400)
  })

  // --- Hauptszenario: echte + Demo-Daten gleichzeitig anlegen, dann aus beiden Blickwinkeln lesen -----

  const hsEcht = insertPartner({ name: 'Hundeschule Ameise', typ: 'hundeschule', website: 'https://example.org/ameise' })
  const hsDemo = insertPartner({ name: 'Hundeschule Zebra Demo', typ: 'hundeschule', is_demo: 1 })
  const hsPromoEcht = insertPromotion({ bereich: 'hundeschule', kennzeichnung: 'Partner', titel: 'Welpenkurs im Frühjahr', is_demo: 0 })
  const hsPromoDemo = insertPromotion({ bereich: 'hundeschule', kennzeichnung: 'Partner', titel: 'Demo-Welpenkurs', is_demo: 1 })

  const futterEcht = insertPromotion({
    bereich: 'futter',
    kennzeichnung: 'Anzeige',
    titel: 'Futterhof Deichland – Probierpaket',
    url: 'https://example.org/deichland',
    is_demo: 0
  })
  const futterDemo = insertPromotion({
    bereich: 'futter',
    kennzeichnung: 'Empfehlung',
    empfohlen_von: 'Hundeschule Pfotenglück',
    titel: 'Knusperkorn Sensitive',
    url: 'https://example.org/knusperkorn',
    is_demo: 1
  })

  putSetting('gofundme_url', 'https://example.org/familie-auf-pfoten-spenden')
  putSetting('unterstuetzen_text', 'Jeder Beitrag hilft.')
  putSetting('demo_gofundme_url', 'https://example.org/demo-spenden')
  putSetting('demo_unterstuetzen_text', 'Demo-Text.')

  const reportEcht = insertDonationReport({ zeitraum: '2026 Q3', is_demo: 0 })
  const reportDemo = insertDonationReport({ zeitraum: '2026 Q3 (Demo)', is_demo: 1 })

  const shelterEcht = await createShelter('Tierheim Sonnenhang', 'discover-tierheim-sonnenhang', {
    website: 'https://example.org/sonnenhang',
    spendenUrl: 'https://example.org/sonnenhang-spenden'
  })
  const shelterDemo = await createShelter('Tierheim Regenbogen Demo', 'discover-tierheim-regenbogen')

  const rex = await publishDog(shelterEcht, 'Rex')
  // Noch als echter Partner veröffentlicht (Demo-Familien dürfen nicht schreiben) - jetzt erst zu Demo machen.
  const demoHund = await publishDog(shelterDemo, 'Demo-Hund')
  db.prepare('UPDATE partners SET is_demo = 1 WHERE id = ?').run(shelterDemo.partnerId)

  // Nie Züchter: 'zuechter' ist als typ gar nicht erlaubt (DB CHECK) - stattdessen prüfen wir, dass
  // andere Partner-Typen (Hundeschule, Futter, Sonstige) nie in begleiter.partner auftauchen, nur
  // tierheim/vermittlung.
  const vermittlungEcht = insertPartner({ name: 'Vermittlungsstelle Distelfeld', typ: 'vermittlung' })
  insertPartner({ name: 'Futterhof Abseits', typ: 'futter' })
  insertPartner({ name: 'Sonstiges Abseits', typ: 'sonstige' })

  await t.test('echte Sitzung ohne PLZ: alle Abschnitte, Demo-Partner/-Tiere dank dev/staging-Bonus zusätzlich sichtbar, Empfehlungen/Berichte/Einstellungen bleiben getrennt', async () => {
    assert.notEqual(config.appEnv, 'production', 'appEnv wird beim require(config) fest eingelesen - Testumgebung ist nie production')

    const res = await discover({}, household.cookie)
    assert.equal(res.status, 200)
    assert.equal(res.data.center, undefined)
    // Ohne PLZ gibt es keinen Umkreis, also auch keinen Fallback - beide Flaggen bleiben false.
    assert.deepEqual(res.data.fallback, { hundeschulen: false, begleiter: false })

    // Hundeschulen: Partner + Empfehlungen - echte UND Demo-Partner (Bonus), aber sortiert nach Name
    const hsPartnerCards = res.data.hundeschulen.filter((e) => e.kind === 'partner')
    assert.ok(hsPartnerCards.some((p) => p.slug === hsEcht.slug))
    assert.ok(hsPartnerCards.some((p) => p.slug === hsDemo.slug), 'Demo-Partner ist in dev/staging auch für echte Sitzungen sichtbar')
    assert.ok(hsPartnerCards.every((p) => !('ausserhalb' in p)), 'ohne PLZ trägt keine Karte ein ausserhalb-Feld')
    const names = hsPartnerCards.map((p) => p.name)
    assert.deepEqual(names, names.slice().sort((a, b) => a.localeCompare(b, 'de')))

    const echterHsPartner = hsPartnerCards.find((p) => p.slug === hsEcht.slug)
    assert.equal(echterHsPartner.url, 'https://example.org/ameise')
    assert.equal(echterHsPartner.clickUrl, `/r/partner-website/${hsEcht.id}`)
    assert.equal(echterHsPartner.website, undefined, 'die rohe "website" wird durch url/clickUrl ersetzt')

    const hsPromoCards = res.data.hundeschulen.filter((e) => e.kind === 'promotion')
    assert.ok(hsPromoCards.some((p) => p.id === hsPromoEcht.id))
    assert.ok(!hsPromoCards.some((p) => p.id === hsPromoDemo.id), 'Demo-Empfehlung bleibt für die echte Sitzung getrennt, kein Bonus')

    // Futter: NUR echte Empfehlung, trotz desselben dev/staging-appEnv wie oben - Empfehlungen bekommen
    // nie den Partner-Bonus.
    assert.equal(res.data.futter.length, 1)
    assert.equal(res.data.futter[0].id, futterEcht.id)
    assert.equal(res.data.futter[0].url, futterEcht.url)
    assert.equal(res.data.futter[0].clickUrl, `/r/promotion/${futterEcht.id}`)

    // Begleiter: Partner nur tierheim/vermittlung, echte + Demo (Bonus), nie hundeschule/futter/sonstige
    const begleiterTypen = new Set(res.data.begleiter.partner.map((p) => p.typ))
    assert.deepEqual(begleiterTypen, new Set(['tierheim', 'vermittlung']))
    assert.ok(res.data.begleiter.partner.some((p) => p.slug === shelterEcht.slug))
    assert.ok(res.data.begleiter.partner.some((p) => p.slug === shelterDemo.slug))
    assert.ok(res.data.begleiter.partner.some((p) => p.slug === vermittlungEcht.slug))

    const tiereNamen = res.data.begleiter.tiere.map((d) => d.name)
    assert.ok(tiereNamen.includes('Rex'))
    assert.ok(tiereNamen.includes('Demo-Hund'), 'Demo-Tier ist dank Partner-Bonus auch für die echte Sitzung sichtbar')
    const rexCard = res.data.begleiter.tiere.find((d) => d.name === 'Rex')
    assert.deepEqual(Object.keys(rexCard).sort(), ['fotoUrl', 'geburtsdatum', 'geschlecht', 'name', 'rasse', 'slug', 'tierart', 'vermittlung_status'].sort())
    assert.equal(rexCard.slug, rex.public_slug)
    assert.equal(rexCard.vermittlung_status, 'in_vermittlung')
    assert.equal(rexCard.fotoUrl, null)

    // Unterstützen: echte Einstellungen/Bericht, nicht die Demo-Werte - trotz Partner-Bonus im selben Abschnitt
    assert.equal(res.data.unterstuetzen.gofundmeUrl, 'https://example.org/familie-auf-pfoten-spenden')
    assert.equal(res.data.unterstuetzen.gofundmeClickUrl, '/r/gofundme/0')
    assert.equal(res.data.unterstuetzen.text, 'Jeder Beitrag hilft.')
    assert.equal(res.data.unterstuetzen.bericht.zeitraum, reportEcht.zeitraum)
    assert.ok(res.data.unterstuetzen.partnerSpenden.some((p) => p.id === shelterEcht.partnerId))
    const spendeEcht = res.data.unterstuetzen.partnerSpenden.find((p) => p.id === shelterEcht.partnerId)
    assert.equal(spendeEcht.url, 'https://example.org/sonnenhang-spenden')
    assert.equal(spendeEcht.clickUrl, `/r/partner-spende/${shelterEcht.partnerId}`)
  })

  await t.test('Demo-Sitzung sieht ausschließlich Demo-Daten (Partner, Tiere, Empfehlungen, Bericht, Einstellungen)', async () => {
    const res = await discover({}, demoHousehold.cookie)
    assert.equal(res.status, 200)
    assert.deepEqual(res.data.fallback, { hundeschulen: false, begleiter: false })

    const hsPartnerSlugs = res.data.hundeschulen.filter((e) => e.kind === 'partner').map((p) => p.slug)
    assert.deepEqual(hsPartnerSlugs, [hsDemo.slug])
    const hsPromoIds = res.data.hundeschulen.filter((e) => e.kind === 'promotion').map((p) => p.id)
    assert.deepEqual(hsPromoIds, [hsPromoDemo.id])

    assert.equal(res.data.futter.length, 1)
    assert.equal(res.data.futter[0].id, futterDemo.id)

    assert.deepEqual(
      res.data.begleiter.partner.map((p) => p.slug),
      [shelterDemo.slug]
    )
    assert.deepEqual(
      res.data.begleiter.tiere.map((d) => d.name),
      ['Demo-Hund']
    )

    assert.equal(res.data.unterstuetzen.gofundmeUrl, 'https://example.org/demo-spenden')
    assert.equal(res.data.unterstuetzen.gofundmeClickUrl, '/r/gofundme/1')
    assert.equal(res.data.unterstuetzen.text, 'Demo-Text.')
    assert.equal(res.data.unterstuetzen.bericht.zeitraum, reportDemo.zeitraum)
    assert.deepEqual(
      res.data.unterstuetzen.partnerSpenden.map((p) => p.id),
      []
    )
  })

  const berlin = lookupPlz('10115')
  const MUENCHEN = { lat: 48.137, lon: 11.575 } // ~504 km von Berlin
  const ROM = { lat: 41.9, lon: 12.5 } // deutlich weiter als München

  await t.test('Umkreis-Fallback: weniger als 5 Treffer im Radius -> die nächsten außerhalb werden ergänzt (ausserhalb, fallback: true)', async () => {
    insertPartner({ name: 'Hundeschule Radius A', typ: 'hundeschule', lat: berlin.lat, lon: berlin.lon })
    insertPartner({ name: 'Hundeschule Radius B', typ: 'hundeschule', lat: berlin.lat, lon: berlin.lon })
    insertPartner({ name: 'Hundeschule Radius C', typ: 'hundeschule', lat: berlin.lat, lon: berlin.lon })
    insertPartner({ name: 'Hundeschule Fern München', typ: 'hundeschule', lat: MUENCHEN.lat, lon: MUENCHEN.lon })
    insertPartner({ name: 'Hundeschule Fern Rom', typ: 'hundeschule', lat: ROM.lat, lon: ROM.lon })

    const res = await discover({ plz: '10115', radius: 10 }, household.cookie)
    assert.equal(res.status, 200)
    assert.equal(res.data.center.ort, 'Berlin')
    assert.equal(res.data.fallback.hundeschulen, true, 'nur 3 Treffer im 10-km-Radius -> Fallback greift')

    const hsPartnerCards = res.data.hundeschulen.filter((e) => e.kind === 'partner')
    const inRadius = hsPartnerCards.filter((p) => p.name.startsWith('Hundeschule Radius'))
    assert.equal(inRadius.length, 3)
    assert.ok(inRadius.every((p) => p.ausserhalb === false))
    assert.ok(inRadius.every((p) => p.distanceKm < 1))

    const outside = hsPartnerCards.filter((p) => p.name.startsWith('Hundeschule Fern'))
    assert.equal(outside.length, 2, 'beide außerhalb liegenden Treffer werden ergänzt, nicht nur bis 5 aufgefüllt')
    assert.ok(outside.every((p) => p.ausserhalb === true))
    // München ist näher an Berlin als Rom -> auch außerhalb des Radius nach Entfernung sortiert
    assert.deepEqual(outside.map((p) => p.name), ['Hundeschule Fern München', 'Hundeschule Fern Rom'])

    // im Radius zuerst, dann die ergänzten außerhalb - nie gemischt
    const lastInRadiusIndex = hsPartnerCards.findIndex((p) => p.name === 'Hundeschule Radius C')
    const firstOutsideIndex = hsPartnerCards.findIndex((p) => p.name === 'Hundeschule Fern München')
    assert.ok(lastInRadiusIndex < firstOutsideIndex)
  })

  await t.test('Umkreis: ab 5 Treffern im Radius kein Fallback mehr, außerhalb bleibt vollständig ausgeschlossen', async () => {
    insertPartner({ name: 'Hundeschule Radius D', typ: 'hundeschule', lat: berlin.lat, lon: berlin.lon })
    insertPartner({ name: 'Hundeschule Radius E', typ: 'hundeschule', lat: berlin.lat, lon: berlin.lon })

    const res = await discover({ plz: '10115', radius: 10 }, household.cookie)
    assert.equal(res.status, 200)
    assert.equal(res.data.fallback.hundeschulen, false, '5 Treffer im Radius -> kein Fallback mehr nötig')

    const hsPartnerCards = res.data.hundeschulen.filter((e) => e.kind === 'partner')
    const inRadius = hsPartnerCards.filter((p) => p.name.startsWith('Hundeschule Radius'))
    assert.equal(inRadius.length, 5)
    assert.ok(!hsPartnerCards.some((p) => p.name.startsWith('Hundeschule Fern')), 'außerhalb bleibt komplett draußen, kein ausserhalb-Eintrag mehr')
  })

  await t.test('Begleiter-Abschnitt bekommt denselben Fallback (Partner UND Tiere), Empfehlungen mit Partner werden nach dessen Entfernung sortiert', async () => {
    const fernTierheim = insertPartner({ name: 'Tierheim Fern Rom', typ: 'tierheim', lat: ROM.lat, lon: ROM.lon })
    const nahPromo = insertPromotion({
      bereich: 'futter',
      kennzeichnung: 'Partner',
      titel: 'Nahe Futter-Empfehlung',
      partner_id: shelterEcht.partnerId, // liegt in Berlin, also im Radius
      is_demo: 0
    })
    const fernPromo = insertPromotion({
      bereich: 'futter',
      kennzeichnung: 'Partner',
      titel: 'Ferne Futter-Empfehlung',
      partner_id: fernTierheim.id, // liegt in Rom, weit außerhalb
      is_demo: 0
    })

    const res = await discover({ plz: '10115', radius: 10 }, household.cookie)
    assert.equal(res.status, 200)
    // nur shelterEcht + shelterDemo liegen im Radius (2 < 5) -> Fallback ergänzt den fernen Tierheim-Partner
    assert.equal(res.data.fallback.begleiter, true)
    const begleiterNamen = res.data.begleiter.partner.map((p) => p.name)
    assert.ok(begleiterNamen.includes('Tierheim Fern Rom'))
    const fernCard = res.data.begleiter.partner.find((p) => p.name === 'Tierheim Fern Rom')
    assert.equal(fernCard.ausserhalb, true)
    const shelterEchtCard = res.data.begleiter.partner.find((p) => p.slug === shelterEcht.slug)
    assert.equal(shelterEchtCard.ausserhalb, false)

    // Rex/Demo-Hund kommen aus im Radius liegenden Tierheimen -> ausserhalb: false
    const rexTierCard = res.data.begleiter.tiere.find((d) => d.name === 'Rex')
    assert.equal(rexTierCard.ausserhalb, false)

    // Empfehlungen: die an den nahen Partner gebundene zuerst, dann die an den fernen gebundene, dann
    // die ganz ohne Partner (futterEcht) - "partner-bound ones first by distance, then the others".
    const futterTitel = res.data.futter.map((p) => p.titel)
    const nahIndex = futterTitel.indexOf('Nahe Futter-Empfehlung')
    const fernIndex = futterTitel.indexOf('Ferne Futter-Empfehlung')
    const ohnePartnerIndex = futterTitel.indexOf(futterEcht.titel)
    assert.ok(nahIndex >= 0 && fernIndex >= 0 && ohnePartnerIndex >= 0)
    assert.ok(nahIndex < fernIndex, 'die an den näheren Partner gebundene Empfehlung steht vor der ferneren')
    assert.ok(fernIndex < ohnePartnerIndex, 'partnergebundene Empfehlungen stehen vor Empfehlungen ohne Partner')

    assert.equal(nahPromo.bereich, 'futter')
    assert.equal(fernPromo.bereich, 'futter')
  })

  await t.test('Umkreis-Fallback: außerhalb liegende Treffer werden auf MAX_FALLBACK (20) gedeckelt', async () => {
    // begleiter (tierheim/vermittlung) hat aktuell nur 2 Partner im Radius (shelterEcht, shelterDemo) -
    // bleibt < 5, der Fallback greift also unabhängig davon, wie viele Kandidaten außerhalb liegen.
    const farCandidates = []
    for (let i = 0; i < 25; i += 1) {
      const lat = berlin.lat - (i + 1) * 0.5 // je Schritt ~55 km weiter südlich, klar außerhalb 10 km
      farCandidates.push({ name: `Tierheim Kappung ${i}`, lat, lon: berlin.lon })
      insertPartner({ name: `Tierheim Kappung ${i}`, typ: 'tierheim', lat, lon: berlin.lon })
    }
    // Zusammen mit "Tierheim Fern Rom" aus dem vorherigen Test sind das 26 Kandidaten außerhalb - mehr
    // als MAX_FALLBACK (20).
    const allOutsideCandidates = [...farCandidates, { name: 'Tierheim Fern Rom', lat: ROM.lat, lon: ROM.lon }]
    const nearestExpectedNames = allOutsideCandidates
      .map((p) => ({ name: p.name, dist: distanceKm(berlin, { lat: p.lat, lon: p.lon }) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 20)
      .map((p) => p.name)
      .sort()

    const res = await discover({ plz: '10115', radius: 10 }, household.cookie)
    assert.equal(res.status, 200)
    assert.equal(res.data.fallback.begleiter, true)

    const ausserhalbCards = res.data.begleiter.partner.filter((p) => p.ausserhalb === true)
    assert.equal(ausserhalbCards.length, 20, 'nie mehr als MAX_FALLBACK Treffer außerhalb werden angehängt, obwohl 26 in Frage kämen')
    assert.deepEqual(ausserhalbCards.map((p) => p.name).sort(), nearestExpectedNames)
  })

  await t.test('Begleiter-Tiere: 5+ Partner im Radius, aber zusammen weniger als 5 veröffentlichte Tiere -> Fallback ergänzt Tiere weiter entfernter Tierheime', async () => {
    // Drei weitere Partner im Radius OHNE Tierheim-Bereich/Tiere - zusammen mit shelterEcht/shelterDemo
    // liegen jetzt mindestens 5 Partner im Radius, aber weiterhin nur Rex + Demo-Hund als Tiere (< 5).
    insertPartner({ name: 'Tierheim Radius Leer 1', typ: 'tierheim', lat: berlin.lat, lon: berlin.lon })
    insertPartner({ name: 'Vermittlung Radius Leer 2', typ: 'vermittlung', lat: berlin.lat, lon: berlin.lon })
    insertPartner({ name: 'Tierheim Radius Leer 3', typ: 'tierheim', lat: berlin.lat, lon: berlin.lon })

    const shelterFern = await createShelter('Tierheim Weit Weg Mit Tier', 'discover-tierheim-weit-weg-mit-tier')
    await publishDog(shelterFern, 'Fernie')
    // Erst nach dem Veröffentlichen weit wegsetzen (die Admin-Anlage braucht eine auflösbare PLZ) - wie
    // beim is_demo-Umbau der Demo-Tierheime oben.
    db.prepare('UPDATE partners SET lat = ?, lon = ? WHERE id = ?').run(ROM.lat, ROM.lon, shelterFern.partnerId)

    const res = await discover({ plz: '10115', radius: 10 }, household.cookie)
    assert.equal(res.status, 200)
    assert.equal(res.data.fallback.begleiter, true)

    const inRadiusPartner = res.data.begleiter.partner.filter((p) => p.ausserhalb === false)
    assert.ok(inRadiusPartner.length >= 5, 'mindestens 5 Partner liegen im Radius')

    const fernieCard = res.data.begleiter.tiere.find((d) => d.name === 'Fernie')
    assert.ok(fernieCard, 'das Tier des weit entfernten Tierheims wird trotzdem ergänzt')
    assert.equal(fernieCard.ausserhalb, true)
    assert.equal(typeof fernieCard.distanceKm, 'number')
    assert.ok(fernieCard.distanceKm > 10)
  })

  // --- Klickzählung / Weiterleitung (GET /r/:type/:id) ------------------------------------------------

  function clickCount(targetType, targetId) {
    const row = db.prepare("SELECT anzahl FROM link_clicks WHERE target_type = ? AND target_id = ? AND tag = date('now')").get(
      targetType,
      targetId
    )
    return row?.anzahl ?? 0
  }

  async function fetchRedirect(urlPath, { userAgent, query = '' } = {}) {
    const headers = {}
    if (userAgent) headers['User-Agent'] = userAgent
    return fetch(`${base}${urlPath}${query}`, { redirect: 'manual', headers })
  }

  await t.test('Klick zählt pro Tag und leitet weiter; Query-Parameter (z. B. ?url=) werden ignoriert; Header ohne Cookie', async () => {
    assert.equal(clickCount('promotion', futterEcht.id), 0)

    const first = await fetchRedirect(`/r/promotion/${futterEcht.id}`)
    assert.equal(first.status, 302)
    assert.equal(first.headers.get('location'), futterEcht.url)
    assert.equal(first.headers.get('referrer-policy'), 'no-referrer')
    assert.equal(first.headers.get('cache-control'), 'no-store')
    assert.equal(first.headers.get('set-cookie'), null)
    assert.equal(clickCount('promotion', futterEcht.id), 1)

    // offener Redirect ausgeschlossen: ein mitgeschickter ?url= wird nie gelesen, das Ziel bleibt aus der DB
    const withForeignUrl = await fetchRedirect(`/r/promotion/${futterEcht.id}`, { query: '?url=https://evil.example/phish' })
    assert.equal(withForeignUrl.status, 302)
    assert.equal(withForeignUrl.headers.get('location'), futterEcht.url)
    assert.equal(clickCount('promotion', futterEcht.id), 2, 'ein zweiter echter Klick zählt normal hoch')
  })

  await t.test('Bot-User-Agent leitet weiter, zählt aber nicht', async () => {
    const before = clickCount('promotion', futterEcht.id)
    const res = await fetchRedirect(`/r/promotion/${futterEcht.id}`, { userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' })
    assert.equal(res.status, 302)
    assert.equal(clickCount('promotion', futterEcht.id), before, 'Bot-Aufrufe erhöhen den Zähler nicht')
  })

  await t.test('unbekanntes Ziel -> 404: falscher Typ, unbekannte Id, inaktive Empfehlung, pausierter Partner', async () => {
    assert.equal((await fetchRedirect('/r/bogus-type/1')).status, 404)
    assert.equal((await fetchRedirect(`/r/promotion/999999`)).status, 404)

    db.prepare('UPDATE promotions SET aktiv = 0 WHERE id = ?').run(futterEcht.id)
    assert.equal((await fetchRedirect(`/r/promotion/${futterEcht.id}`)).status, 404)

    const website = await fetchRedirect(`/r/partner-website/${shelterEcht.partnerId}`)
    assert.equal(website.status, 302)
    assert.equal(website.headers.get('location'), 'https://example.org/sonnenhang')
    const spende = await fetchRedirect(`/r/partner-spende/${shelterEcht.partnerId}`)
    assert.equal(spende.status, 302)
    assert.equal(spende.headers.get('location'), 'https://example.org/sonnenhang-spenden')

    db.prepare("UPDATE partners SET status = 'pausiert' WHERE id = ?").run(shelterEcht.partnerId)
    assert.equal((await fetchRedirect(`/r/partner-website/${shelterEcht.partnerId}`)).status, 404)
    assert.equal((await fetchRedirect(`/r/partner-spende/${shelterEcht.partnerId}`)).status, 404)
    db.prepare("UPDATE partners SET status = 'aktiv' WHERE id = ?").run(shelterEcht.partnerId)
  })

  await t.test('GoFundMe-Ids: 0 = echt, 1 = Demo-Einstellung, sonst 404', async () => {
    const real = await fetchRedirect('/r/gofundme/0')
    assert.equal(real.status, 302)
    assert.equal(real.headers.get('location'), 'https://example.org/familie-auf-pfoten-spenden')

    const demo = await fetchRedirect('/r/gofundme/1')
    assert.equal(demo.status, 302)
    assert.equal(demo.headers.get('location'), 'https://example.org/demo-spenden')

    assert.equal((await fetchRedirect('/r/gofundme/2')).status, 404)
    assert.equal((await fetchRedirect('/r/gofundme/abc')).status, 404)
  })
})
