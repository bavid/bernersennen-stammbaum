// Entfernungen in der Partnerliste mit deutschem Dezimalkomma, z. B. "3,4 km".
export function formatDistanceKm(km) {
  return `${km.toFixed(1).replace('.', ',')} km`
}

// Externe Links (Website, Spenden, Vermittlung, Maps): nur echte http(s)-Adressen verlinken, nie
// beliebige Strings (z. B. "javascript:...") in ein href schreiben.
export function isExternalUrl(url) {
  return typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))
}
