'use strict'

// „So geht es euren Schützlingen“ (GET /api/schuetzlinge -> { items }, lib/schuetzlinge.js): die neuesten Erinnerungen der
// vermittelten Tiere, bei denen das neue Zuhause das Tierheim mitlesen lässt - für die Seite „Unsere Tiere“ eines Tierheims.
// Nimmt keine Angaben entgegen (jede -> 400): welches Tierheim, folgt allein aus der Sitzung. Nur im eigenen Tierheim-Bereich
// (Identität = aktiver Bereich, art 'tierheim'), sonst 404; eine Besuchs-Sitzung kommt gar nicht bis hier (lib/guestAccess.js
// -> 403). requireAuth: die Demo und die Admin-Ansicht lesen (GET). Persönliche Daten -> jede Antwort no-store.

const express = require('express')
const db = require('../db')
const { requireAuth } = require('../middleware/auth')
const { noStore } = require('../lib/noStoreResponse')
const { ART } = require('../lib/areaArt')
const { wardNews } = require('../lib/schuetzlinge')

const router = express.Router()
router.use(noStore)

const ONLY_SHELTERS = 'Das gibt es nur für Tierheime.'
const NO_QUERY = 'Unbekannte Angabe'

const findArea = db.prepare('SELECT art FROM families WHERE id = ?')

router.get('/', requireAuth, (req, res) => {
  if (Object.keys(req.query).length > 0) return res.status(400).json({ error: NO_QUERY })
  const isShelter = req.familyId === req.homeId && findArea.get(req.familyId)?.art === ART.tierheim
  if (!isShelter) return res.status(404).json({ error: ONLY_SHELTERS })
  res.json({ items: wardNews(req.familyId) })
})

module.exports = router
