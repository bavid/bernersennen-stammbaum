const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, createHousehold, getCookie } = require('./helpers')

const dataDir = useTempDataDir('places')

test('Umkreissuche: lib/places (Sortierung, Dubletten, Züchter, Cache, Budget, Demo) und Route', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))

  const db = require('../db')
  const config = require('../config')
  const { searchPlaces } = require('../lib/places')

  const originalProviders = config.placesProviders
  const originalDailyLimit = config.placesDailyLimit
  t.after(() => {
    config.placesProviders = originalProviders
    config.placesDailyLimit = originalDailyLimit
  })

  let nextSlug = 0
  function insertPartner(overrides = {}) {
    const slug = `partner-${(nextSlug += 1)}`
    const row = { slug, name: 'Tierheim Testpartner', typ: 'tierheim', status: 'aktiv', lat: 0, lon: 0, is_demo: 0, osm_ref: null, ...overrides }
    db.prepare('INSERT INTO partners (slug, name, typ, status, lat, lon, is_demo, osm_ref) VALUES (@slug, @name, @typ, @status, @lat, @lon, @is_demo, @osm_ref)').run(
      row
    )
    return db.prepare('SELECT * FROM partners WHERE slug = ?').get(slug)
  }

  await t.test('Sortierung: echte Fixture-Treffer um Berlin, Partner immer zuerst (auch wenn weiter weg)', async () => {
    const partner = insertPartner({ name: 'Tierheim Weiter weg', lat: 52.6, lon: 13.5 }) // ~9 km von 10115 entfernt

    const { results, attribution, limited } = await searchPlaces(db, { lat: 52.532, lon: 13.385, radiusKm: 25, isDemo: false })

    assert.equal(limited, false)
    assert.deepEqual(attribution, ['© OpenStreetMap-Mitwirkende (ODbL)'])
    assert.ok(results.length >= 8, 'Partner + mindestens die 7 Berliner Fixture-Orte')
    assert.equal(results[0].id, `partner:${partner.id}`)
    assert.equal(results[0].quelle, 'partner')
    assert.equal(results[0].badge, 'partner')

    const rest = results.slice(1)
    assert.ok(rest.every((r) => r.quelle === 'fixture'))
    for (let i = 1; i < rest.length; i += 1) {
      assert.ok(rest[i - 1].distanceKm <= rest[i].distanceKm)
    }
  })

  await t.test('Dubletten: gleicher Name innerhalb 150 m - Partner gewinnt, kein doppelter Treffer', async () => {
    const providerHit = { id: 'fixture:dup-1', name: '  tierheim dublette  ', typ: 'tierheim', lat: 2.0001, lon: 2.0001 }
    const partner = insertPartner({ name: 'Tierheim Dublette', lat: 2, lon: 2 })

    const { results } = await searchPlaces(
      db,
      { lat: 2, lon: 2, radiusKm: 5, isDemo: false },
      { providers: { fixture: async () => [providerHit] } }
    )

    const matches = results.filter((r) => r.name.toLowerCase().includes('dublette'))
    assert.equal(matches.length, 1, 'nur ein zusammengeführter Treffer statt zweier')
    assert.equal(matches[0].quelle, 'partner')
    assert.equal(matches[0].id, `partner:${partner.id}`)
  })

  await t.test('Dubletten: gleiche osm_ref/id - Partner gewinnt auch ohne Namens-/Orts-Übereinstimmung', async () => {
    const partner = insertPartner({ name: 'Tierheim Mit OSM-Referenz', lat: 3, lon: 3, osm_ref: 'osm:node/555' })
    const providerHit = { id: 'osm:node/555', name: 'Ganz anderer Name', typ: 'tierheim', lat: 3.05, lon: 3.05 } // > 150 m entfernt

    const { results } = await searchPlaces(
      db,
      { lat: 3, lon: 3, radiusKm: 10, isDemo: false },
      { providers: { fixture: async () => [providerHit] } }
    )

    const matches = results.filter((r) => r.quelle === 'partner' && r.id === `partner:${partner.id}`)
    assert.equal(matches.length, 1)
    assert.ok(!results.some((r) => r.quelle === 'fixture' && r.name === 'Ganz anderer Name'))
  })

  await t.test('Züchter-Treffer werden verworfen', async () => {
    const breederHit = { id: 'fixture:zucht-1', name: 'Hundezucht Testhof', typ: 'tierheim', lat: 4, lon: 4 }
    const okHit = { id: 'fixture:ok-1', name: 'Tierheim Redlich', typ: 'tierheim', lat: 4, lon: 4 }

    const { results } = await searchPlaces(
      db,
      { lat: 4, lon: 4, radiusKm: 5, isDemo: false },
      { providers: { fixture: async () => [breederHit, okHit] } }
    )

    assert.ok(!results.some((r) => r.name.includes('Hundezucht')))
    assert.ok(results.some((r) => r.name === 'Tierheim Redlich'))
  })

  await t.test('Cache-Treffer: zweiter Aufruf ruft den Anbieter nicht erneut auf', async () => {
    config.placesProviders = ['overpass']
    let calls = 0
    const providers = { overpass: async () => { calls += 1; return [{ id: 'osm:node/1', name: 'Tierheim Gecacht', typ: 'tierheim', lat: 5, lon: 5 }] } }

    const first = await searchPlaces(db, { lat: 5, lon: 5, radiusKm: 11, isDemo: false }, { providers })
    assert.equal(calls, 1)
    assert.ok(first.results.some((r) => r.name === 'Tierheim Gecacht'))

    const second = await searchPlaces(db, { lat: 5, lon: 5, radiusKm: 11, isDemo: false }, { providers })
    assert.equal(calls, 1, 'der zweite Aufruf kommt aus dem Cache, kein erneuter Provider-Aufruf')
    assert.ok(second.results.some((r) => r.name === 'Tierheim Gecacht'))
  })

  await t.test('Budget erschöpft: liefert nur Partner/Cache und limited:true, ohne den Anbieter aufzurufen', async () => {
    config.placesProviders = ['overpass']
    config.placesDailyLimit = 0
    let calls = 0
    const providers = { overpass: async () => { calls += 1; return [{ id: 'osm:node/2', name: 'Sollte nicht erscheinen', typ: 'tierheim', lat: 6, lon: 6 }] } }
    const partner = insertPartner({ name: 'Tierheim Trotzdem Da', lat: 6, lon: 6 })

    const { results, limited } = await searchPlaces(db, { lat: 6, lon: 6, radiusKm: 12, isDemo: false }, { providers })

    assert.equal(limited, true)
    assert.equal(calls, 0)
    assert.ok(results.some((r) => r.id === `partner:${partner.id}`))
    assert.ok(!results.some((r) => r.name === 'Sollte nicht erscheinen'))

    config.placesDailyLimit = originalDailyLimit // sonst bleibt das Budget für alle folgenden Tests erschöpft
  })

  await t.test('Demo nutzt immer die Fixture, unabhängig von config.placesProviders', async () => {
    config.placesProviders = ['overpass']
    let overpassCalls = 0
    const providers = {
      overpass: async () => { overpassCalls += 1; return [] },
      fixture: async () => [{ id: 'fixture:demo-1', name: 'Tierheim Demo-Treffer', typ: 'tierheim', lat: 7, lon: 7, quelle: 'fixture' }]
    }

    const { results } = await searchPlaces(db, { lat: 7, lon: 7, radiusKm: 5, isDemo: true }, { providers })

    assert.equal(overpassCalls, 0)
    assert.ok(results.some((r) => r.name === 'Tierheim Demo-Treffer' && r.quelle === 'fixture'))
  })

  await t.test('Cache pro 0,05°-Zelle: Overpass wird an der Zell-Mitte mit Radius+4km gefragt, jeder Suchpunkt filtert selbst neu', async () => {
    config.placesProviders = ['overpass']
    let calls = 0
    const providers = {
      overpass: async ({ lat, lon, radiusKm }) => {
        calls += 1
        // Zell-Mitte (0,05°-Rundung von 52.53/13.38 UND 52.57/13.42), nicht die exakten Nutzer-Koordinaten
        assert.equal(lat, 52.55)
        assert.equal(lon, 13.4)
        assert.equal(radiusKm, 9) // angefragte 5 km + 4 km Polster
        return [
          { id: 'osm:node/near-a', name: 'Nah bei Punkt A', typ: 'tierheim', lat: 52.531, lon: 13.381 },
          { id: 'osm:node/near-b', name: 'Nah bei Punkt B', typ: 'tierheim', lat: 52.575, lon: 13.425 },
          { id: 'osm:node/far', name: 'Weit von beiden', typ: 'tierheim', lat: 52.6, lon: 13.3 }
        ]
      }
    }

    const first = await searchPlaces(db, { lat: 52.53, lon: 13.38, radiusKm: 5, isDemo: false }, { providers })
    assert.equal(calls, 1)
    assert.ok(first.results.some((r) => r.name === 'Nah bei Punkt A'))
    assert.ok(!first.results.some((r) => r.name === 'Nah bei Punkt B'), 'über 5 km von Punkt A entfernt')
    assert.ok(!first.results.some((r) => r.name === 'Weit von beiden'))

    const second = await searchPlaces(db, { lat: 52.57, lon: 13.42, radiusKm: 5, isDemo: false }, { providers })
    assert.equal(calls, 1, 'derselbe Zell-Schlüssel: kein erneuter Anbieter-Aufruf, Ergebnis kommt aus dem Cache')
    assert.ok(second.results.some((r) => r.name === 'Nah bei Punkt B'))
    assert.ok(!second.results.some((r) => r.name === 'Nah bei Punkt A'), 'über 5 km von Punkt B entfernt')
    assert.ok(!second.results.some((r) => r.name === 'Weit von beiden'))
  })

  await t.test('Anbieter wirft: Suche bricht nicht ab (Partner + limited:true), kein Cache-Eintrag vom Fehlversuch', async () => {
    config.placesProviders = ['overpass']
    const partner = insertPartner({ name: 'Tierheim Trotz Anbieter-Fehler', lat: 10, lon: 10 })
    const failing = { overpass: async () => { throw new Error('Overpass ist gerade nicht erreichbar') } }

    const { results, limited } = await searchPlaces(db, { lat: 10, lon: 10, radiusKm: 5, isDemo: false }, { providers: failing })
    assert.equal(limited, true)
    assert.ok(results.some((r) => r.id === `partner:${partner.id}`))

    let retryCalls = 0
    const retrying = { overpass: async () => { retryCalls += 1; return [] } }
    await searchPlaces(db, { lat: 10, lon: 10, radiusKm: 5, isDemo: false }, { providers: retrying })
    assert.equal(retryCalls, 1, 'kein Cache-Eintrag vom fehlgeschlagenen Versuch, also erneuter Anbieter-Aufruf')
  })

  await t.test('Budget-Fairness: Tages-Obergrenze pro Identität (homeId), andere Identität bleibt unberührt', async () => {
    config.placesProviders = ['overpass']
    const originalPerIdentity = process.env.PLACES_DAILY_LIMIT_PER_IDENTITY
    process.env.PLACES_DAILY_LIMIT_PER_IDENTITY = '2'
    let calls = 0
    const providers = { overpass: async () => { calls += 1; return [] } }

    try {
      // drei unterschiedliche Radien am selben Ort -> drei unterschiedliche Cache-Schlüssel, kein Cache-Hit
      const first = await searchPlaces(db, { lat: 11, lon: 11, radiusKm: 5, isDemo: false, homeId: 'family-fair-a' }, { providers })
      const second = await searchPlaces(db, { lat: 11, lon: 11, radiusKm: 10, isDemo: false, homeId: 'family-fair-a' }, { providers })
      const third = await searchPlaces(db, { lat: 11, lon: 11, radiusKm: 25, isDemo: false, homeId: 'family-fair-a' }, { providers })

      assert.equal(calls, 2, 'die dritte Anfrage derselben Identität überschreitet die Tages-Quote')
      assert.equal(first.limited, false)
      assert.equal(second.limited, false)
      assert.equal(third.limited, true)

      const otherFamily = await searchPlaces(db, { lat: 11, lon: 11, radiusKm: 50, isDemo: false, homeId: 'family-fair-b' }, { providers })
      assert.equal(calls, 3, 'eine andere Identität darf trotzdem anfragen')
      assert.equal(otherFamily.limited, false)
    } finally {
      process.env.PLACES_DAILY_LIMIT_PER_IDENTITY = originalPerIdentity
    }
  })

  await t.test('Gleichzeitige identische Anfragen teilen sich einen einzigen In-Flight-Anbieter-Aufruf', async () => {
    config.placesProviders = ['overpass']
    let calls = 0
    const providers = {
      overpass: async () => {
        calls += 1
        await new Promise((resolve) => setTimeout(resolve, 30))
        return [{ id: 'osm:node/coalesce', name: 'Tierheim Gleichzeitig', typ: 'tierheim', lat: 12, lon: 12 }]
      }
    }

    const [a, b, c] = await Promise.all([
      searchPlaces(db, { lat: 12, lon: 12, radiusKm: 5, isDemo: false, homeId: 'family-coalesce' }, { providers }),
      searchPlaces(db, { lat: 12, lon: 12, radiusKm: 5, isDemo: false, homeId: 'family-coalesce' }, { providers }),
      searchPlaces(db, { lat: 12, lon: 12, radiusKm: 5, isDemo: false, homeId: 'family-coalesce' }, { providers })
    ])

    assert.equal(calls, 1, 'drei gleichzeitige identische Anfragen lösen nur einen Anbieter-Aufruf aus')
    for (const res of [a, b, c]) {
      assert.ok(res.results.some((r) => r.name === 'Tierheim Gleichzeitig'))
    }
  })

  await t.test('Cache: abgelaufene Einträge werden beim Lesen aufgeräumt', async () => {
    const { cacheKey } = require('../lib/places/cache')
    const staleKey = cacheKey('overpass', 20, 20, 5)
    db.prepare(`INSERT INTO places_cache (key, payload, created_at) VALUES (?, ?, datetime('now', '-8 days'))`).run(staleKey, '[]')
    assert.ok(db.prepare('SELECT 1 FROM places_cache WHERE key = ?').get(staleKey))

    // Tages-Budget bewusst erschöpft: die Suche liest (und räumt damit auf), schreibt aber nichts neu
    // in den Cache zurück - sonst würde der anschließende Aufruf den Schlüssel gleich wieder befüllen
    // und die Prüfung unten könnte nicht mehr zwischen "aufgeräumt" und "einfach neu geschrieben"
    // unterscheiden.
    config.placesProviders = ['overpass']
    config.placesDailyLimit = 0
    const providers = { overpass: async () => { throw new Error('sollte wegen erschöpftem Budget nie aufgerufen werden') } }
    const { limited } = await searchPlaces(db, { lat: 20, lon: 20, radiusKm: 5, isDemo: false }, { providers })
    config.placesDailyLimit = originalDailyLimit

    assert.equal(limited, true)
    assert.ok(!db.prepare('SELECT 1 FROM places_cache WHERE key = ?').get(staleKey), 'der abgelaufene Eintrag wurde beim Lesen entfernt')
  })

  // Mehrere Tests oben setzen config.placesProviders auf ['overpass'] (mit eigenen Fake-Providern) und
  // setzen es danach nicht zurück - ohne diesen Reset würden die Routen-Tests unten den ECHTEN
  // searchOverpass verwenden (kein `providers`-Override über die Route) und tatsächlich gegen
  // overpass-api.de gehen. Das ist hier ausdrücklich verboten (nie echte externe Dienste kontaktieren).
  config.placesProviders = originalProviders

  // --- Route: POST /api/places/search ------------------------------------------------------------

  await t.test('Route: ohne Session -> 401', async () => {
    const res = await call(base, '/api/places/search', { method: 'POST', body: { plz: '10115', radius: 10 } })
    assert.equal(res.status, 401)
  })

  const household = await createHousehold(base, 'Familie Umkreis')

  await t.test('Route: Validierung - Radius, unbekannte PLZ, ungültiger Standort', async () => {
    const badRadius = await call(base, '/api/places/search', { method: 'POST', cookie: household.cookie, body: { plz: '10115', radius: 7 } })
    assert.equal(badRadius.status, 400)

    const unknownPlz = await call(base, '/api/places/search', { method: 'POST', cookie: household.cookie, body: { plz: '00000', radius: 10 } })
    assert.equal(unknownPlz.status, 400)
    assert.match(unknownPlz.data.error, /Postleitzahl/)

    const badCoords = await call(base, '/api/places/search', { method: 'POST', cookie: household.cookie, body: { lat: 0, lon: 0, radius: 10 } })
    assert.equal(badCoords.status, 400)

    const missingEverything = await call(base, '/api/places/search', { method: 'POST', cookie: household.cookie, body: { radius: 10 } })
    assert.equal(missingEverything.status, 400)
  })

  await t.test('Route: gültige PLZ liefert center/ort, Radius und Attribution', async () => {
    const res = await call(base, '/api/places/search', { method: 'POST', cookie: household.cookie, body: { plz: '10115', radius: 10 } })
    assert.equal(res.status, 200)
    assert.equal(res.data.center.ort, 'Berlin')
    assert.equal(res.data.radius, 10)
    assert.deepEqual(res.data.attribution, ['© OpenStreetMap-Mitwirkende (ODbL)'])
    assert.ok(Array.isArray(res.data.results))
  })

  await t.test('Route: Standort-Koordinaten werden auf 0,01° gerundet', async () => {
    const res = await call(base, '/api/places/search', { method: 'POST', cookie: household.cookie, body: { lat: 52.5321234, lon: 13.3849, radius: 10 } })
    assert.equal(res.status, 200)
    assert.equal(res.data.center.lat, 52.53)
    assert.equal(res.data.center.lon, 13.38)
  })

  await t.test('Route: eine Demo-Session darf mitsuchen (requireSession statt requireAuth)', async () => {
    db.prepare('UPDATE families SET is_demo = 1 WHERE id = ?').run(household.data.id)
    const res = await call(base, '/api/places/search', { method: 'POST', cookie: household.cookie, body: { plz: '20095', radius: 10 } })
    assert.equal(res.status, 200)
    db.prepare('UPDATE families SET is_demo = 0 WHERE id = ?').run(household.data.id)
  })

  await t.test('Datenschutz: ein unerwarteter Fehler in der Route loggt die Koordinaten nicht', async () => {
    const originalPrepare = db.prepare.bind(db)
    db.prepare = (sql, ...rest) => {
      if (typeof sql === 'string' && sql.includes("FROM partners WHERE status = 'aktiv'")) {
        throw new Error('absichtlich kaputt für diesen Test')
      }
      return originalPrepare(sql, ...rest)
    }

    const logs = []
    const originalError = console.error
    const originalLog = console.log
    console.error = (...args) => logs.push(args)
    console.log = (...args) => logs.push(args)

    const secretLat = 53.1171
    const secretLon = 9.2123
    try {
      const res = await call(base, '/api/places/search', {
        method: 'POST',
        cookie: household.cookie,
        body: { lat: secretLat, lon: secretLon, radius: 10 }
      })
      assert.equal(res.status, 500)
    } finally {
      db.prepare = originalPrepare
      console.error = originalError
      console.log = originalLog
    }

    const dump = JSON.stringify(logs)
    assert.ok(!dump.includes(String(secretLat)), 'die Breite darf nicht in Logs auftauchen')
    assert.ok(!dump.includes(String(secretLon)), 'die Länge darf nicht in Logs auftauchen')
  })
})
