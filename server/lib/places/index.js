'use strict'

// Umkreissuche: mischt aktive Partner mit Anbieter-Treffern (fixture/overpass), entfernt Dubletten,
// filtert Züchter und sortiert Partner zuerst, dann nach Entfernung (Task 3).

const config = require('../../config')
const { distanceKm } = require('../geo')
const { looksLikeBreeder } = require('../breederGuard')
const { cacheKey, cellCenter, readCache, writeCache, consumeOverpassBudget, consumeIdentityBudget } = require('./cache')
const { searchFixture } = require('./providers/fixture')
const { searchOverpass } = require('./providers/overpass')

const MAX_RESULTS = 60
const DEDUPE_RADIUS_KM = 0.15
const ATTRIBUTION = ['© OpenStreetMap-Mitwirkende (ODbL)']

// Overpass wird an der 0,05°-Zell-Mitte abgefragt (nicht an den exakten Nutzer-Koordinaten) und mit
// diesem Polster über den angefragten Radius hinaus - sonst würde ein zweiter Suchpunkt in derselben
// Zelle (Cache-Treffer) Orte verpassen, die zwar in seinem eigenen Radius liegen, aber außerhalb des
// Kreises um den ERSTEN Suchpunkt, der ursprünglich abgefragt wurde (security-review Phase 2 Finding 3).
const CELL_RADIUS_PAD_KM = 4

function normalizeName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

// Aktive Partner im Umkreis - Demo-Partner nur für die Demo bzw. in dev/staging (dieselbe Regel wie
// routes/partners.js demoAllowed, hier ohne Request/Query, weil das über isDemo hereinkommt).
function findActivePartnersNear(db, { lat, lon, radiusKm, isDemo }) {
  const includeDemo = isDemo || config.appEnv === 'dev' || config.appEnv === 'staging'
  const demoClause = includeDemo ? '' : 'AND is_demo = 0'
  const rows = db.prepare(`SELECT * FROM partners WHERE status = 'aktiv' ${demoClause}`).all()

  return rows
    .filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lon))
    .map((row) => ({ row, distance: distanceKm({ lat, lon }, { lat: row.lat, lon: row.lon }) }))
    .filter(({ distance }) => distance <= radiusKm)
    .map(({ row, distance }) => ({
      id: `partner:${row.id}`,
      // osm_ref (falls vom Admin gepflegt) macht einen Partner mit einem gleichzeitig gefundenen
      // OSM-/Fixture-Treffer über dieselbe Adresse als Dublette erkennbar (siehe dedupe unten).
      _matchId: row.osm_ref || null,
      name: row.name,
      typ: row.typ,
      lat: row.lat,
      lon: row.lon,
      distanceKm: Math.round(distance * 10) / 10,
      website: row.website,
      telefon: row.kontakt_telefon,
      email: row.kontakt_email,
      adresse: row.ort || null,
      quelle: 'partner',
      badge: row.ist_partner ? 'partner' : 'geprueft',
      slug: row.slug,
      logoUrl: row.logo_file ? `/partner-media/${row.logo_file}` : null
    }))
}

function withDistance(place, center) {
  return { ...place, _matchId: place.id, distanceKm: Math.round(distanceKm(center, { lat: place.lat, lon: place.lon }) * 10) / 10 }
}

function sameLocation(a, b) {
  if (a._matchId && b._matchId && a._matchId === b._matchId) return true
  if (normalizeName(a.name) !== normalizeName(b.name)) return false
  return distanceKm({ lat: a.lat, lon: a.lon }, { lat: b.lat, lon: b.lon }) <= DEDUPE_RADIUS_KM
}

// Partner MÜSSEN vor den Anbieter-Treffern in `results` stehen, damit sie bei einer Dublette gewinnen -
// sie werden zuerst behalten, ein späterer Anbieter-Treffer an derselben Stelle wird einfach übersprungen.
function dedupe(results) {
  const kept = []
  for (const candidate of results) {
    if (!kept.some((existing) => sameLocation(candidate, existing))) kept.push(candidate)
  }
  return kept
}

function filterByRadius(places, center, radiusKm) {
  return places.filter((place) => distanceKm(center, { lat: place.lat, lon: place.lon }) <= radiusKm)
}

// Ein In-Flight-Promise pro Cache-Schlüssel (Finding 10): mehrere gleichzeitige Anfragen für dieselbe
// Zelle/denselben Radius teilen sich EINEN Overpass-Aufruf, statt jede für sich das Budget zu belasten.
// Rein im Prozessspeicher - bei mehreren Server-Prozessen ist das kein Ersatz für das DB-Budget
// (places_budget), nur eine zusätzliche Bremse innerhalb eines Prozesses.
const inFlightOverpass = new Map() // cacheKey -> Promise<{ results, limited }>

// Fragt Overpass an der Zell-Mitte mit gepoltertem Radius an (siehe CELL_RADIUS_PAD_KM), schreibt bei
// Erfolg den Cache und gibt bei einem Anbieter-Fehler `limited: true` zurück, OHNE die Suche insgesamt
// scheitern zu lassen (Finding 4) - der Aufrufer bekommt dann nur Partner + ggf. Cache. Das Tages- UND
// Identitäts-Budget wird jeweils genau EINMAL je tatsächlichem Versuch verbraucht, nie mehrfach für
// gleichzeitige identische Anfragen (die sich das eine In-Flight-Promise teilen).
async function runOverpassFetch(db, { key, cellLat, cellLon, radiusKm, homeId, searchFn }) {
  if (inFlightOverpass.has(key)) return inFlightOverpass.get(key)

  if (!consumeIdentityBudget(homeId) || !consumeOverpassBudget(db, config.placesDailyLimit)) {
    return { results: [], limited: true }
  }

  const promise = (async () => {
    try {
      const results = await searchFn({ lat: cellLat, lon: cellLon, radiusKm: radiusKm + CELL_RADIUS_PAD_KM })
      writeCache(db, key, results)
      return { results, limited: false }
    } catch {
      return { results: [], limited: true }
    }
  })()

  inFlightOverpass.set(key, promise)
  try {
    return await promise
  } finally {
    inFlightOverpass.delete(key)
  }
}

async function fetchProviderResults(db, { lat, lon, radiusKm, isDemo, homeId, providers }) {
  const providerName = isDemo ? 'fixture' : config.placesProviders[0] || 'fixture'
  const searchFn = providers?.[providerName] || (providerName === 'overpass' ? searchOverpass : searchFixture)

  if (providerName !== 'overpass') {
    // Ein Anbieter-Fehler darf die Suche nie scheitern lassen (Finding 4) - Partner bleiben in jedem
    // Fall verfügbar, hier gibt es nur nichts vom Anbieter dazu.
    try {
      return { results: await searchFn({ lat, lon, radiusKm }), limited: false }
    } catch {
      return { results: [], limited: true }
    }
  }

  // Cache-Schlüssel und tatsächlicher Anfrage-Mittelpunkt sind bewusst getrennt: der Schlüssel rundet
  // auf die 0,05°-Zelle (cacheKey rundet intern selbst), abgefragt wird explizit an der Zell-MITTE mit
  // Polster (CELL_RADIUS_PAD_KM) - NUR diese gerundete Zell-Mitte erreicht je Overpass, nie die exakten
  // Nutzer-Koordinaten (Finding 3). Das Ergebnis (ob aus dem Cache oder frisch geholt) wird danach immer
  // anhand der ECHTEN Anfrage (lat/lon/radiusKm) neu gefiltert - zwei Suchpunkte in derselben Zelle
  // bekommen so beide ihre korrekte, eigene Trefferliste aus demselben gecachten Zell-Ergebnis.
  const key = cacheKey('overpass', lat, lon, radiusKm)
  const center = { lat, lon }

  const cached = readCache(db, key)
  if (cached) return { results: filterByRadius(cached, center, radiusKm), limited: false }

  const { lat: cellLat, lon: cellLon } = cellCenter(lat, lon)
  const { results: raw, limited } = await runOverpassFetch(db, { key, cellLat, cellLon, radiusKm, homeId, searchFn })
  return { results: filterByRadius(raw, center, radiusKm), limited }
}

// searchPlaces(db, { lat, lon, radiusKm, isDemo, homeId }, { providers }) - homeId (aus requireSession)
// steuert das Pro-Identität-Budget (Finding 10), providers erlaubt Tests, einzelne Anbieter zu ersetzen
// ({ fixture: fn } bzw. { overpass: fn }), ohne echte Netzwerkanfragen.
async function searchPlaces(db, { lat, lon, radiusKm, isDemo, homeId }, { providers } = {}) {
  const center = { lat, lon }
  const partners = findActivePartnersNear(db, { lat, lon, radiusKm, isDemo })
  const { results: providerResults, limited } = await fetchProviderResults(db, { lat, lon, radiusKm, isDemo, homeId, providers })

  const cleanProviderResults = providerResults
    .filter((place) => place && typeof place.name === 'string' && place.name.trim() && !looksLikeBreeder(place.name))
    .map((place) => withDistance(place, center))

  const merged = dedupe([...partners, ...cleanProviderResults])

  const sorted = merged
    .sort((a, b) => {
      const partnerDiff = (a.quelle === 'partner' ? 0 : 1) - (b.quelle === 'partner' ? 0 : 1)
      return partnerDiff !== 0 ? partnerDiff : a.distanceKm - b.distanceKm
    })
    .slice(0, MAX_RESULTS)
    .map(({ _matchId, ...rest }) => rest)

  return { results: sorted, limited, attribution: ATTRIBUTION }
}

module.exports = { searchPlaces, ATTRIBUTION }
