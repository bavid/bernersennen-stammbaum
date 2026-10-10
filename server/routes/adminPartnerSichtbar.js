'use strict'

const express = require('express')
const config = require('../config')
const db = require('../db')
const { requireAdmin } = require('../middleware/admin')
const { noStore } = require('../lib/noStoreResponse')
const { cleanId } = require('../lib/validate')
const { AKTION, logAdminAction, partnerZiel } = require('../lib/adminLog')
const { parseErlaubt, setUeberallErlaubt, parseEntscheidung, decideUeberall } = require('../lib/ueberallSichtbar')

// Phase F: das Team schaltet „Überall sichtbar“ eines Partners aus - und sperrt es damit, bis es die Hervorhebung wieder
// erlaubt (lib/ueberallSichtbar.js setUeberallErlaubt; einschalten tut der Partner selbst, routes/partnerArea/profile.js).
// Eingehängt unter /api/admin in app.js wie routes/adminEinladungskarte.js: 404-Gate ohne Passwort-Hash, requireAdmin und
// no-store je Route. Eine Änderung landet im Admin-Protokoll (ziel 'partner:<id>').
// - PUT /partners/:id/ueberall-sichtbar { erlaubt } -> { id, ueberallSichtbar, ueberallGesperrt }
// - PUT /partners/:id/ueberall-freigabe { freigeben, grund? } -> { id, ueberallSichtbar, ueberallFreigabe, ueberallGrund }
//   (Antrag „Deutschlandweit sichtbar“ freigeben oder mit Grund ablehnen)
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
    const { an, gesperrt, changed } = setUeberallErlaubt(id, parseErlaubt(req.body))
    if (changed) logAdminAction(gesperrt ? AKTION.partnerUeberallGesperrt : AKTION.partnerUeberallErlaubt, partnerZiel(id))
    res.json({ id, ueberallSichtbar: an, ueberallGesperrt: gesperrt })
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    next(err)
  }
})

router.put('/partners/:id/ueberall-freigabe', noStore, requireAdmin, (req, res, next) => {
  try {
    const id = cleanId(req.params.id)
    if (!id || !findPartner.get(id)) return res.status(404).json({ error: 'Diesen Partner gibt es nicht' })
    const entscheidung = parseEntscheidung(req.body)
    const { an, freigabe, grund } = decideUeberall(id, entscheidung)
    logAdminAction(entscheidung.freigeben ? AKTION.partnerUeberallFreigegeben : AKTION.partnerUeberallAbgelehnt, partnerZiel(id))
    res.json({ id, ueberallSichtbar: an, ueberallFreigabe: freigabe, ueberallGrund: grund })
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    next(err)
  }
})

module.exports = router
