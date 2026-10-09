'use strict'

const express = require('express')
const { readCommunity } = require('../lib/community')

// Laufband der Startseite: GET /api/community - Zahlen aus der Gemeinschaft (lib/community.js readCommunity: nur Summen
// ohne Demo-Daten und bis zu drei vorgestellte Partner mit slug, name, typ). Ohne Login, für alle gleich, darum cachebar
// (zehn Minuten im Browser, fünf im Prozess).
const router = express.Router()

const PUBLIC_CACHE = 'public, max-age=600'

// Erst die Antwort bauen, dann den Cache-Header setzen - ein Fehler beim Lesen darf nie als cachebare Antwort rausgehen.
router.get('/', (req, res) => {
  const payload = readCommunity()
  res.setHeader('Cache-Control', PUBLIC_CACHE)
  res.json(payload)
})

module.exports = router
