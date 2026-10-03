const path = require('node:path')
const express = require('express')
const db = require('../db')
const config = require('../config')
const { requireAdmin } = require('../middleware/admin')
const { cleanId } = require('../lib/validate')
const { AKTION, partnerZiel, logAdminAction } = require('../lib/adminLog')
const { removeUploadByUrl } = require('../lib/photoUpload')
const { NOT_FOUND_MESSAGE, parsePosition, ownBanner, listBanner, deleteBanner } = require('../lib/partnerBanner')

// Audit V7a: Bannerfotos eines Partners im Admin (Partnerpflege, "Fotos"). Bisher konnte der Admin ein unpassendes
// Kopfbild nur loswerden, indem er den ganzen Partner pausierte - jetzt entfernt er einzelne Fotos (wie der Partner selbst:
// die folgenden rücken nach, die Datei verschwindet). Landet im Admin-Protokoll (lib/adminLog.js, ziel 'partner:<id>', nie
// die Datei oder der Alternativtext). Eingehängt unter /api/admin wie routes/adminTermine.js: derselbe
// 404-ohne-Passwort-Hash-Gate und requireAdmin auf jeder Route. Fotos über /uploads (der Admin sieht jede Datei).
const router = express.Router()

const PARTNER_NOT_FOUND = 'Diesen Partner gibt es nicht'
const CHANGED_MESSAGE = 'Das Foto an dieser Stelle hat sich inzwischen geändert – bitte die Liste neu laden.'
const partnerExistsStmt = db.prepare('SELECT 1 FROM partners WHERE id = ?')

router.use((req, res, next) => {
  if (!config.adminPasswordHash) return res.status(404).json({ error: 'Nicht gefunden' })
  next()
})

function findPartnerId(req) {
  const id = cleanId(req.params.id)
  return id && partnerExistsStmt.get(id) ? id : null
}

function sendList(res, partnerId) {
  res.json({ banner: listBanner(partnerId).map(ownBanner) })
}

router.get('/partners/:id/banner', requireAdmin, (req, res) => {
  const partnerId = findPartnerId(req)
  if (!partnerId) return res.status(404).json({ error: PARTNER_NOT_FOUND })
  sendList(res, partnerId)
})

// ?foto=<Dateiname> (optional): das Foto, das der Admin gesehen hat. Hat der Partner es inzwischen ersetzt oder ist ein
// anderes nachgerückt, entfernt die Position sonst ein anderes Foto - dann 409 statt Löschen.
router.delete('/partners/:id/banner/:position', requireAdmin, (req, res) => {
  const partnerId = findPartnerId(req)
  if (!partnerId) return res.status(404).json({ error: PARTNER_NOT_FOUND })
  const position = parsePosition(req.params.position)
  const expected = typeof req.query.foto === 'string' ? req.query.foto : null
  const current = position ? listBanner(partnerId).find((row) => row.position === position) : null
  if (expected && current && path.basename(current.foto_url) !== expected) return res.status(409).json({ error: CHANGED_MESSAGE })
  const removedUrl = position ? deleteBanner(partnerId, position) : null
  if (!removedUrl) return res.status(404).json({ error: NOT_FOUND_MESSAGE })
  removeUploadByUrl(removedUrl)
  logAdminAction(AKTION.bannerfotoEntfernt, partnerZiel(partnerId))
  sendList(res, partnerId)
})

module.exports = router
