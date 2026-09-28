'use strict'

// Fragt die Overpass-API (OSM, ODbL) nach Tierheimen und Hundeschulen im Umkreis - nur über den
// SSRF-sicheren Helfer (lib/http.js), Host-Allowlist auf genau overpass-api.de (Task 3).

const { safeFetchJson } = require('../../http')
const { looksLikeBreeder } = require('../../breederGuard')

const OVERPASS_HOST = 'overpass-api.de'
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

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

// Ein Element wird verworfen, wenn es keinen brauchbaren Typ/Namen/Koordinaten hat, explizit als
// Zucht getaggt ist (amenity=animal_breeding - taucht bei unserer Abfrage eigentlich nicht auf, aber
// defensiv geprüft) oder Name/Betreiber nach Zucht klingt (breederGuard).
function mapElement(element) {
  const tags = element.tags || {}
  if (tags.amenity === 'animal_breeding') return null

  const typ = typFromTags(tags)
  const name = typeof tags.name === 'string' ? tags.name.trim() : ''
  if (!typ || !name) return null

  const coords = coordsOf(element)
  if (!coords) return null

  const guardText = [name, tags.operator, tags.description].filter(Boolean).join(' ')
  if (looksLikeBreeder(guardText)) return null

  return {
    id: `osm:${element.type}/${element.id}`,
    name,
    typ,
    lat: coords.lat,
    lon: coords.lon,
    website: tags.website || tags['contact:website'] || null,
    telefon: tags.phone || tags['contact:phone'] || null,
    email: tags.email || tags['contact:email'] || null,
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
    allowHosts: [OVERPASS_HOST]
  })
  const elements = Array.isArray(data?.elements) ? data.elements : []
  return elements.map(mapElement).filter(Boolean)
}

module.exports = { searchOverpass, buildQuery, mapElement, OVERPASS_URL, OVERPASS_HOST }
