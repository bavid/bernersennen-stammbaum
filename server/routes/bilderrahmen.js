'use strict'

// Digitaler Bilderrahmen, angemeldet (/api/bilderrahmen):
// - GET /fotos?tiere=1,2&zeitraum=alle|jahr|monat&privat=1 - die Fotos der Diashow im aktiven Bereich (lib/bilderrahmen.js);
//   private Erinnerungen nur mit privat=1 und nur im eigenen Zuhause.
//   Ein Gast (Besuchs-Sitzung) bekommt schon von middleware/auth.js 403 (lib/guestAccess.js kennt diesen Pfad nicht).
// - /geraete - Rahmen-Links für ein anderes Gerät (lib/rahmenGeraete.js), nur im eigenen Zuhause. Anlegen zeigt das
//   Token genau einmal; Demo und Admin-Ansicht lesen nur (requireAuth bzw. middleware/auth.js denyAdminViewWrites).
// Alle Antworten no-store: Fotolisten und erst recht das Token gehören in keinen Zwischenspeicher.

const express = require('express')
const rateLimit = require('express-rate-limit')
const config = require('../config')
const { requireAuth } = require('../middleware/auth')
const { authLimiter, limitWrites } = require('../middleware/abuse')
const { noStore, sendJsonWithoutEtag } = require('../lib/noStoreResponse')
const { ART } = require('../lib/context')
const { cleanId } = require('../lib/validate')
const { fotosForArea, parseTiere, isZeitraum } = require('../lib/bilderrahmen')
const { MAX_GERAETE, createGeraet, listGeraete, updateGeraet, revokeGeraet } = require('../lib/rahmenGeraete')
const db = require('../db')

const router = express.Router()
router.use(noStore)
router.use(limitWrites)

const NOT_FOUND = 'Diesen Bilderrahmen gibt es nicht (mehr)'
const ONLY_HOME = 'Bilderrahmen für andere Geräte richtet ihr in „Mein Zuhause“ ein.'
const ONLY_HOUSEHOLD = 'Den Bilderrahmen gibt es für Zuhause und Familien.'

const findArt = db.prepare('SELECT art FROM families WHERE id = ?').pluck()

// Eine Fotoliste liest bis zu 2000 Erinnerungen - je Bereich darum ein eigenes, knappes Limit (security-review: sonst
// könnte eine Sitzung den einen Node-Prozess mit Listen beschäftigen). Nach requireAuth (braucht req.familyId).
const FIVE_MINUTES = 5 * 60 * 1000
const fotosLimiter = rateLimit({
  windowMs: FIVE_MINUTES,
  limit: config.bilderrahmenRateLimit,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `bilderrahmen-${req.familyId}`,
  message: { error: 'Sehr viele Anfragen in kurzer Zeit – bitte einen Moment warten.' }
})

function publicFoto({ url, tierId, tierName, datum, eintragId, inErinnerung }) {
  return { url, tierId, tierName, datum, eintragId, inErinnerung }
}

router.get('/fotos', requireAuth, fotosLimiter, (req, res) => {
  const art = findArt.get(req.familyId)
  if (art !== ART.zuhause && art !== ART.rudel) return res.status(403).json({ error: ONLY_HOUSEHOLD })
  const tiere = parseTiere(req.query.tiere)
  if (!tiere) return res.status(400).json({ error: 'Ungültige Auswahl der Tiere' })
  const zeitraum = req.query.zeitraum || 'alle'
  if (!isZeitraum(zeitraum)) return res.status(400).json({ error: 'Ungültiger Zeitraum' })
  const privat = req.query.privat === '1'
  const { fotos, tiere: alleTiere } = fotosForArea({ familyId: req.familyId, homeId: req.homeId, tiere, zeitraum, privat })
  sendJsonWithoutEtag(res, 200, { fotos: fotos.map(publicFoto), tiere: alleTiere })
})

// Rahmen-Links verwaltet nur das eigene Zuhause selbst (nicht aus einer Familie heraus, kein klassischer Login).
function requireOwnHome(req, res, next) {
  if (req.familyId !== req.homeId || findArt.get(req.homeId) !== ART.zuhause) return res.status(403).json({ error: ONLY_HOME })
  next()
}

function sendError(res, err) {
  if (!err.status) throw err
  res.status(err.status).json({ error: err.message })
}

router.get('/geraete', requireAuth, requireOwnHome, (req, res) => {
  sendJsonWithoutEtag(res, 200, { geraete: listGeraete(req.homeId), max: MAX_GERAETE })
})

router.post('/geraete', authLimiter, requireAuth, requireOwnHome, (req, res) => {
  try {
    const { geraet, token } = createGeraet(req.homeId, req.body || {})
    sendJsonWithoutEtag(res, 201, { geraet, token })
  } catch (err) {
    sendError(res, err)
  }
})

function readId(req, res) {
  const id = cleanId(req.params.id)
  if (!id) {
    res.status(404).json({ error: NOT_FOUND })
    return null
  }
  return id
}

router.put('/geraete/:id', requireAuth, requireOwnHome, (req, res) => {
  const id = readId(req, res)
  if (!id) return
  try {
    const geraet = updateGeraet(req.homeId, id, req.body || {})
    if (!geraet) return res.status(404).json({ error: NOT_FOUND })
    sendJsonWithoutEtag(res, 200, { geraet })
  } catch (err) {
    sendError(res, err)
  }
})

router.delete('/geraete/:id', requireAuth, requireOwnHome, (req, res) => {
  const id = readId(req, res)
  if (!id) return
  if (!revokeGeraet(req.homeId, id)) return res.status(404).json({ error: NOT_FOUND })
  res.status(204).end()
})

module.exports = router
