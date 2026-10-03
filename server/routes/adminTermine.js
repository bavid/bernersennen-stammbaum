const express = require('express')
const config = require('../config')
const { requireAdmin } = require('../middleware/admin')
const { cleanId } = require('../lib/validate')
const { AKTION, terminZiel, logAdminAction } = require('../lib/adminLog')
const { NOT_FOUND_MESSAGE, findTermin, deleteTermin, setAusgeblendet, ownTermin, listAdminTermine } = require('../lib/partnerTermine')

// Phase V4a: Termine der Partner im Admin (Partnerpflege, "Termine"). Termine gehen ohne Freigabe online
// (lib/partnerTermine.js) - der Admin kann einen ausblenden (verschwindet von Portal und Karte, der Partner sieht ihn
// markiert und kann ihn nicht selbst wieder einblenden) oder löschen. Beides landet im Admin-Protokoll (lib/adminLog.js,
// ziel 'termin:<id>', nie Titel oder Text). Eingehängt unter /api/admin wie routes/admin.js: derselbe
// 404-ohne-Passwort-Hash-Gate und requireAdmin auf jeder Route.
const router = express.Router()

router.use((req, res, next) => {
  if (!config.adminPasswordHash) return res.status(404).json({ error: 'Nicht gefunden' })
  next()
})

// ?partnerId= (Pflicht): alle Termine des Partners, auch ausgeblendete und abgelaufene.
router.get('/termine', requireAdmin, (req, res) => {
  const partnerId = cleanId(req.query.partnerId)
  if (!partnerId) return res.status(400).json({ error: 'Ungültige Partner-Id' })
  res.json(listAdminTermine(partnerId))
})

router.post('/termine/:id/ausblenden', requireAdmin, (req, res) => {
  const termin = findTermin(req.params.id)
  if (!termin) return res.status(404).json({ error: NOT_FOUND_MESSAGE })
  const { ausgeblendet } = req.body || {}
  if (typeof ausgeblendet !== 'boolean') return res.status(400).json({ error: '„ausgeblendet“ muss true oder false sein' })
  const updated = setAusgeblendet(termin.id, ausgeblendet)
  logAdminAction(ausgeblendet ? AKTION.terminAusgeblendet : AKTION.terminEingeblendet, terminZiel(termin.id))
  res.json({ ...ownTermin(updated), partnerId: updated.partner_id })
})

router.delete('/termine/:id', requireAdmin, (req, res) => {
  const termin = findTermin(req.params.id)
  if (!termin) return res.status(404).json({ error: NOT_FOUND_MESSAGE })
  deleteTermin(termin.id)
  logAdminAction(AKTION.terminGeloescht, terminZiel(termin.id))
  res.status(204).end()
})

module.exports = router
