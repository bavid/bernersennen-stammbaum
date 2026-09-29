const express = require('express')
const config = require('../config')
const { requireAdmin } = require('../middleware/admin')
const { noStore, sendJsonWithoutEtag } = require('../lib/noStoreResponse')
const {
  NOT_FOUND_MESSAGE,
  validateAnfrageUpdate,
  validateStatusFilter,
  validateSeite,
  listAnfragen,
  findAnfrage,
  updateAnfrage,
  deleteAnfrage,
  adminAnfrage
} = require('../lib/anfragen')
const { assignVoucherToAnfrage } = require('../lib/anfrageGutschein')

// Phase N Task 1: Anfragen im Admin (lib/anfragen.js, lib/anfrageGutschein.js). Eingehängt unter /api/admin in
// app.js, GENAU wie routes/admin.js: derselbe 404-ohne-Passwort-Hash-Gate und requireAdmin auf jeder Route.
// Alle Antworten no-store - sie enthalten personenbezogene Daten bzw. (Zuweisung) einen Klartext-Code.
const router = express.Router()

router.use((req, res, next) => {
  if (!config.adminPasswordHash) return res.status(404).json({ error: 'Nicht gefunden' })
  next()
})

function sendError(res, next, err) {
  if (err.status) return res.status(err.status).json({ error: err.message })
  next(err)
}

// GET /api/admin/anfragen?status=offen|erledigt|abgelehnt&seite=1 - ohne status alle; offene zuerst, darin neueste
// oben; 100 je Seite. Antwort: { anfragen, gesamt, seite, seiten } (seite hinter der letzten: anfragen leer).
router.get('/anfragen', noStore, requireAdmin, (req, res, next) => {
  try {
    const status = validateStatusFilter(req.query.status)
    const seite = validateSeite(req.query.seite)
    const { rows, gesamt, seiten } = listAnfragen({ status, seite })
    res.json({ anfragen: rows.map(adminAnfrage), gesamt, seite, seiten })
  } catch (err) {
    sendError(res, next, err)
  }
})

// PUT /api/admin/anfragen/:id { status?, notiz? } - Antwort: die ganze Anfrage (wie in der Liste).
router.put('/anfragen/:id', noStore, requireAdmin, (req, res, next) => {
  try {
    const change = validateAnfrageUpdate(req.body)
    const row = updateAnfrage(req.params.id, change)
    if (!row) return res.status(404).json({ error: NOT_FOUND_MESSAGE })
    res.json(adminAnfrage(row))
  } catch (err) {
    sendError(res, next, err)
  }
})

// POST /api/admin/anfragen/:id/gutschein { batchId } -> { code, anfrage }. Der Code kommt nur in dieser Antwort -
// ohne Zwischenspeicher und ohne ETag (lib/noStoreResponse.js), wie die Druckdaten der Stapel.
router.post('/anfragen/:id/gutschein', noStore, requireAdmin, (req, res, next) => {
  try {
    const { code, anfrageId } = assignVoucherToAnfrage(req.params.id, req.body?.batchId)
    sendJsonWithoutEtag(res, 200, { code, anfrage: adminAnfrage(findAnfrage(anfrageId)) })
  } catch (err) {
    if (err.status) return sendJsonWithoutEtag(res, err.status, { error: err.message })
    next(err)
  }
})

// DELETE /api/admin/anfragen/:id - ein schon zugewiesener Gutschein bleibt vergeben (er ist womöglich verschickt).
router.delete('/anfragen/:id', noStore, requireAdmin, (req, res) => {
  if (!deleteAnfrage(req.params.id)) return res.status(404).json({ error: NOT_FOUND_MESSAGE })
  res.status(204).end()
})

module.exports = router
