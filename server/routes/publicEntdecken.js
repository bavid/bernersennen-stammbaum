'use strict'

const express = require('express')
const rateLimit = require('express-rate-limit')
const config = require('../config')
const { optionalSession } = require('../middleware/auth')
const { ipKeyGenerator } = require('../lib/rateLimitKey')
const { parseEntdecken, buildPublicEntdecken } = require('../lib/publicEntdecken')
const { demoAllowed } = require('./partners')

// Öffentliches „Entdecken“ (lib/publicEntdecken.js), eingehängt unter /api/public/entdecken (app.js):
// - GET  /?q=&typ=&seite=&demo=      ohne Ort - darf kurz im Browser zwischengespeichert werden (privat, 60 s).
// - POST / { q, typ, plz, radius, seite }  mit Ort - die PLZ steht im Body, nie in der URL (wie POST
//   /api/public/partners/near, Finding 9: URLs landen leicht in Zugriffslogs); Antwort no-store.
// Eigenes Limit je IP (config.entdeckenRateLimit je 5 Minuten) zusätzlich zum globalen apiLimiter. Kein Tracking: es wird
// weder die Suche noch die PLZ gespeichert oder geloggt.
const FIVE_MINUTES = 5 * 60 * 1000
const CACHE_GET = 'private, max-age=60'

function createPublicEntdeckenRouter({ limit = config.entdeckenRateLimit } = {}) {
  const router = express.Router()
  const limiter = rateLimit({
    windowMs: FIVE_MINUTES,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: ipKeyGenerator,
    message: { error: 'Zu viele Anfragen in kurzer Zeit – bitte einen Moment warten.' }
  })

  // Demo-Regel wie die Partnerliste: req.isDemo einer angemeldeten Demo-Sitzung, sonst ?demo=1 bzw. dev/staging.
  router.use(limiter, optionalSession)

  function answer(req, res, next, input, cache) {
    try {
      const suche = parseEntdecken(input)
      res.set('Cache-Control', cache)
      res.set('Vary', 'Cookie')
      res.json(buildPublicEntdecken(suche, { demoAllowed: demoAllowed(req) }))
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message })
      next(err)
    }
  }

  router.get('/', (req, res, next) => {
    // Eine PLZ in der URL wird bewusst nicht ausgewertet - der Ort gehört in den Body (POST).
    const { q, typ, seite } = req.query
    answer(req, res, next, { q, typ, seite }, CACHE_GET)
  })

  router.post('/', (req, res, next) => {
    const { q, typ, seite, plz, radius } = req.body || {}
    answer(req, res, next, { q, typ, seite, plz, radius }, 'no-store')
  })

  return router
}

module.exports = createPublicEntdeckenRouter()
module.exports.createPublicEntdeckenRouter = createPublicEntdeckenRouter
