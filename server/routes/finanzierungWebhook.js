'use strict'

const express = require('express')
const rateLimit = require('express-rate-limit')
const { WEBHOOK_QUELLEN, SIGNATUR_HEADER, ZEIT_HEADER, webhookSecret, signaturGueltig, verarbeiteWebhook } = require('../lib/spendenWebhook')
const { meldeSpendenAenderung } = require('../lib/spendenLive')
const { ipKeyGenerator } = require('../lib/rateLimitKey')

// „Spenden live“: vorbereiteter Webhook POST /api/finanzierung/webhook/:quelle (lib/spendenWebhook.js). In app.js VOR
// express.json (und vor apiLimiter) eingehängt, weil die Signatur über den rohen Body geht - darum hier ein eigenes
// IP-Limit. Reihenfolge: Limit -> Secret/Quelle (ohne Secret oder fremde Quelle immer 404, auch bei großem Body, der
// dann gar nicht gelesen wird) -> Body lesen -> Zeit + Signatur (sonst 401). Antworten tragen nur { id, doppelt }.
const router = express.Router()

const MAX_BODY = '16kb'
const NOT_FOUND = { error: 'Nicht gefunden' }
const WEBHOOK_WINDOW_MS = 60 * 1000
const WEBHOOK_LIMIT = 60

const webhookLimiter = rateLimit({
  windowMs: WEBHOOK_WINDOW_MS,
  limit: WEBHOOK_LIMIT,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator,
  message: { error: 'Zu viele Anfragen.' }
})

function nurAktiveQuelle(req, res, next) {
  res.setHeader('Cache-Control', 'no-store')
  if (!webhookSecret() || !WEBHOOK_QUELLEN.includes(req.params.quelle)) return res.status(404).json(NOT_FOUND)
  next()
}

router.post('/:quelle', webhookLimiter, nurAktiveQuelle, express.raw({ type: () => true, limit: MAX_BODY }), (req, res, next) => {
  const secret = webhookSecret()
  if (!secret) return res.status(404).json(NOT_FOUND)
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
  if (!signaturGueltig(secret, rawBody, req.get(SIGNATUR_HEADER), req.get(ZEIT_HEADER))) {
    return res.status(401).json({ error: 'Signatur ungültig' })
  }
  try {
    const { status, spende, doppelt } = verarbeiteWebhook(req.params.quelle, rawBody)
    if (!doppelt) meldeSpendenAenderung()
    res.status(status).json({ id: spende.id, doppelt })
  } catch (err) {
    if (!err.status) return next(err)
    res.status(err.status).json(err.feld ? { error: err.message, feld: err.feld } : { error: err.message })
  }
})

module.exports = router
