'use strict'

// Antworten mit Klartext-Codes (Druckdaten für Admin und Partner, CSV-Export): kein Zwischenspeicher und kein
// Validator. security-review Phase 5: JEDE Antwort solcher Router (auch 404/401) trägt Cache-Control: no-store -
// kein Browser- oder Proxy-Cache darf Codes behalten. Ohne ETag: res.send/res.json erzeugen einen (Express-
// Einstellung 'etag', app-weit) - Antworten mit Codes sollen keinen Wert bekommen, über den ein Zwischenspeicher
// oder Client sie wiedererkennt oder per If-None-Match nachfragt. res.end schreibt den Body direkt (Express hüllt
// es nicht ein), Node setzt Content-Length selbst und lässt den Body bei HEAD weg.
// Genutzt von routes/adminStats.js und routes/partnerArea/vouchers.js.

const JSON_TYPE = 'application/json; charset=utf-8'
const CSV_TYPE = 'text/csv; charset=utf-8'

// Middleware: als Erstes in den Router hängen, damit auch spätere Ablehnungen (401/404) no-store tragen.
function noStore(req, res, next) {
  res.setHeader('Cache-Control', 'no-store')
  next()
}

function endWithoutEtag(res, status, contentType, body) {
  res.status(status)
  res.setHeader('Content-Type', contentType)
  res.end(body)
}

function sendJsonWithoutEtag(res, status, payload) {
  endWithoutEtag(res, status, JSON_TYPE, JSON.stringify(payload))
}

module.exports = { noStore, endWithoutEtag, sendJsonWithoutEtag, JSON_TYPE, CSV_TYPE }
