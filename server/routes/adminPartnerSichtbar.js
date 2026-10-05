'use strict'

const express = require('express')
const config = require('../config')
const db = require('../db')
const { requireAdmin } = require('../middleware/admin')
const { noStore } = require('../lib/noStoreResponse')
const { cleanId } = require('../lib/validate')
const { AKTION, logAdminAction, partnerZiel } = require('../lib/adminLog')
const { parseAn, setUeberallSichtbar } = require('../lib/ueberallSichtbar')

// Phase F: der Admin schaltet „Überall sichtbar“ eines Partners um - meist aus (der Partner schaltet es selbst ein,
// routes/partnerArea/profile.js). Eingehängt unter /api/admin in app.js wie routes/adminEinladungskarte.js: 404-Gate ohne
// Passwort-Hash, requireAdmin, no-store. Eine Änderung landet im Admin-Protokoll (ziel 'partner:<id>').
// - PUT /partners/:id/ueberall-sichtbar { an } -> { id, ueberallSichtbar }
const router = express.Router()

const findPartner = db.prepare('SELECT id FROM partners WHERE id = ?')

router.use((req, res, next) => {
  if (!config.adminPasswordHash) return res.status(404).json({ error: 'Nicht gefunden' })
  next()
})

router.put('/partners/:id/ueberall-sichtbar', noStore, requireAdmin, (req, res, next) => {
  try {
    const id = cleanId(req.params.id)
    if (!id || !findPartner.get(id)) return res.status(404).json({ error: 'Diesen Partner gibt es nicht' })
    const { an, changed } = setUeberallSichtbar(id, parseAn(req.body))
    if (changed) logAdminAction(an ? AKTION.partnerUeberallSichtbar : AKTION.partnerNichtUeberallSichtbar, partnerZiel(id))
    res.json({ id, ueberallSichtbar: an })
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    next(err)
  }
})

module.exports = router
