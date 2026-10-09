'use strict'

const express = require('express')
const { requireAuth, requireSession } = require('../middleware/auth')
const { isEnabled, publicKey, saveAbo, deleteAbo, countAbos } = require('../lib/push')

// Benachrichtigungen aufs Handy (Web Push, Einstellungen › App) - /api/push. Alles bezieht sich auf die Identität der
// Sitzung (req.homeId): ein Abo gehört dem Zuhause, egal in welchem Bereich gerade jemand unterwegs ist. requireAuth
// sperrt die Demo fürs Schreiben (403); den öffentlichen Schlüssel darf auch sie lesen. Nie cachen (no-store).
const router = express.Router()
const NO_STORE = 'private, no-store'

function sendError(err, res, next) {
  if (err.status) return res.status(err.status).json({ error: err.message })
  next(err)
}

// { enabled, publicKey, geraete } - geraete: wie viele Abos dieses Zuhause schon hat.
router.get('/key', requireSession, (req, res) => {
  res.setHeader('Cache-Control', NO_STORE)
  res.json({ enabled: isEnabled(), publicKey: publicKey(), geraete: countAbos(req.homeId) })
})

// { subscription: PushSubscription.toJSON() } -> 201 { ok: true }
router.post('/abo', requireAuth, (req, res, next) => {
  res.setHeader('Cache-Control', NO_STORE)
  if (!isEnabled()) return res.status(503).json({ error: 'Benachrichtigungen sind auf diesem Server nicht eingerichtet' })
  try {
    saveAbo(req.homeId, req.body?.subscription)
    res.status(201).json({ ok: true })
  } catch (err) {
    sendError(err, res, next)
  }
})

// { endpoint } -> 204: genau dieses Gerät (Ausschalten, „Unsere Einstellungen zurücksetzen“) - die anderen Geräte des
// Zuhauses behalten ihre Benachrichtigungen.
router.delete('/abo', requireAuth, (req, res) => {
  res.setHeader('Cache-Control', NO_STORE)
  const endpoint = req.body?.endpoint
  if (typeof endpoint !== 'string' || endpoint.length === 0) return res.status(400).json({ error: 'Welches Gerät? (endpoint fehlt)' })
  if (!deleteAbo(req.homeId, endpoint)) return res.status(404).json({ error: 'Dieses Abo gibt es nicht' })
  res.status(204).end()
})

module.exports = router
