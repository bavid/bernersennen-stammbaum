'use strict'

// Phase V2: was eine Besuchs-Sitzung (ein Zuhause sieht ein anderes Zuhause als Gast an, lib/visits.js) darf.
// Deny by default: middleware/auth.js requireSession lehnt JEDE Anfrage einer Besuchs-Sitzung mit 403 ab, die hier
// nicht ausdrücklich steht - so kann keine bestehende oder künftige Route versehentlich Daten des Gastgebers
// (Gutscheine, Mitglieder, Pinnwand, Zuchtbuch, Zugang, ...) zeigen oder ändern. Die erlaubten Lese-Routen
// filtern selbst auf das, was ein Gast sehen darf (nicht-private Einträge, keine Bearbeiten-Rechte, siehe
// routes/dogs.js, routes/timeline.js, routes/breeding.js, routes/notes.js, lib/uploadAccess.js).
// Pfade: der volle Pfad der Anfrage ohne Query, klein geschrieben, ohne abschließende Schrägstriche (Express routet
// ohne "case sensitive"/"strict routing" genauso). Alles, was hier nicht passt (auch exotische Schreibweisen), ist
// gesperrt - im Zweifel lieber 403.

const READ_METHODS = new Set(['GET', 'HEAD'])

const GUEST_READS = [
  /^\/api\/me$/,
  /^\/api\/dogs$/,
  /^\/api\/dogs\/(all|links|\d+)$/,
  /^\/api\/timeline$/,
  /^\/api\/timeline\/recent$/,
  // Leere Listen für Gäste (Zuchtbuch und Pinnwand gehören nicht zu einem Besuch) - die Seiten laden sie mit.
  /^\/api\/breeding$/,
  /^\/api\/notes$/,
  /^\/api\/besuche$/,
  // Fotos: lib/uploadAccess.js canSeeUpload prüft für Gäste nur nicht-private Einträge und Tierfotos.
  /^\/uploads\/[^/]+$/,
  // Bild eines Zuhauses/einer Familie: routes/profil.js prüft selbst (lib/profil.js canSeeBild).
  /^\/api\/profil\/\d+\/bild$/
]

// Schreiben nur: kommentieren, den eigenen Kommentar löschen, zurück nach Hause wechseln, abmelden, den Besuch beenden.
// Dazu ein lesender POST: die Suche (Suchbegriff im Body, nie in der URL) - lib/searchAreas.js beschränkt eine
// Besuchs-Sitzung auf das eigene Zuhause und die Gast-Regeln beim Gastgeber.
const GUEST_WRITES = [
  { method: 'POST', re: /^\/api\/suche$/ },
  { method: 'POST', re: /^\/api\/view$/ },
  { method: 'POST', re: /^\/api\/logout$/ },
  { method: 'POST', re: /^\/api\/timeline\/\d+\/comments$/ },
  { method: 'DELETE', re: /^\/api\/timeline\/\d+\/comments\/\d+$/ },
  { method: 'DELETE', re: /^\/api\/besuche\/bei\/\d+$/ }
]

const GUEST_READ_ONLY = 'Zu Besuch – hier kannst du ansehen und kommentieren, aber nichts ändern.'

function requestPath(req) {
  const raw = String(req.originalUrl || req.url || '').split('?')[0]
  return (raw.replace(/\/+$/, '') || '/').toLowerCase()
}

function isGuestAllowed(req) {
  const urlPath = requestPath(req)
  if (READ_METHODS.has(req.method)) return GUEST_READS.some((re) => re.test(urlPath))
  return GUEST_WRITES.some((rule) => rule.method === req.method && rule.re.test(urlPath))
}

module.exports = { isGuestAllowed, GUEST_READ_ONLY }
