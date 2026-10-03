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

router.delete('/partners/:id/banner/:position', requireAdmin, (req, res) => {
  const partnerId = findPartnerId(req)
  if (!partnerId) return res.status(404).json({ error: PARTNER_NOT_FOUND })
  const position = parsePosition(req.params.position)
  const removedUrl = position ? deleteBanner(partnerId, position) : null
  if (!removedUrl) return res.status(404).json({ error: NOT_FOUND_MESSAGE })
  removeUploadByUrl(removedUrl)
  logAdminAction(AKTION.bannerfotoEntfernt, partnerZiel(partnerId))
  sendList(res, partnerId)
})

module.exports = router
