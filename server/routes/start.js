'use strict'

// Start (/api/start, Phase W Schritt 3 „Ein Start für alles“): GET /?limit=1–20&vor=<Cursor> -> { items, termine, notizen,
// next } - Neues aus dem eigenen Zuhause, den Familien des Haushalts und den befreundeten Zuhause (lib/startFeed.js, die
// Bereiche aus lib/searchAreas.js homeAreasOf). Nimmt bewusst KEINEN Bereich entgegen: welche Bereiche zählen, folgt allein
// aus der Identität der Sitzung - jede andere Angabe (auch familyId/in) -> 400.
// Nur im eigenen Zuhause (aktiver Bereich = Identität, sonst 400): in einer Familie zeigt deren Gruppenseite das Neue. Eine
// Besuchs-Sitzung kommt gar nicht bis hier (nicht in lib/guestAccess.js -> 403), Tierheime und Partner-Bereiche 404.
// requireAuth: die Demo liest (GET), die Admin-Ansicht ebenso. Persönliche Daten -> jede Antwort no-store.

const express = require('express')
const { requireAuth } = require('../middleware/auth')
const { noStore } = require('../lib/noStoreResponse')
const { homeAreasOf } = require('../lib/searchAreas')
const { startFeed, parseCursor, DEFAULT_LIMIT, MAX_LIMIT } = require('../lib/startFeed')

const router = express.Router()
router.use(noStore)

const QUERY_KEYS = new Set(['limit', 'vor'])
const LIMIT_RE = /^[1-9]\d{0,2}$/

const ONLY_AT_HOME = 'Start gibt es nur im eigenen Zuhause.'
const NOT_HERE = 'Start gibt es für Zuhause und Familien.'
const BAD_QUERY = 'Unbekannte Angabe für Start'
const BAD_LIMIT = `limit muss zwischen 1 und ${MAX_LIMIT} liegen`
const BAD_CURSOR = 'vor ist ungültig'

// { limit, cursor } oder { error } - nur limit und vor, jeweils höchstens einmal.
function readQuery(query) {
  if (Object.keys(query).some((key) => !QUERY_KEYS.has(key))) return { error: BAD_QUERY }
  let limit = DEFAULT_LIMIT
  if (query.limit !== undefined) {
    if (typeof query.limit !== 'string' || !LIMIT_RE.test(query.limit) || Number(query.limit) > MAX_LIMIT) return { error: BAD_LIMIT }
    limit = Number(query.limit)
  }
  let cursor = null
  if (query.vor !== undefined) {
    cursor = parseCursor(query.vor)
    if (!cursor) return { error: BAD_CURSOR }
  }
  return { limit, cursor }
}

router.get('/', requireAuth, (req, res) => {
  if (req.familyId !== req.homeId) return res.status(400).json({ error: ONLY_AT_HOME })
  const areas = homeAreasOf(req.homeId)
  if (!areas) return res.status(404).json({ error: NOT_HERE })
  const { error, limit, cursor } = readQuery(req.query)
  if (error) return res.status(400).json({ error })
  res.json(startFeed({ areas, homeId: req.homeId, limit, cursor }))
})

module.exports = router
