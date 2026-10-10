'use strict'

const express = require('express')
const db = require('../db')
const { requireAuth } = require('../middleware/auth')
const { ART } = require('../lib/areaArt')
const { countOpenRequests } = require('../lib/erlebtMit')
const { countNewGuests } = require('../lib/visits')
const { greetingsFor, countNewGreetings, markGreetingsSeen } = require('../lib/gruesse')
const { countOpenIncoming: countOpenWishes } = require('../lib/wwhKontakt')

// Hinweis-Glocke (client/src/components/hinweise): Grüße zu eigenen Erinnerungen und „gesehen“ - unter /api/hinweise neben
// dem öffentlichen Band (routes/hinweise.js, GET /). Darum die Prüfungen je Route, nicht router.use: das Band bleibt ohne
// Login. Nur für die Identität der Sitzung als Zuhause und aus dem eigenen Zuhause heraus (wie routes/erlebtMit.js);
// requireAuth sperrt die Demo fürs Schreiben (POST /gelesen -> 403).
// zahlen: was die Glocke zählt - offene „Mit dabei“-Anfragen, neue Gäste, neue Grüße, offene „Wir waren hier“-
// Kontaktwünsche (dieselben Zahlen wie /me).
const router = express.Router()

const findArt = db.prepare('SELECT art FROM families WHERE id = ?')
const NO_STORE = 'private, no-store'

function requireOwnHome(req, res, next) {
  if (req.familyId !== req.homeId || findArt.get(req.homeId)?.art !== ART.zuhause) {
    return res.status(400).json({ error: 'Nur aus „Mein Zuhause“ heraus möglich' })
  }
  res.setHeader('Cache-Control', NO_STORE)
  next()
}

function zahlenFor(homeId) {
  return {
    anfragen: countOpenRequests(homeId),
    gaeste: countNewGuests(homeId),
    gruesse: countNewGreetings(homeId),
    kontakte: countOpenWishes(homeId)
  }
}

// { gruesse: [{ id, entryId, dogId, titel, von, createdAt, neu }], zahlen }
router.get('/gruesse', requireAuth, requireOwnHome, (req, res) => {
  res.json({ gruesse: greetingsFor(req.homeId), zahlen: zahlenFor(req.homeId) })
})

// Alles bis jetzt gilt als gesehen. Der Body wird bewusst nicht gelesen - den Zeitpunkt setzt der Server. -> { zahlen }
router.post('/gelesen', requireAuth, requireOwnHome, (req, res) => {
  markGreetingsSeen(req.homeId)
  res.json({ zahlen: zahlenFor(req.homeId) })
})

module.exports = router
