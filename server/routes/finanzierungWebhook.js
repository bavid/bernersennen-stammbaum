'use strict'

const express = require('express')
const { QUELLEN, SIGNATUR_HEADER, webhookSecret, signaturGueltig, verarbeiteWebhook } = require('../lib/spendenWebhook')
const { meldeSpendenAenderung } = require('../lib/spendenLive')

// „Spenden live“: vorbereiteter Webhook POST /api/finanzierung/webhook/:quelle (lib/spendenWebhook.js). In app.js VOR
// express.json eingehängt, weil die Signatur über den rohen Body geht. Ohne SPENDEN_WEBHOOK_SECRET 404 (der Weg gibt es
// dann nicht), mit falscher Signatur 401. Antworten tragen nur { id, doppelt } - nie Inhalte.
const router = express.Router()

const MAX_BODY = '16kb'
const NOT_FOUND = { error: 'Nicht gefunden' }

router.post('/:quelle', express.raw({ type: () => true, limit: MAX_BODY }), (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  const secret = webhookSecret()
  if (!secret || !QUELLEN.includes(req.params.quelle)) return res.status(404).json(NOT_FOUND)
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
  if (!signaturGueltig(secret, rawBody, req.get(SIGNATUR_HEADER))) return res.status(401).json({ error: 'Signatur ungültig' })
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
