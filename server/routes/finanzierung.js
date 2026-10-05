'use strict'

const express = require('express')
const { publicFinanzierung } = require('../lib/finanzierung')

// Phase F: GET /api/finanzierung - was die öffentliche Seite „So finanzieren wir uns“ (/finanzierung) zeigt: Spenden-
// Hinweis, aktuelles Ziel und die Quartale, die der Admin eingetragen hat (lib/finanzierung.js publicFinanzierung). Ohne
// Login, für alle gleich, darum cachebar (fünf Minuten - eine Änderung des Admins braucht höchstens so lange).
const router = express.Router()

const PUBLIC_CACHE = 'public, max-age=300'

// Erst die Antwort bauen, dann den Cache-Header setzen - ein Fehler beim Lesen darf nie als cachebare Antwort rausgehen.
router.get('/', (req, res) => {
  const payload = publicFinanzierung()
  res.setHeader('Cache-Control', PUBLIC_CACHE)
  res.json(payload)
})

module.exports = router
