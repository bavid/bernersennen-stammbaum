const express = require('express')
const db = require('../db')
const config = require('../config')
const { requireAdmin } = require('../middleware/admin')
const { cleanId } = require('../lib/validate')
const { printBatch, printableCodes, voucherCsv } = require('../lib/voucherPrint')
const { collectStats } = require('../lib/adminStats')

// Phase 5 Task 1: Druckdaten und CSV-Export je Gutschein-Stapel sowie die Statistik für den Admin
// (docs/superpowers/plans/2026-09-29-phase-5-admin-praesentation.md). Eingehängt unter /api/admin in app.js,
// GENAU wie routes/admin.js und routes/adminMarketing.js: derselbe 404-ohne-Passwort-Hash-Gate direkt danach
// und requireAdmin auf jeder einzelnen Route.
const router = express.Router()

// Ohne hinterlegten Passwort-Hash gibt es keinen Admin-Zugang - wie routes/admin.js.
router.use((req, res, next) => {
  if (!config.adminPasswordHash) return res.status(404).json({ error: 'Nicht gefunden' })
  next()
})

const BATCH_NOT_FOUND = 'Diesen Stapel gibt es nicht'

const findBatchStmt = db.prepare(`
  SELECT b.id, b.label, b.zweck, b.partner_typ AS partnerTyp,
    p.name AS partner_name, p.logo_file AS partner_logo_file, p.farbe AS partner_farbe
  FROM voucher_batches b
  LEFT JOIN partners p ON p.id = b.partner_id
  WHERE b.id = ?`)

const printRowsStmt = db.prepare(
  'SELECT id, code_cipher, redeemed_at, revoked_at, expires_at FROM vouchers WHERE batch_id = ? ORDER BY id'
)

const csvRowsStmt = db.prepare(`
  SELECT v.code_hint, v.redeemed_at, v.revoked_at, v.expires_at, f.name AS redeemed_by_name, p.name AS partner_name
  FROM vouchers v
  LEFT JOIN families f ON f.id = v.redeemed_by_family_id
  LEFT JOIN partners p ON p.id = v.partner_id
  WHERE v.batch_id = ? ORDER BY v.id`)

function findBatch(param) {
  const id = cleanId(param)
  return id ? findBatchStmt.get(id) : null
}

// Klartext-Codes für die Druckseite (Client Task 2): nur offene Gutscheine mit Geheimtext
// (lib/voucherPrint.js printableCodes), no-store, damit kein Browser-/Proxy-Cache sie behält. Das Protokoll
// vermerkt nur Stapel-Id und Anzahl - nie einen Code.
router.get('/voucher-batches/:id/print', requireAdmin, (req, res) => {
  const batch = findBatch(req.params.id)
  if (!batch) return res.status(404).json({ error: BATCH_NOT_FOUND })

  const { codes, nichtDruckbar } = printableCodes(printRowsStmt.all(batch.id))
  console.info(`[admin] Druckdaten für Stapel ${batch.id}: ${codes.length} Codes, ${nichtDruckbar} nicht druckbar`)
  res.setHeader('Cache-Control', 'no-store')
  res.json({ batch: printBatch(batch), codes, nichtDruckbar })
})

// CSV ohne Codes (lib/voucherPrint.js voucherCsv): Semikolon, UTF-8 mit BOM (Excel), als Anhang.
router.get('/voucher-batches/:id/export.csv', requireAdmin, (req, res) => {
  const batch = findBatch(req.params.id)
  if (!batch) return res.status(404).json({ error: BATCH_NOT_FOUND })

  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="gutscheine-stapel-${batch.id}.csv"`)
  res.send(voucherCsv(csvRowsStmt.all(batch.id)))
})

// Statistik ohne Demo-Daten und ohne Personenbezug (lib/adminStats.js).
router.get('/stats', requireAdmin, (req, res) => {
  res.json(collectStats())
})

module.exports = router
