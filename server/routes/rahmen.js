'use strict'

// Digitaler Bilderrahmen auf einem anderen Gerät - öffentlich, OHNE Sitzung (Omas Tablet meldet sich nie an):
// - GET /api/rahmen/fotos mit Header X-Rahmen-Token: die Fotos laut der gespeicherten Auswahl des Geräts
//   (lib/bilderrahmen.js fotosForGeraet: nur eigene Tiere und Erinnerungen des Zuhauses, private nur mit Haken) als
//   kurzlebige, signierte Adressen (lib/rahmenSignatur.js). Das Token steht nie in Pfad oder Query (also in keinem Log).
// - GET /rahmen-foto/<datei>?g=&exp=&sig= - prüft Signatur, Ablauf, ob das Gerät noch gilt und ob das Foto noch zur
//   Auswahl gehört, und liefert dann die Datei aus dem Upload-Ordner. Jede Abweichung: 404 (verrät nichts).
// Beides noindex und ohne Referrer; die Liste no-store ohne ETag, eigenes Limit je IP gegen Durchprobieren.

const express = require('express')
const rateLimit = require('express-rate-limit')
const config = require('../config')
const { ipKeyGenerator } = require('../lib/rateLimitKey')
const { noStore, sendJsonWithoutEtag } = require('../lib/noStoreResponse')
const { fotosForGeraet, geraetMayShow } = require('../lib/bilderrahmen')
const { findGeraetByToken, findActiveGeraet, touchGeraet } = require('../lib/rahmenGeraete')
const { expiryFor, signedFotoUrl, verifyFotoRequest, nowSeconds } = require('../lib/rahmenSignatur')

const FIFTEEN_MINUTES = 15 * 60 * 1000
const TOKEN_HEADER = 'x-rahmen-token'
const ENDED = 'Dieser Bilderrahmen wurde beendet'
const ENDED_CODE = 'RAHMEN_BEENDET'
const ROBOTS = 'noindex, nofollow'

function privateHeaders(req, res, next) {
  res.setHeader('X-Robots-Tag', ROBOTS)
  res.setHeader('Referrer-Policy', 'no-referrer')
  next()
}

const rahmenLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: config.rahmenRateLimit,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator,
  message: { error: 'Zu viele Anfragen – der Bilderrahmen versucht es gleich noch einmal.' }
})

const api = express.Router()
api.use(noStore, privateHeaders, rahmenLimiter)

// Nur Name des Tiers, Datum und „In Erinnerung“ - keine Texte, keine Ids von Erinnerungen.
function deviceFoto(foto, deviceId, exp) {
  return { url: signedFotoUrl(foto.filename, deviceId, exp), tierName: foto.tierName, datum: foto.datum, inErinnerung: foto.inErinnerung }
}

function displayOptions(auswahl) {
  const { intervall, untertitel, uhr, nacht, mischen, heuteZuerst, erinnerung } = auswahl
  return { intervall, untertitel, uhr, nacht, mischen, heuteZuerst, erinnerung }
}

api.get('/fotos', (req, res) => {
  const geraet = findGeraetByToken(req.get(TOKEN_HEADER))
  if (!geraet) return sendJsonWithoutEtag(res, 401, { error: ENDED, code: ENDED_CODE })
  touchGeraet(geraet.id)
  const exp = expiryFor()
  const fotos = fotosForGeraet({ familyId: geraet.familyId, auswahl: geraet.auswahl })
  sendJsonWithoutEtag(res, 200, {
    name: geraet.name,
    fotos: fotos.map((foto) => deviceFoto(foto, geraet.id, exp)),
    optionen: displayOptions(geraet.auswahl),
    gueltigBis: new Date(exp * 1000).toISOString()
  })
})

api.use((req, res) => res.status(404).json({ error: 'Nicht gefunden' }))

const fotos = express.Router()
fotos.use(privateHeaders)

function notFound(res) {
  res.setHeader('Cache-Control', 'no-store')
  res.status(404).json({ error: 'Nicht gefunden' })
}

fotos.get('/:file', (req, res, next) => {
  const { g, exp, sig } = req.query
  const now = nowSeconds()
  const verified = verifyFotoRequest({ filename: req.params.file, g, exp, sig }, now)
  if (!verified) return notFound(res)
  const geraet = findActiveGeraet(verified.deviceId)
  if (!geraet || !geraetMayShow({ familyId: geraet.familyId, auswahl: geraet.auswahl }, verified.filename)) return notFound(res)
  // Bis zum Ablauf der Adresse darf der Browser das Foto behalten (die Diashow zeigt es wieder) - privat, nie geteilt.
  res.setHeader('Cache-Control', `private, max-age=${Math.max(0, verified.exp - now)}`)
  res.sendFile(verified.filename, { root: config.uploadDir, dotfiles: 'deny', cacheControl: false, lastModified: false }, (err) => {
    if (!err) return
    if (res.headersSent) return next(err)
    notFound(res)
  })
})

fotos.use((req, res) => notFound(res))

module.exports = { rahmenApiRouter: api, rahmenFotoRouter: fotos, rahmenPageHeaders: privateHeaders, ENDED, ENDED_CODE }
