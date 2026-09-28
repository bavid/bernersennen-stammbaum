'use strict'

// Umkreissuche: mischt aktive Partner mit Anbieter-Treffern (fixture/overpass), entfernt Dubletten,
// filtert Züchter und sortiert Partner zuerst, dann nach Entfernung (Task 3).

const config = require('../../config')
const { distanceKm } = require('../geo')
const { looksLikeBreeder } = require('../breederGuard')
const { cacheKey, readCache, writeCache, consumeOverpassBudget } = require('./cache')
const { searchFixture } = require('./providers/fixture')
const { searchOverpass } = require('./providers/overpass')

const MAX_RESULTS = 60
const DEDUPE_RADIUS_KM = 0.15
const ATTRIBUTION = ['© OpenStreetMap-Mitwirkende (ODbL)']

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

async function fetchProviderResults(db, { lat, lon, radiusKm, isDemo, providers }) {
  const providerName = isDemo ? 'fixture' : config.placesProviders[0] || 'fixture'
  const searchFn = providers?.[providerName] || (providerName === 'overpass' ? searchOverpass : searchFixture)

  if (providerName !== 'overpass') {
    return { results: await searchFn({ lat, lon, radiusKm }), limited: false }
  }

  const key = cacheKey('overpass', lat, lon, radiusKm)
  const cached = readCache(db, key)
  if (cached) return { results: cached, limited: false }

  if (!consumeOverpassBudget(db, config.placesDailyLimit)) {
    return { results: [], limited: true }
  }

  const results = await searchFn({ lat, lon, radiusKm })
  writeCache(db, key, results)
  return { results, limited: false }
}

// searchPlaces(db, { lat, lon, radiusKm, isDemo }, { providers }) - providers erlaubt Tests, einzelne
// Anbieter zu ersetzen ({ fixture: fn } bzw. { overpass: fn }), ohne echte Netzwerkanfragen.
async function searchPlaces(db, { lat, lon, radiusKm, isDemo }, { providers } = {}) {
  const center = { lat, lon }
  const partners = findActivePartnersNear(db, { lat, lon, radiusKm, isDemo })
  const { results: providerResults, limited } = await fetchProviderResults(db, { lat, lon, radiusKm, isDemo, providers })

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
