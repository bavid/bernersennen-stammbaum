'use strict'

const express = require('express')
const { publicFinanzierung } = require('../lib/finanzierung')
const { liveStand, openStream } = require('../lib/spendenLive')

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

// „Spenden live“ (lib/spendenLive.js): der Stand als JSON - kurz cachebar (30 s), der Client fragt ohne Live-Strom alle
// 60 s nach - und der Live-Strom (Server-Sent Events, höchstens MAX_STREAMS gleichzeitig, sonst 503 und der Client
// bleibt beim Nachfragen).
const LIVE_CACHE = 'public, max-age=30'

router.get('/live', (req, res) => {
  const payload = liveStand()
  res.setHeader('Cache-Control', LIVE_CACHE)
  res.json(payload)
})

router.get('/live/stream', (req, res) => {
  if (!openStream(req, res)) {
    res.setHeader('Cache-Control', 'no-store')
    res.status(503).json({ error: 'Gerade zu viele Verbindungen - die Seite fragt einfach regelmäßig nach.' })
  }
})

module.exports = router
