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

// Nächste Postleitzahl zu (gerundeten) Koordinaten - für „Standort für ‚In der Nähe‘ merken“ (Einstellungen › App): die
// App merkt sich danach nur die PLZ, auf dem Gerät. Außerhalb Deutschlands (nichts in MAX_NEAREST_KM) null.
const MAX_NEAREST_KM = 30

function nearestPlz(lat, lon) {
  if (!validCoords(lat, lon)) return null
  const here = { lat, lon }
  let best = null
  for (const [code, [plat, plon, ort]] of Object.entries(plz)) {
    const km = distanceKm(here, { lat: plat, lon: plon })
    if (!best || km < best.km) best = { plz: code, ort, km }
  }
  return best && best.km <= MAX_NEAREST_KM ? { plz: best.plz, ort: best.ort } : null
}

module.exports = { lookupPlz, nearestPlz, roundCoord, validCoords, distanceKm }
