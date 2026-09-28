'use strict'

// Fragt die Overpass-API (OSM, ODbL) nach Tierheimen und Hundeschulen im Umkreis - nur über den
// SSRF-sicheren Helfer (lib/http.js), Host-Allowlist auf genau overpass-api.de (Task 3;
// security-review Phase 2 Finding 2: animal_breeding-Tags UND mehr Felder für den breederGuard).

const { safeFetchJson } = require('../../http')
const { looksLikeBreeder } = require('../../breederGuard')
const { sanitizeExternalUrl, sanitizeExternalEmail, sanitizeExternalPhone } = require('../../partners')

const OVERPASS_HOST = 'overpass-api.de'
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const OVERPASS_TIMEOUT_MS = 25000 // die Abfrage selbst sagt [timeout:20] - etwas Luft für Netzwerk/Antwort

function buildQuery(lat, lon, radiusKm) {
  const radiusMeters = Math.round(radiusKm * 1000)
  return (
    '[out:json][timeout:20];\n' +
    `( nwr["amenity"="animal_shelter"](around:${radiusMeters},${lat},${lon});\n` +
    `  nwr["amenity"="animal_training"]["animal_training"~"dog"](around:${radiusMeters},${lat},${lon}); );\n` +
    'out center tags 200;'
  )
}

function typFromTags(tags) {
  if (tags.amenity === 'animal_shelter') return 'tierheim'
  if (tags.amenity === 'animal_training') return 'hundeschule'
  return null
}

function coordsOf(element) {
  if (Number.isFinite(element.lat) && Number.isFinite(element.lon)) return { lat: element.lat, lon: element.lon }
  if (element.center && Number.isFinite(element.center.lat) && Number.isFinite(element.center.lon)) {
    return { lat: element.center.lat, lon: element.center.lon }
  }
  return null
}

function buildAddress(tags) {
  const street = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ')
  const city = [tags['addr:postcode'], tags['addr:city']].filter(Boolean).join(' ')
  return [street, city].filter(Boolean).join(', ') || null
}

// Jeder animal_breeding-Tag verwirft das Element - der genaue Schlüssel "animal_breeding" (z. B.
// animal_breeding=dog), JEDES Unterschlüssel-Tag "animal_breeding:*" (z. B. animal_breeding:dog=yes)
// UND amenity=animal_breeding selbst. Taucht bei unserer eigenen Abfrage (animal_shelter/
// animal_training) eigentlich nicht auf, ist aber defensiv geprüft - OSM-Daten sind fremdgepflegt.
function hasBreedingTag(tags) {
  if (tags.amenity === 'animal_breeding') return true
  return Object.keys(tags).some((key) => key === 'animal_breeding' || key.startsWith('animal_breeding:'))
}

// Ein Element wird verworfen, wenn es einen animal_breeding-Tag trägt, keinen brauchbaren
// Typ/Namen/Koordinaten hat, oder Name/Betreiber/Beschreibung/Website/weitere Namensfelder nach Zucht
// klingen (breederGuard) - OSM pflegt Züchter teils nur im Betreiber- oder Beschreibungsfeld, nicht im
// angezeigten Namen.
function mapElement(element) {
  const tags = element.tags || {}
  if (hasBreedingTag(tags)) return null

  const typ = typFromTags(tags)
  const name = typeof tags.name === 'string' ? tags.name.trim() : ''
  if (!typ || !name) return null

  const coords = coordsOf(element)
  if (!coords) return null

  const guardText = [tags.name, tags.operator, tags.description, tags.website, tags.alt_name, tags.official_name, tags.brand]
    .filter(Boolean)
    .join(' ')
  if (looksLikeBreeder(guardText)) return null

  return {
    id: `osm:${element.type}/${element.id}`,
    name,
    typ,
    lat: coords.lat,
    lon: coords.lon,
    // Fremdgepflegte OSM-Kontaktfelder nie ungeprüft übernehmen (z. B. "javascript:"-URLs) - dieselben
    // Regeln wie für Admin-Eingaben (lib/partners.js): ungültig -> null statt den ganzen Treffer zu
    // verwerfen.
    website: sanitizeExternalUrl(tags.website || tags['contact:website']),
    telefon: sanitizeExternalPhone(tags.phone || tags['contact:phone']),
    email: sanitizeExternalEmail(tags.email || tags['contact:email']),
    adresse: buildAddress(tags),
    quelle: 'osm'
  }
}

async function searchOverpass({ lat, lon, radiusKm }) {
  const query = buildQuery(lat, lon, radiusKm)
  const data = await safeFetchJson(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
    allowHosts: [OVERPASS_HOST],
    timeoutMs: OVERPASS_TIMEOUT_MS
  })
  const elements = Array.isArray(data?.elements) ? data.elements : []
  return elements.map(mapElement).filter(Boolean)
}

module.exports = { searchOverpass, buildQuery, mapElement, OVERPASS_URL, OVERPASS_HOST }
