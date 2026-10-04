'use strict'

// Suche (/api/suche): GET /?q=<2–80 Zeichen>&gruppen=tiere,erinnerungen,pinnwand,familien,partner (ohne gruppen: alle)
// -> { gruppen: { <gruppe>: { treffer: [...], mehr } }, unvollstaendig? }. Durchsucht nur, was die Identität ohnehin
// sehen darf (lib/searchAreas.js: eigenes Zuhause, Familien mit Mitgliedschaft, laufende Besuche nach Gast-Regeln;
// lib/search.js, mit Arbeitsbudget je Anfrage in lib/searchMatch.js). Partner wie in „Entdecken“: nur öffentlich
// sichtbare, Demo getrennt (routes/discover.js partnerDemoValues, nach der Identität). Tierheime und Partner-Bereiche: 404
// (dort gibt es die Suche nicht). Ein Gast (Besuchs-Sitzung) darf suchen (lib/guestAccess.js), dann nur im eigenen
// Zuhause und beim Gastgeber. Die App speichert und protokolliert Suchbegriffe nicht; alle Antworten no-store.
// Nur aus der App selbst: eine Anfrage, die ein fremder Seitenaufruf auslöst (Sec-Fetch-Site: cross-site), bekommt 403.

const express = require('express')
const rateLimit = require('express-rate-limit')
const { requireAuth } = require('../middleware/auth')
const { noStore, sendJsonWithoutEtag } = require('../lib/noStoreResponse')
const { ipKeyGenerator } = require('../lib/rateLimitKey')
const { cleanQuery, MIN_QUERY_LENGTH, MAX_QUERY_LENGTH } = require('../lib/searchText')
const { searchScopeOf } = require('../lib/searchAreas')
const { runSearch, GROUPS } = require('../lib/search')
const { partnerDemoValues } = require('./discover')

const router = express.Router()
router.use(noStore)

// Je Identität (nicht je Bereich - ein Wechsel des Bereichs bringt kein neues Budget): die Suche während des Tippens
// schickt nach 250 ms Pause eine Anfrage, 60 je Minute reichen dafür bequem. Die Demo teilen sich alle Besucher - dort je
// Anschluss (IP, IPv6 auf /56), sonst könnte einer allen anderen die Suche sperren. Nach requireAuth (braucht req.homeId).
const ONE_MINUTE = 60 * 1000
const SEARCH_RATE_LIMIT = 60
const searchLimitKey = (req) => (req.isDemo ? `suche-demo-${ipKeyGenerator(req)}` : `suche-${req.homeId}`)
const searchLimiter = rateLimit({
  windowMs: ONE_MINUTE,
  limit: SEARCH_RATE_LIMIT,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: searchLimitKey,
  message: { error: 'Sehr viele Suchen in kurzer Zeit – bitte einen Moment warten.' }
})

const NOT_HERE = 'Die Suche gibt es für Zuhause und Familien.'
const BAD_QUERY = `Bitte ${MIN_QUERY_LENGTH} bis ${MAX_QUERY_LENGTH} Zeichen eingeben.`
const BAD_GROUPS = 'Unbekannte Gruppe'
const CROSS_SITE = 'Die Suche geht nur in Familie auf Pfoten selbst.'

function rejectCrossSite(req, res, next) {
  if (req.get('Sec-Fetch-Site') === 'cross-site') return res.status(403).json({ error: CROSS_SITE })
  next()
}

// "tiere,partner" -> ['tiere', 'partner']; fehlt/leer -> alle; alles andere (Liste als Array, unbekannte Gruppe) -> null.
function parseGroups(raw) {
  if (raw === undefined || raw === '') return GROUPS
  if (typeof raw !== 'string') return null
  const groups = [...new Set(raw.split(',').map((part) => part.trim()))]
  return groups.every((group) => GROUPS.includes(group)) ? groups : null
}

router.get('/', rejectCrossSite, requireAuth, searchLimiter, (req, res) => {
  const scope = searchScopeOf(req)
  if (!scope) return res.status(404).json({ error: NOT_HERE })
  const query = cleanQuery(req.query.q)
  if (!query) return res.status(400).json({ error: BAD_QUERY })
  const groups = parseGroups(req.query.gruppen)
  if (!groups) return res.status(400).json({ error: BAD_GROUPS })
  const partnerDemo = partnerDemoValues(scope.isDemo)
  const result = runSearch({ query, groups, areas: scope.areas, activeId: req.familyId, partnerDemo })
  sendJsonWithoutEtag(res, 200, result)
})

module.exports = router
