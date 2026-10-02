'use strict'

const express = require('express')
const db = require('../db')
const { requireAuth } = require('../middleware/auth')
const { cleanId } = require('../lib/validate')
const { ART } = require('../lib/areaArt')
const { STATUS, taggableDogs, openRequests, decideRequest, countOpenRequests } = require('../lib/erlebtMit')

// Phase V2: "Erlebt mit" (/api/erlebt-mit) - alles für die Identität der Sitzung (req.homeId) als Zuhause und nur aus
// dem eigenen Zuhause heraus (nicht in einer Familie, nicht zu Besuch: die Besuchs-Sitzung sperrt
// middleware/auth.js ohnehin). requireAuth: die Demo liest nur.
const router = express.Router()

const findArt = db.prepare('SELECT art FROM families WHERE id = ?')

function requireOwnHome(req, res, next) {
  if (req.familyId !== req.homeId || findArt.get(req.homeId)?.art !== ART.zuhause) {
    return res.status(400).json({ error: 'Nur aus „Meine Chronik“ heraus möglich' })
  }
  next()
}

router.use(requireAuth, requireOwnHome)

// Tiere verbundener Zuhause, die man in einem eigenen Eintrag markieren darf: [{ id, name, nameUnbekannt, tierart,
// zuhauseId, zuhause }]
router.get('/tiere', (req, res) => {
  res.json(taggableDogs(req.homeId))
})

// Offene Anfragen an das eigene Zuhause ("Wilma war dabei - übernehmen?").
router.get('/offen', (req, res) => {
  res.json(openRequests(req.homeId))
})

function decide(status) {
  return (req, res, next) => {
    try {
      const result = decideRequest(req.homeId, cleanId(req.params.id), status)
      res.json({ ...result, offen: countOpenRequests(req.homeId) })
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message })
      next(err)
    }
  }
}

router.post('/:id/bestaetigen', decide(STATUS.bestaetigt))
router.post('/:id/ablehnen', decide(STATUS.abgelehnt))

module.exports = router
