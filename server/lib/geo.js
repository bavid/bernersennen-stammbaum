// Postleitzahlen: GeoNames (geonames.org), CC BY 4.0 - siehe server/geo/README.md.
const plz = require('../geo/plz-de.json')

const EARTH_KM = 6371

// PLZ (5 Ziffern) → { lat, lon, ort } oder null
function lookupPlz(code) {
  if (typeof code !== 'string' || !/^\d{5}$/.test(code)) return null
  const hit = plz[code]
  return hit ? { lat: hit[0], lon: hit[1], ort: hit[2] } : null
}

// Standort-Koordinaten nie genauer als ~1 km verarbeiten
function roundCoord(value, step = 0.01) {
  return Math.round(value / step) * step
}

function validCoords(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= 47 && lat <= 55.2 && lon >= 5.5 && lon <= 15.5
}

function distanceKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLon = rad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h))
}

module.exports = { lookupPlz, roundCoord, validCoords, distanceKm }
