'use strict'

// Phase M „Mein Revier“ (lib/revier.js, docs/superpowers/plans/2026-10-11-phase-m-revier.md) unter /api/revier.
// - Jede Antwort: Cache-Control no-store und X-Robots-Tag noindex. Instanz „rudel“: 404 wie ein unbekannter Pfad.
// - Nur angemeldet und nur mit eigenem Zuhause als Identität (Partner, Tierheime, klassische Familien-Logins: 403);
//   Besuchs-Sitzungen lehnt schon requireSession ab (lib/guestAccess.js). Demo und Admin-Ansicht lesen mit, schreiben nie
//   (denyDemoWrites hier, denyAdminViewWrites global - POST /radar ist dort als lesend eingetragen).
// - Einstellungen: der aktive Bereich (Zuhause oder Familie), nur dessen Leitung.
// - Limits je Zuhause: Radar und Folgen/Ausblenden eigene Fenster, Einstellungen das allgemeine Schreib-Limit.

const express = require('express')
const path = require('node:path')
const fs = require('node:fs')
const rateLimit = require('express-rate-limit')
const db = require('../db')
const { uploadDir } = require('../config')
const { requireSession, denyDemoWrites } = require('../middleware/auth')
const { limitWrites } = require('../middleware/abuse')
const { noStore } = require('../lib/noStoreResponse')
const { isRudelInstanz } = require('../lib/instanzModus')
const { roleOf } = require('../lib/roles')
const { cleanId } = require('../lib/validate')
const revier = require('../lib/revier')

const router = express.Router()

const TEN_MINUTES = 10 * 60 * 1000
const RADAR_LIMIT = Number(process.env.REVIER_RADAR_LIMIT) || 60
const FOLGEN_LIMIT = Number(process.env.REVIER_FOLGEN_LIMIT) || 30
const ONLY_HOME = 'Mein Revier gibt es nur für ein eigenes Zuhause.'
const ONLY_LEITUNG = 'Das öffentliche Profil stellt nur die Leitung ein.'
const CONTENT_TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

const homeLimiter = (limit) =>
  rateLimit({
    windowMs: TEN_MINUTES,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => `revier-${req.homeId}`,
    message: { error: 'Zu viele Anfragen in kurzer Zeit – bitte einen Moment warten.' }
  })
const radarLimiter = homeLimiter(RADAR_LIMIT)
const folgenLimiter = homeLimiter(FOLGEN_LIMIT)

const homeArtStmt = db.prepare('SELECT art FROM families WHERE id = ?')

router.use((req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex')
  if (isRudelInstanz()) return res.status(404).json({ error: 'Nicht gefunden' })
  next()
})
router.use(noStore)
router.use(requireSession)
router.use((req, res, next) => {
  if (homeArtStmt.get(req.homeId)?.art !== 'zuhause') return res.status(403).json({ error: ONLY_HOME })
  next()
})

const viewerOf = (req) => ({ homeId: req.homeId, isDemo: req.isDemo })

// Profil-Bereich = aktiver Bereich (Zuhause oder Familie) - nur dessen Leitung.
function requireOwner(req, res, next) {
  const art = homeArtStmt.get(req.familyId)?.art
  if (!revier.PROFIL_ARTS.includes(art) || req.isGuest) return res.status(403).json({ error: ONLY_HOME })
  if (roleOf(req.homeId, req.familyId) !== 'leitung') return res.status(403).json({ error: ONLY_LEITUNG })
  next()
}

// Fachliche Fehler (status gesetzt) als JSON, alles andere an den Fehler-Handler.
const handle = (fn, status = 200) => (req, res, next) => {
  try {
    const result = fn(req)
    if (result === undefined) return res.status(204).end()
    res.status(status).json(result)
  } catch (err) {
    if (!err.status) return next(err)
    res.status(err.status).json({ error: err.message, ...(err.code ? { code: err.code } : {}) })
  }
}

const vorParam = (req) => {
  const vor = cleanId(req.query.vor)
  return Number.isNaN(vor) ? null : vor
}

const ownerWrite = [denyDemoWrites, limitWrites, requireOwner]

router.get('/einstellungen', requireOwner, handle((req) => revier.einstellungenOf(req.familyId)))
router.put('/einstellungen', ...ownerWrite, handle((req) => revier.saveEinstellungen(req.familyId, req.body || {})))
router.put('/tiere', ...ownerWrite, handle((req) => revier.saveTiere(req.familyId, req.body?.ids)))
router.get('/eintraege', requireOwner, handle((req) => ({ ids: revier.markedEintraege(req.familyId) })))
router.put(
  '/eintraege/:id',
  ...ownerWrite,
  handle((req) => revier.setEintragOeffentlich(req.familyId, cleanId(req.params.id) || 0, Boolean(req.body?.oeffentlich)))
)
router.get('/vorschau', requireOwner, handle((req) => revier.vorschau(viewerOf(req), req.familyId)))
router.get('/follower', requireOwner, handle((req) => revier.eigeneFollower(req.familyId)))
router.delete(
  '/follower/:id',
  ...ownerWrite,
  handle((req) => {
    revier.removeFollower(req.familyId, cleanId(req.params.id) || 0)
  })
)

// Radar: PLZ nur im Body (nie in einer Adresse), sonst die des eigenen Profils.
router.post(
  '/radar',
  radarLimiter,
  handle((req) => revier.radar(viewerOf(req), { plz: req.body?.plz, umkreis: req.body?.umkreis, tierart: req.body?.tierart || null }))
)
router.get('/feed', handle((req) => revier.feed(viewerOf(req), { vor: vorParam(req) })))
router.get('/folge', handle((req) => revier.folgeIch(viewerOf(req))))
router.get('/ausgeblendet', handle((req) => revier.ausgeblendete(viewerOf(req))))
router.get('/p/:slug', handle((req) => revier.profilBySlug(viewerOf(req), req.params.slug, { vor: vorParam(req) })))

const folgenWrite = [denyDemoWrites, folgenLimiter]
router.post('/p/:slug/folgen', ...folgenWrite, handle((req) => revier.folgen(viewerOf(req), req.params.slug), 201))
router.delete('/p/:slug/folgen', ...folgenWrite, handle((req) => revier.entfolgen(viewerOf(req), req.params.slug)))
router.post('/p/:slug/ausblenden', ...folgenWrite, handle((req) => revier.ausblenden(viewerOf(req), req.params.slug), 201))
router.delete('/p/:slug/ausblenden', ...folgenWrite, handle((req) => revier.einblenden(viewerOf(req), req.params.slug)))

// Profilbild (lib/profil.js bild_file) über den slug - nie über die Bereichs-Id. 404 wie ein Foto, das es nicht gibt.
router.get('/p/:slug/bild', (req, res) => {
  const file = revier.bildFileForSlug(viewerOf(req), req.params.slug)
  const ext = file ? path.extname(file).slice(1) : ''
  const fullPath = file ? path.join(uploadDir, path.basename(file)) : null
  if (!fullPath || !CONTENT_TYPES[ext] || !fs.existsSync(fullPath)) return res.status(404).json({ error: 'Nicht gefunden' })
  res.type(CONTENT_TYPES[ext])
  res.sendFile(fullPath, { cacheControl: false })
})

module.exports = router
