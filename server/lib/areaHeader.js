'use strict'

// Phase W (Ruhige Hülle): Schutz gegen zwei Tabs in verschiedenen Bereichen. Der Client schickt mit jeder API-Anfrage
// den Bereich, den er gerade zeigt (Header X-Bereich: <family.id>). Hat ein anderer Tab die Sitzung inzwischen in einen
// anderen Bereich gewechselt, passt der Header nicht mehr zum aktiven Bereich der Sitzung - middleware/auth.js
// requireSession antwortet dann mit 409 {code:'BEREICH'}, der Client lädt /me neu und schaltet zurück (AreaGate).
// Der Header kann nur ablehnen, nie Zugriff erweitern: der aktive Bereich kommt allein aus dem signierten Cookie.
// Ohne Header (ältere Clients, <img>, curl) bleibt alles wie bisher.

const AREA_HEADER = 'X-Bereich'
const AREA_MISMATCH_CODE = 'BEREICH'
const AREA_MISMATCH_MESSAGE = 'Du warst in einem anderen Fenster in einem anderen Bereich – die Seite lädt neu.'

// Pfade (voller Pfad ohne Query, klein geschrieben, ohne abschließende Schrägstriche), die den Header nicht prüfen:
// /me (daraus erfährt der Client den aktiven Bereich), /view (der Wechsel selbst), /logout und die Einlöse-Wege, die aus
// jedem Zustand heraus funktionieren sollen. Alle laufen ohnehin durch die übrigen Prüfungen der Sitzung.
const EXEMPT_PATHS = new Set(['/api/me', '/api/view', '/api/logout', '/api/vouchers/claim', '/api/besuche/einloesen'])

const AREA_ID_RE = /^[1-9]\d{0,15}$/

function requestPath(req) {
  const raw = String(req.originalUrl || req.url || '').split('?')[0]
  return (raw.replace(/\/+$/, '') || '/').toLowerCase()
}

// true: der Header ist gesetzt und nennt nicht den aktiven Bereich (activeId) - auch ein kaputter Wert zählt als
// Abweichung. false: kein Header, ein befreiter Pfad oder der Header passt.
function isAreaMismatch(req, activeId) {
  const raw = req.get(AREA_HEADER)
  if (raw === undefined || raw === '') return false
  if (EXEMPT_PATHS.has(requestPath(req))) return false
  // Als Text vergleichen: ein überlanger Wert verlöre als Zahl Stellen und passte dann womöglich doch.
  return !(AREA_ID_RE.test(raw) && raw === String(activeId))
}

function sendAreaMismatch(res) {
  return res.status(409).json({ error: AREA_MISMATCH_MESSAGE, code: AREA_MISMATCH_CODE })
}

module.exports = { AREA_HEADER, AREA_MISMATCH_CODE, isAreaMismatch, sendAreaMismatch }
