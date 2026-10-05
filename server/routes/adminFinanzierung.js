'use strict'

const express = require('express')
const config = require('../config')
const { requireAdmin } = require('../middleware/admin')
const { noStore } = require('../lib/noStoreResponse')
const { cleanId } = require('../lib/validate')
const { AKTION, logAdminAction, quartalZiel } = require('../lib/adminLog')
const {
  adminFinanzierung,
  saveSpendenHinweis,
  saveZiel,
  createQuartal,
  updateQuartal,
  deleteQuartal
} = require('../lib/finanzierung')

// Phase F: der Admin pflegt „So finanzieren wir uns“ (lib/finanzierung.js) - Reiter „Finanzierung“. Eingehängt unter
// /api/admin in app.js, GENAU wie routes/adminEinladungskarte.js: derselbe 404-ohne-Passwort-Hash-Gate, requireAdmin auf
// jeder Route, alle Antworten no-store. Jede Änderung landet im Admin-Protokoll (nur das Objekt, nie Beträge oder Texte).
// Fehler tragen das betroffene Feld ({ error, feld }), damit das Formular sie direkt am Feld zeigt.
// - GET    /finanzierung                       { spendenHinweis, ziel, quartale }
// - PUT    /finanzierung/spenden-hinweis       { text, url }                       -> { spendenHinweis }
// - PUT    /finanzierung/ziel                  { titel, betragCents, empfaenger }  -> { ziel }
// - POST   /finanzierung/quartale              { jahr, quartal, …Cents, notiz }    -> 201 Quartal
// - PUT    /finanzierung/quartale/:id          dito                                -> Quartal
// - DELETE /finanzierung/quartale/:id                                              -> 204
const router = express.Router()

const ZIEL_HINWEIS = 'einstellung:finanzierung-spenden-hinweis'
const ZIEL_ZIEL = 'einstellung:finanzierung-ziel'
const NOT_FOUND = 'Dieses Quartal gibt es nicht'

router.use((req, res, next) => {
  if (!config.adminPasswordHash) return res.status(404).json({ error: 'Nicht gefunden' })
  next()
})

router.use(noStore, requireAdmin)

function sendError(res, next, err) {
  if (!err.status) return next(err)
  res.status(err.status).json(err.feld ? { error: err.message, feld: err.feld } : { error: err.message })
}

router.get('/finanzierung', (req, res) => {
  res.json(adminFinanzierung())
})

router.put('/finanzierung/spenden-hinweis', (req, res, next) => {
  try {
    const { hinweis, changed } = saveSpendenHinweis(req.body)
    if (changed) logAdminAction(AKTION.finanzierungGeaendert, ZIEL_HINWEIS)
    res.json({ spendenHinweis: hinweis })
  } catch (err) {
    sendError(res, next, err)
  }
})

router.put('/finanzierung/ziel', (req, res, next) => {
  try {
    const { ziel, changed } = saveZiel(req.body)
    if (changed) logAdminAction(AKTION.finanzierungGeaendert, ZIEL_ZIEL)
    res.json({ ziel: ziel || { titel: '', betragCents: null, empfaenger: null } })
  } catch (err) {
    sendError(res, next, err)
  }
})

router.post('/finanzierung/quartale', (req, res, next) => {
  try {
    const quartal = createQuartal(req.body)
    logAdminAction(AKTION.finanzierungQuartalAngelegt, quartalZiel(quartal.id))
    res.status(201).json(quartal)
  } catch (err) {
    sendError(res, next, err)
  }
})

router.put('/finanzierung/quartale/:id', (req, res, next) => {
  try {
    const id = cleanId(req.params.id)
    const quartal = id ? updateQuartal(id, req.body) : null
    if (!quartal) return res.status(404).json({ error: NOT_FOUND })
    logAdminAction(AKTION.finanzierungQuartalGeaendert, quartalZiel(id))
    res.json(quartal)
  } catch (err) {
    sendError(res, next, err)
  }
})

router.delete('/finanzierung/quartale/:id', (req, res) => {
  const id = cleanId(req.params.id)
  if (!id || !deleteQuartal(id)) return res.status(404).json({ error: NOT_FOUND })
  logAdminAction(AKTION.finanzierungQuartalGeloescht, quartalZiel(id))
  res.status(204).end()
})

module.exports = router
