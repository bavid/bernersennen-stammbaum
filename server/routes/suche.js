'use strict'

// Suche (/api/suche): POST / mit JSON-Body { q: <2–80 Zeichen>, gruppen?: ['tiere', 'erinnerungen', 'pinnwand',
// 'familien', 'partner'] } (ohne gruppen: alle) -> { gruppen: { <gruppe>: { treffer: [...], mehr } }, unvollstaendig? }.
// POST, damit der Suchbegriff nie in einer Adresse steht - und damit in keinem Zugriffsprotokoll (wie /api/discover die
// PLZ); jede andere Methode bekommt 405. Durchsucht nur, was die Identität ohnehin sehen darf (lib/searchAreas.js: eigenes
// Zuhause, Familien mit Mitgliedschaft, laufende Besuche nach Gast-Regeln; lib/search.js, mit Arbeitsbudget je Anfrage in
// lib/searchMatch.js). Partner wie in „Entdecken“: nur öffentlich sichtbare, Demo getrennt (routes/discover.js
// partnerDemoValues, nach der Identität). Tierheime und Partner-Bereiche: 404 (dort gibt es die Suche nicht).
// Lesend: requireSession wie routes/discover.js - die Schreibsperre der Demo (requireAuth) gilt nicht, die Admin-Ansicht
// lässt den Pfad durch (middleware/auth.js ADMIN_VIEW_READ_ONLY_POSTS), ein Gast darf suchen (lib/guestAccess.js), dann
// nur im eigenen Zuhause und beim Gastgeber. Die App speichert und protokolliert Suchbegriffe nicht; alle Antworten
// no-store. Nur aus der App selbst: eine Anfrage, die ein fremder Seitenaufruf auslöst (Sec-Fetch-Site: cross-site), 403.

const express = require('express')
const rateLimit = require('express-rate-limit')
const { requireSession } = require('../middleware/auth')
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
// Anschluss (IP, IPv6 auf /56), sonst könnte einer allen anderen die Suche sperren. Nach requireSession (braucht req.homeId).
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
const BAD_BODY = 'Unbekannte Angabe in der Suche'
const CROSS_SITE = 'Die Suche geht nur in Familie auf Pfoten selbst.'
const ONLY_POST = 'Die Suche nimmt den Suchbegriff nur im Body an (POST).'
const BODY_KEYS = new Set(['q', 'gruppen'])

function rejectCrossSite(req, res, next) {
  if (req.get('Sec-Fetch-Site') === 'cross-site') return res.status(403).json({ error: CROSS_SITE })
  next()
}

// ['tiere', 'partner'] -> dieselben Gruppen (doppelte einmal); fehlt -> alle; alles andere (kein Array, leer, unbekannte
// oder keine Texte) -> null.
function parseGroups(raw) {
  if (raw === undefined) return GROUPS
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > GROUPS.length) return null
  if (!raw.every((group) => typeof group === 'string' && GROUPS.includes(group))) return null
  return [...new Set(raw)]
}

// { query, groups } oder { error } - nur ein Objekt mit q und optional gruppen, sonst nichts.
function readSearchBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: BAD_QUERY }
  if (Object.keys(body).some((key) => !BODY_KEYS.has(key))) return { error: BAD_BODY }
  const query = cleanQuery(body.q)
  if (!query) return { error: BAD_QUERY }
  const groups = parseGroups(body.gruppen)
  if (!groups) return { error: BAD_GROUPS }
  return { query, groups }
}

router.post('/', rejectCrossSite, requireSession, searchLimiter, (req, res) => {
  const scope = searchScopeOf(req)
  if (!scope) return res.status(404).json({ error: NOT_HERE })
  const { error, query, groups } = readSearchBody(req.body)
  if (error) return res.status(400).json({ error })
  const partnerDemo = partnerDemoValues(scope.isDemo)
  const result = runSearch({ query, groups, areas: scope.areas, activeId: req.familyId, partnerDemo })
  sendJsonWithoutEtag(res, 200, result)
})

// Kein GET mit ?q= (und keine andere Methode): der Suchbegriff gehört nicht in die Adresse.
router.all('/', (req, res) => {
  res.set('Allow', 'POST')
  res.status(405).json({ error: ONLY_POST })
})

module.exports = router
