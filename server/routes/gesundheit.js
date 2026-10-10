'use strict'

// „Gesundheit leicht“ (lib/gesundheit.js) - nur lesen; geschrieben wird über POST/PUT /api/timeline.
// GET /?dogId=      -> { letzte } für den Reiter „Infos“ eines EIGENEN Tiers (fremdes oder unbekanntes Tier: 404).
// GET /bald?heute=  -> [{ dogId, dogName, art, naechstesAm, entryId }] für „Bald“ auf Start - nur im eigenen Zuhause.
// Besuchs-Sitzungen sehen nichts davon (Gesundheit ist persönlich). Persönliche Daten -> no-store.

const express = require('express')
const { requireAuth } = require('../middleware/auth')
const { noStore } = require('../lib/noStoreResponse')
const { cleanId, isIsoDate } = require('../lib/validate')
const { gesundheitUebersicht, gesundheitBald } = require('../lib/gesundheit')

const router = express.Router()
router.use(noStore)

const NOT_FOUND = 'Tier nicht gefunden'

router.get('/', requireAuth, (req, res) => {
  const dogId = cleanId(req.query.dogId)
  if (!dogId) return res.status(400).json({ error: 'dogId ist ungültig' })
  const uebersicht = req.isGuest ? null : gesundheitUebersicht(req.familyId, dogId)
  if (!uebersicht) return res.status(404).json({ error: NOT_FOUND })
  res.json(uebersicht)
})

router.get('/bald', requireAuth, (req, res) => {
  if (!isIsoDate(req.query.heute)) return res.status(400).json({ error: 'heute ist ungültig' })
  if (req.isGuest || req.familyId !== req.homeId) return res.json([])
  res.json(gesundheitBald(req.familyId, req.query.heute))
})

module.exports = router
