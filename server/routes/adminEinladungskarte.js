const express = require('express')
const config = require('../config')
const { requireAdmin } = require('../middleware/admin')
const { noStore } = require('../lib/noStoreResponse')
const { AKTION, logAdminAction } = require('../lib/adminLog')
const { readRueckseite, saveRueckseite, vorgaben } = require('../lib/einladungRueckseite')

// Einladungskarten: die Admin-Einstellung "Einladungskarte – Rückseite" (lib/einladungRueckseite.js) - Titel, Text,
// Schritte und gezeigte Adresse der Rückseite, die Familie auf Pfoten für alle Partner gestaltet. Eingehängt unter
// /api/admin in app.js, GENAU wie routes/admin.js: derselbe 404-ohne-Passwort-Hash-Gate und requireAdmin auf jeder Route,
// alle Antworten no-store. Eine Änderung landet im Admin-Protokoll (ziel 'einstellung:einladungskarte', nie die Texte).
// Fehler tragen das betroffene Feld ({ error, feld }), damit das Formular sie direkt am Feld zeigt.
// - GET /einladungskarte  { rueckseite, vorgaben }
// - PUT /einladungskarte  { titel, text, schritte, adresse } -> wie GET
const router = express.Router()

const ZIEL = 'einstellung:einladungskarte'

router.use((req, res, next) => {
  if (!config.adminPasswordHash) return res.status(404).json({ error: 'Nicht gefunden' })
  next()
})

function sendError(res, next, err) {
  if (!err.status) return next(err)
  res.status(err.status).json(err.feld ? { error: err.message, feld: err.feld } : { error: err.message })
}

router.get('/einladungskarte', noStore, requireAdmin, (req, res) => {
  res.json({ rueckseite: readRueckseite(), vorgaben: vorgaben() })
})

router.put('/einladungskarte', noStore, requireAdmin, (req, res, next) => {
  try {
    const { rueckseite, changed } = saveRueckseite(req.body)
    if (changed) logAdminAction(AKTION.einladungskarteGeaendert, ZIEL)
    res.json({ rueckseite, vorgaben: vorgaben() })
  } catch (err) {
    sendError(res, next, err)
  }
})

module.exports = router
