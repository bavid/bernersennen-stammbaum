const config = require('./config')
const { createApp } = require('./app')

const HEADERS_TIMEOUT_MS = 20_000
const REQUEST_TIMEOUT_MS = 120_000 // großzügig für Foto-Uploads über langsames Mobilnetz

const app = createApp()

const server = app.listen(config.port, () => {
  console.log(`Familienchronik läuft auf http://localhost:${config.port}`)
})
// Langsame oder hängende Verbindungen nicht ewig offen halten
server.headersTimeout = HEADERS_TIMEOUT_MS
server.requestTimeout = REQUEST_TIMEOUT_MS
