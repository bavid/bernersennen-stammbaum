'use strict'

const express = require('express')
const rateLimit = require('express-rate-limit')
const db = require('../db')
const { requireAuth } = require('../middleware/auth')
const { noStore } = require('../lib/noStoreResponse')
const { ipKeyGenerator } = require('../lib/rateLimitKey')
const { cleanId } = require('../lib/validate')
const { ART } = require('../lib/areaArt')
const { setZeigeMich, withdrawCheckin, checkinsOfHome, ONLY_HOME_MESSAGE } = require('../lib/wirWarenHier')
const { checkInAndNotify, pinEntry, unpinEntry } = require('../lib/wwhPins')
const { ortViewForHome } = require('../lib/wwhOrtView')

// „Wir waren hier“ für Familien (docs/superpowers/plans/2026-10-10-wir-waren-hier.md, Aufgabe 3), Mount
// /api/wir-waren-hier. Alles nur aus dem eigenen, gerade aktiven Zuhause (requireOwnHome, Muster routes/besuche.js).
// requireAuth sperrt Demo-Schreibzugriffe (403); eine Besuchs-Sitzung kommt nie bis hierher (lib/guestAccess.js, 403).
// Jede Id geht durch cleanId und wird im SQL gegen das Zuhause geprüft - Fremdes ist 404. Antworten tragen no-store
// (sie nennen Tiere anderer Familien). Schreibende Anfragen zusätzlich mit eigenem IP-Limiter (Muster routes/anfragen.js).
// Kontaktwünsche (/kontakt...) kommen in Aufgabe 4.
const router = express.Router()
router.use(noStore)

const FIFTEEN_MINUTES = 15 * 60 * 1000
const DEFAULT_WRITE_LIMIT = 60

const wwhWriteLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: Number(process.env.WWH_RATE_LIMIT) || DEFAULT_WRITE_LIMIT,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator,
  message: { error: 'Zu viele Änderungen in kurzer Zeit – bitte später noch einmal versuchen.' }
})

const findArt = db.prepare('SELECT art FROM families WHERE id = ?')

function requireOwnHome(req, res, next) {
  const isHome = findArt.get(req.homeId)?.art === ART.zuhause
  if (!isHome || req.familyId !== req.homeId) return res.status(400).json({ error: ONLY_HOME_MESSAGE })
  next()
}

const reads = [requireAuth, requireOwnHome]
const writes = [requireAuth, requireOwnHome, wwhWriteLimiter]

// Ids im Body: nur ganze Zahlen oder Ziffernfolgen (kein true -> 1, kein "1e3"); alles andere wird NaN -> 404.
function bodyId(value) {
  if (typeof value === 'number' || (typeof value === 'string' && /^\d{1,15}$/.test(value))) return cleanId(value)
  return Number.NaN
}

function sendError(err, res, next) {
  if (err.status) return res.status(err.status).json({ error: err.message })
  next(err)
}

// Wrapper: Fehler mit status als JSON, sonst an den Fehler-Handler.
function handle(fn) {
  return (req, res, next) => {
    try {
      fn(req, res)
    } catch (err) {
      sendError(err, res, next)
    }
  }
}

// Die Anmeldungen des Zuhauses (für den Block „Orte, an denen wir waren“).
router.get('/checkins', ...reads, (req, res) => {
  res.json(checkinsOfHome(req.homeId))
})

// Ortsansicht: { ort, eigene, andere } (lib/wwhOrtView.js).
router.get(
  '/partner/:partnerId',
  ...reads,
  handle((req, res) => res.json(ortViewForHome(req.homeId, cleanId(req.params.partnerId))))
)

// Anmelden { partnerId, dogId } - Status 'offen', der Ort wird benachrichtigt (lib/wwhPins.js checkInAndNotify).
router.post(
  '/checkins',
  ...writes,
  handle((req, res) => {
    const input = { partnerId: bodyId(req.body?.partnerId), dogId: bodyId(req.body?.dogId) }
    res.status(201).json(checkInAndNotify(req.homeId, input))
  })
)

// „Hier zeigen“ an/aus { zeigeMich: true|false } - strikt Boolean (lib/wirWarenHier.js setZeigeMich, sonst 400).
router.put(
  '/checkins/:id',
  ...writes,
  handle((req, res) => res.json(setZeigeMich(req.homeId, cleanId(req.params.id), req.body?.zeigeMich)))
)

// Rückzug: Anmeldung samt Anheftungen und offenen Wünschen weg.
router.delete(
  '/checkins/:id',
  ...writes,
  handle((req, res) => {
    withdrawCheckin(req.homeId, cleanId(req.params.id))
    res.status(204).end()
  })
)

// Eine eigene, nicht private Erinnerung des angemeldeten Tiers anheften { entryId } - der Ort gibt frei.
router.post(
  '/checkins/:id/erinnerungen',
  ...writes,
  handle((req, res) => res.status(201).json(pinEntry(req.homeId, cleanId(req.params.id), bodyId(req.body?.entryId))))
)

router.delete(
  '/checkins/:id/erinnerungen/:pinId',
  ...writes,
  handle((req, res) => {
    unpinEntry(req.homeId, cleanId(req.params.id), cleanId(req.params.pinId))
    res.status(204).end()
  })
)

module.exports = router
