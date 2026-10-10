const express = require('express')
const config = require('../config')
const { requireAdmin } = require('../middleware/admin')
const { noStore } = require('../lib/noStoreResponse')
const { cleanId } = require('../lib/validate')
const { AKTION, landeadresseZiel, logAdminAction } = require('../lib/adminLog')
const { listLandeadressen, createLandeadresse, updateLandeadresse } = require('../lib/landeadressen')

// Plan 2027 Kap. 6 „Messen ohne Tracking“: Landeadressen je Kanal im Admin (lib/landeadressen.js). Eingehängt unter
// /api/admin in app.js wie routes/adminHinweise.js: 404 ohne Passwort-Hash, requireAdmin und no-store auf jeder Route.
// Jede Änderung landet im Admin-Protokoll (ziel 'landeadresse:<id>').
const router = express.Router()

router.use((req, res, next) => {
  if (!config.adminPasswordHash) return res.status(404).json({ error: 'Nicht gefunden' })
  next()
})

function sendError(res, next, err) {
  if (!err.status) return next(err)
  res.status(err.status).json(err.feld ? { error: err.message, feld: err.feld } : { error: err.message })
}

function updateAktion(before, after) {
  const nurSchalter = before.ziel === after.ziel && before.serie === after.serie
  if (!nurSchalter || before.aktiv === after.aktiv) return AKTION.landeadresseGeaendert
  return after.aktiv ? AKTION.landeadresseEingeschaltet : AKTION.landeadresseAusgeschaltet
}

// GET /api/admin/landeadressen -> { landeadressen: [{ id, slug, ziel, serie, aktiv, besuche30, besucheGesamt,
// einloesungen: { tage30, gesamt } | null }] }
router.get('/landeadressen', noStore, requireAdmin, (req, res) => {
  res.json({ landeadressen: listLandeadressen() })
})

// POST /api/admin/landeadressen { slug, ziel?, serie? } -> 201 die neue Adresse
router.post('/landeadressen', noStore, requireAdmin, (req, res, next) => {
  try {
    const row = createLandeadresse(req.body)
    logAdminAction(AKTION.landeadresseAngelegt, landeadresseZiel(row.id))
    res.status(201).json(row)
  } catch (err) {
    sendError(res, next, err)
  }
})

// PUT /api/admin/landeadressen/:id { ziel?, serie?, aktiv? } -> die Adresse
router.put('/landeadressen/:id', noStore, requireAdmin, (req, res, next) => {
  try {
    const id = cleanId(req.params.id)
    if (!Number.isInteger(id)) return res.status(404).json({ error: 'Diese Landeadresse gibt es nicht' })
    const { before, after } = updateLandeadresse(id, req.body)
    logAdminAction(updateAktion(before, after), landeadresseZiel(id))
    res.json(after)
  } catch (err) {
    sendError(res, next, err)
  }
})

module.exports = router
