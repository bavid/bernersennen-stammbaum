const config = require('./config')
const { createApp } = require('./app')
const { scheduleMessagePurge } = require('./lib/partnerMessages')
const { scheduleAnfragenPurge } = require('./lib/anfragen')

const HEADERS_TIMEOUT_MS = 20_000
const REQUEST_TIMEOUT_MS = 120_000 // großzügig für Foto-Uploads über langsames Mobilnetz

const app = createApp()

const server = app.listen(config.port, () => {
  console.log(`Familienchronik läuft auf http://localhost:${config.port}`)
  // Datenschutz: Kontaktnachrichten älter als 180 Tage löschen - jetzt und danach alle 24 Stunden, auch für
  // Partner, die ihren Posteingang nie öffnen (lib/partnerMessages.js). Bewusst hier und nicht in app.js,
  // damit Tests (createApp) keinen Timer starten.
  scheduleMessagePurge()
  // Ebenso die Anfragen (Phase N Task 1): erledigte/abgelehnte 180 Tage nach dem Abschluss, offene nach 365 Tagen.
  scheduleAnfragenPurge()
})
// Langsame oder hängende Verbindungen nicht ewig offen halten
server.headersTimeout = HEADERS_TIMEOUT_MS
server.requestTimeout = REQUEST_TIMEOUT_MS
