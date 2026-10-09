const express = require('express')
const { denyDemoWrites } = require('../../middleware/auth')
const { noStore } = require('../../lib/noStoreResponse')
const { cleanId } = require('../../lib/validate')
const { STATUS } = require('../../lib/wirWarenHier')
const { overviewForPartner, decideCheckin, decidePin, removeCheckinAsPartner } = require('../../lib/wwhPins')

// „Wir waren hier“ im Partner-Bereich (docs/superpowers/plans/2026-10-10-wir-waren-hier.md, Aufgabe 2): der Ort gibt
// Anmeldungen und angeheftete Erinnerungen frei oder lehnt sie ab. Läuft hinter requirePartnerArea (req.partner ist
// gesetzt); jede Id wird im SQL gegen req.partner.id geprüft, Fremdes ist 404. Demo-Sitzungen lesen nur.
// Antworten tragen no-store: sie enthalten Erinnerungstexte der Familien.

const router = express.Router()
router.use(noStore)

function sendError(err, res, next) {
  if (err.status) return res.status(err.status).json({ error: err.message })
  next(err)
}

function decideRoute(decide, status) {
  return (req, res, next) => {
    try {
      res.json(decide(req.partner.id, cleanId(req.params.id), status))
    } catch (err) {
      sendError(err, res, next)
    }
  }
}

// { anmeldungen: [{ id, status, createdAt, tierName, tierart, fotoUrl }], erinnerungen: [{ id, checkinId, status, tierName, titel, datum, text }] }
router.get('/', (req, res) => {
  res.json(overviewForPartner(req.partner.id))
})

router.post('/checkins/:id/freigeben', denyDemoWrites, decideRoute(decideCheckin, STATUS.bestaetigt))
router.post('/checkins/:id/ablehnen', denyDemoWrites, decideRoute(decideCheckin, STATUS.abgelehnt))
router.post('/erinnerungen/:id/freigeben', denyDemoWrites, decideRoute(decidePin, STATUS.bestaetigt))
router.post('/erinnerungen/:id/ablehnen', denyDemoWrites, decideRoute(decidePin, STATUS.abgelehnt))

router.delete('/checkins/:id', denyDemoWrites, (req, res, next) => {
  try {
    removeCheckinAsPartner(req.partner.id, cleanId(req.params.id))
    res.status(204).end()
  } catch (err) {
    sendError(err, res, next)
  }
})

module.exports = router
