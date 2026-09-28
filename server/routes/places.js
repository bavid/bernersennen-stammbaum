const express = require('express')
const rateLimit = require('express-rate-limit')
const db = require('../db')
const { requireSession } = require('../middleware/auth')
const { ipKeyGenerator } = require('../lib/rateLimitKey')
const { lookupPlz, roundCoord, validCoords } = require('../lib/geo')
const { searchPlaces } = require('../lib/places')

const router = express.Router()

const TEN_MINUTES = 10 * 60 * 1000
const RADIUS_VALUES = [5, 10, 25, 50, 100]

// Pro IP, nicht pro Rudel - die Demo darf mitsuchen, requireSession lässt sie deshalb bewusst durch
// (anders als requireAuth, das Schreibzugriffe der Demo sperrt).
const placesLimiter = rateLimit({
  windowMs: TEN_MINUTES,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator,
  message: { error: 'Zu viele Anfragen in kurzer Zeit – bitte einen Moment warten.' }
})

// POST /api/places/search { plz } ODER { lat, lon } + radius (5|10|25|50|100). Koordinaten/PLZ landen
// NIE in Logs: kein Request-Logging hier, und der Fehler-Handler (app.js) gibt bei einem 5xx nur das
// Error-Objekt aus, nie req.body - deshalb wird unten auch nie etwas aus dem Body in eine Fehlermeldung
// eingebaut.
router.post('/search', placesLimiter, requireSession, async (req, res, next) => {
  try {
    const { plz, lat, lon, radius } = req.body || {}
    const radiusKm = Number(radius)
    if (!RADIUS_VALUES.includes(radiusKm)) {
      return res.status(400).json({ error: 'Der Umkreis muss 5, 10, 25, 50 oder 100 km sein' })
    }

    let center
    if (plz !== undefined && plz !== null && plz !== '') {
      const hit = lookupPlz(typeof plz === 'string' ? plz.trim() : '')
      if (!hit) return res.status(400).json({ error: 'Diese Postleitzahl kennen wir nicht' })
      center = { lat: hit.lat, lon: hit.lon, ort: hit.ort }
    } else {
      const roundedLat = roundCoord(Number(lat))
      const roundedLon = roundCoord(Number(lon))
      if (!validCoords(roundedLat, roundedLon)) {
        return res.status(400).json({ error: 'Ungültiger Standort' })
      }
      center = { lat: roundedLat, lon: roundedLon }
    }

    const { results, limited, attribution } = await searchPlaces(db, {
      lat: center.lat,
      lon: center.lon,
      radiusKm,
      isDemo: req.isDemo,
      homeId: req.homeId
    })

    res.json({ center, radius: radiusKm, results, limited, attribution })
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    next(err)
  }
})

module.exports = router
