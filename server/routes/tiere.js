'use strict'

// Tiere (/api/tiere, Phase W Schritt 4 „Alle Tiere an einem Ort“): GET / -> { tiere, areas } - alle Tiere aus dem eigenen
// Zuhause, den Familien des Haushalts und den befreundeten Zuhause, jedes genau einmal (lib/allAnimals.js, die Bereiche aus
// lib/searchAreas.js wie Start und Suche). areas: dieselben Bereiche mit der Zahl ihrer Tiere - für die Filter der Seite.
// Nimmt bewusst KEINE Angabe entgegen (auch keinen Bereich): welche Bereiche zählen, folgt allein aus der Identität der
// Sitzung - jede Angabe -> 400. Nur im eigenen Zuhause (aktiver Bereich = Identität, sonst 400: in einer Familie zeigt die
// Gruppenseite deren Tiere). Eine Besuchs-Sitzung kommt gar nicht bis hier (nicht in lib/guestAccess.js -> 403), Tierheime
// und Partner-Bereiche 404. requireAuth: die Demo liest (GET), die Admin-Ansicht ebenso. Persönliche Daten -> no-store.

const express = require('express')
const { requireAuth } = require('../middleware/auth')
const { noStore } = require('../lib/noStoreResponse')
const { homeScopeOf } = require('../lib/searchAreas')
const { allAnimals } = require('../lib/allAnimals')

const router = express.Router()
router.use(noStore)

const ONLY_AT_HOME = 'Alle Tiere gibt es nur im eigenen Zuhause.'
const NOT_HERE = 'Alle Tiere gibt es für Zuhause und Familien.'
const BAD_QUERY = 'Unbekannte Angabe für Tiere'

router.get('/', requireAuth, (req, res) => {
  if (req.familyId !== req.homeId) return res.status(400).json({ error: ONLY_AT_HOME })
  const scope = homeScopeOf(req.homeId)
  if (!scope) return res.status(404).json({ error: NOT_HERE })
  if (Object.keys(req.query).length > 0) return res.status(400).json({ error: BAD_QUERY })
  res.json(allAnimals({ areas: scope.areas, homeId: req.homeId, isDemo: scope.isDemo }))
})

module.exports = router
