// Standort-Koordinaten (Browser-Geolocation) nie genauer als ~1 km an den Server schicken – siehe
// server/lib/geo.js roundCoord, dieselbe Rundung, nur clientseitig fürs Runden vor dem Absenden.
const COORD_STEP = 0.01

export function roundCoord(value, step = COORD_STEP) {
  return Math.round(value / step) * step
}
