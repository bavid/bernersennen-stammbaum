const express = require('express')
const config = require('../config')
const { requireAdmin } = require('../middleware/admin')
const { noStore } = require('../lib/noStoreResponse')
const { cleanId } = require('../lib/validate')
const { AKTION, hinweisZiel, logAdminAction } = require('../lib/adminLog')
const {
  MAX_HINWEISE,
  NOT_FOUND_MESSAGE,
  httpError,
  validateHinweis,
  findHinweis,
  listHinweise,
  countHinweise,
  createHinweis,
  updateHinweis,
  deleteHinweis,
  adminHinweis
} = require('../lib/hinweise')

// Phase N Task 5: globale Hinweise im Admin (lib/hinweise.js). Eingehängt unter /api/admin in app.js, GENAU wie
// routes/admin.js: derselbe 404-ohne-Passwort-Hash-Gate und requireAdmin auf jeder Route, alle Antworten no-store.
// Jede Änderung landet im Admin-Protokoll (ziel 'hinweis:<id>', nie Titel oder Text). Fehler tragen - wo es eins gibt -
// das betroffene Feld ({ error, feld }), damit das Formular sie direkt am Feld zeigt.
const router = express.Router()

router.use((req, res, next) => {
  if (!config.adminPasswordHash) return res.status(404).json({ error: 'Nicht gefunden' })
  next()
})

function sendError(res, next, err) {
  if (!err.status) return next(err)
  res.status(err.status).json(err.feld ? { error: err.message, feld: err.feld } : { error: err.message })
}

function existingOr404(rawId) {
  const id = cleanId(rawId)
  const row = Number.isInteger(id) ? findHinweis(id) : null
  if (!row) throw httpError(404, NOT_FOUND_MESSAGE)
  return row
}

// Nur der Schalter umgelegt -> "eingeschaltet"/"ausgeschaltet", sonst "geändert".
function updateAktion(before, after) {
  const onlyToggled = ['titel', 'text', 'stufe', 'start', 'ende'].every((key) => before[key] === after[key])
  if (!onlyToggled || before.aktiv === after.aktiv) return AKTION.hinweisGeaendert
  return after.aktiv ? AKTION.hinweisEingeschaltet : AKTION.hinweisAusgeschaltet
}

// GET /api/admin/hinweise -> { hinweise (neueste zuerst, mit status), max }
router.get('/hinweise', noStore, requireAdmin, (req, res) => {
  const now = new Date()
  res.json({ hinweise: listHinweise().map((row) => adminHinweis(row, now)), max: MAX_HINWEISE })
})

// POST /api/admin/hinweise { titel, text?, stufe?, start?, ende?, aktiv? } -> 201 der neue Hinweis
router.post('/hinweise', noStore, requireAdmin, (req, res, next) => {
  try {
    const clean = validateHinweis(req.body)
    if (countHinweise() >= MAX_HINWEISE) {
      throw httpError(409, `Höchstens ${MAX_HINWEISE} Hinweise – bitte zuerst alte löschen.`)
    }
    const row = createHinweis(clean)
    logAdminAction(AKTION.hinweisAngelegt, hinweisZiel(row.id))
    res.status(201).json(adminHinweis(row))
  } catch (err) {
    sendError(res, next, err)
  }
})

// PUT /api/admin/hinweise/:id { titel?, text?, stufe?, start?, ende?, aktiv? } - fehlende Felder bleiben -> der Hinweis
router.put('/hinweise/:id', noStore, requireAdmin, (req, res, next) => {
  try {
    const existing = existingOr404(req.params.id)
    const clean = validateHinweis(req.body, { existing })
    const row = updateHinweis(existing.id, clean)
    logAdminAction(updateAktion(existing, row), hinweisZiel(row.id))
    res.json(adminHinweis(row))
  } catch (err) {
    sendError(res, next, err)
  }
})

// DELETE /api/admin/hinweise/:id -> 204
router.delete('/hinweise/:id', noStore, requireAdmin, (req, res, next) => {
  try {
    const existing = existingOr404(req.params.id)
    deleteHinweis(existing.id)
    logAdminAction(AKTION.hinweisGeloescht, hinweisZiel(existing.id))
    res.status(204).end()
  } catch (err) {
    sendError(res, next, err)
  }
})

module.exports = router
