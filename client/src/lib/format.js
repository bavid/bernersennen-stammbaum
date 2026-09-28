// Entfernungen in der Partnerliste mit deutschem Dezimalkomma, z. B. "3,4 km".
export function formatDistanceKm(km) {
  return `${km.toFixed(1).replace('.', ',')} km`
}

// Externe Links (Website, Spenden, Vermittlung, Maps): nur echte http(s)-Adressen verlinken, nie
// beliebige Strings (z. B. "javascript:...") in ein href schreiben.
export function isExternalUrl(url) {
  return typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))
}

// Maps-Links für Partner/Orte mit Koordinaten (PartnerCard, PlaceList) – lat/lon kommen bereits geprüft
// vom Server (server/lib/geo.js validCoords), hier trotzdem nur mit Number.isFinite-Werten aufrufen.
export function googleMapsUrl({ lat, lon }) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`
}

export function osmUrl({ lat, lon }) {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`
}
