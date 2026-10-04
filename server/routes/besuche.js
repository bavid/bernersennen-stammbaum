'use strict'

const express = require('express')
const db = require('../db')
const { requireAuth, refreshSession } = require('../middleware/auth')
const { codeLimiter } = require('../middleware/abuse')
const { buildMe } = require('../lib/context')
const { formatCode } = require('../lib/codes')
const { cleanId } = require('../lib/validate')
const { ART } = require('../lib/areaArt')
const { visitsOf, guestsOf, endVisit, acknowledgeGuest } = require('../lib/visits')
const { createVisitInvite, redeemVisitInvite, VISIT_INVITE_DAYS } = require('../lib/visitInvites')

// Phase V2: Zuhause besuchen (/api/besuche). Alles bezieht sich auf die Identität der Sitzung (req.homeId) und nur,
// wenn sie ein Zuhause ist - nie auf einen fremden Bereich. Einladen und Einlösen nur aus dem eigenen Zuhause
// heraus (aktiver Bereich = Identität), Beenden auch während des Besuchs selbst. requireAuth sperrt die Demo für
// alles außer GET.
const router = express.Router()

const ONLY_HOME_MESSAGE = 'Nur aus „Mein Zuhause“ heraus möglich'
const NO_SUCH_VISIT_MESSAGE = 'Diesen Besuch gibt es nicht'

const findArt = db.prepare('SELECT art FROM families WHERE id = ?')

function isHomeIdentity(req) {
  return findArt.get(req.homeId)?.art === ART.zuhause
}

// Einladen/Einlösen: die Identität ist ein Zuhause UND gerade selbst aktiv (nicht ein Rudel oder ein Besuch).
function requireOwnHome(req, res, next) {
  if (!isHomeIdentity(req) || req.familyId !== req.homeId) return res.status(400).json({ error: ONLY_HOME_MESSAGE })
  next()
}

function sendError(err, res, next) {
  if (err.status) return res.status(err.status).json({ error: err.message })
  next(err)
}

// { besuche: wo ich zu Besuch bin, gaeste: wer bei mir zu Gast ist } - jeweils [{ id, name, seit }].
router.get('/', requireAuth, (req, res) => {
  if (!isHomeIdentity(req)) return res.json({ besuche: [], gaeste: [] })
  res.json({ besuche: visitsOf(req.homeId), gaeste: guestsOf(req.homeId) })
})

// "Jemanden in mein Zuhause einladen": ein neuer Code, 7 Tage gültig, einmal einlösbar. Der Code steht nur in
// dieser Antwort und (solange offen) in GET /api/vouchers/mine.
router.post('/einladungen', requireAuth, requireOwnHome, (req, res, next) => {
  try {
    const invite = createVisitInvite(db, req.homeId)
    res.status(201).json({
      id: invite.voucherId,
      code: formatCode(invite.code),
      expires_at: invite.expiresAt,
      gueltigTage: VISIT_INVITE_DAYS
    })
  } catch (err) {
    sendError(err, res, next)
  }
})

// "Ein anderes Zuhause besuchen": Code einlösen -> Besuch beim Gastgeber. Codes nie in Logs: POST mit codeLimiter.
router.post('/einloesen', requireAuth, codeLimiter, requireOwnHome, (req, res, next) => {
  try {
    const { host } = redeemVisitInvite(db, { code: req.body?.code, guestId: req.homeId })
    res.status(201).json({ gastgeber: host, me: buildMe(req.homeId, req.familyId, req.isDemo, req.userId) })
  } catch (err) {
    sendError(err, res, next)
  }
})

// Eigenen Besuch beenden (ich bin Gast bei :hostId) - auch mitten im Besuch: dann geht es zurück nach Hause.
router.delete('/bei/:hostId', requireAuth, (req, res) => {
  const hostId = cleanId(req.params.hostId)
  if (!Number.isInteger(hostId) || !endVisit(req.homeId, hostId)) return res.status(404).json({ error: NO_SUCH_VISIT_MESSAGE })
  const activeId = req.familyId === hostId ? req.homeId : req.familyId
  if (activeId !== req.familyId) refreshSession(req, res, activeId)
  res.json(buildMe(req.homeId, activeId, req.isDemo, req.userId))
})

// „Passt“ (security-review V2, M-3): den Hinweis „Neu zu Besuch“ für einen Gast quittieren - nur im eigenen Zuhause.
router.post('/gaeste/:guestId/passt', requireAuth, requireOwnHome, (req, res) => {
  const guestId = cleanId(req.params.guestId)
  if (!Number.isInteger(guestId) || !acknowledgeGuest(guestId, req.homeId)) {
    return res.status(404).json({ error: 'Diesen neuen Gast gibt es nicht' })
  }
  res.json(buildMe(req.homeId, req.familyId, req.isDemo, req.userId))
})

// Einen Gast aus dem eigenen Zuhause entfernen (:guestId ist bei mir zu Gast).
router.delete('/gaeste/:guestId', requireAuth, (req, res) => {
  const guestId = cleanId(req.params.guestId)
  if (!Number.isInteger(guestId) || !endVisit(guestId, req.homeId)) return res.status(404).json({ error: NO_SUCH_VISIT_MESSAGE })
  res.status(204).end()
})

module.exports = router
