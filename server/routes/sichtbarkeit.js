'use strict'

// „Wer sieht was“ (lib/sichtbarkeit.js) - nur lesen, nur im eigenen Zuhause (nicht in einer Familie, nicht zu Besuch).
// GET /uebersicht -> { tiere: [{ id, privat, geteilt, tierheim: { name, liestMit } | null }] }. Persönlich -> no-store.

const express = require('express')
const { requireAuth } = require('../middleware/auth')
const { noStore } = require('../lib/noStoreResponse')
const { isOwnHomeView } = require('../lib/erlebtMitView')
const { sichtbarkeitUebersicht } = require('../lib/sichtbarkeit')

const router = express.Router()
router.use(noStore)

router.get('/uebersicht', requireAuth, (req, res) => {
  if (!isOwnHomeView(req)) return res.status(403).json({ error: 'Nur im eigenen Zuhause' })
  res.json(sichtbarkeitUebersicht(req.homeId))
})

module.exports = router
