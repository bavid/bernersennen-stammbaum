const express = require('express')
const db = require('../db')
const config = require('../config')
const { requireAdmin } = require('../middleware/admin')
const { cleanId } = require('../lib/validate')
const { printBatch, printableCodes, voucherCsv } = require('../lib/voucherPrint')
const { validatePrintedIds, markPrintedAmong } = require('../lib/voucherGedruckt')
const { collectStats } = require('../lib/adminStats')
const { noStore, endWithoutEtag, sendJsonWithoutEtag: sendJson, CSV_TYPE } = require('../lib/noStoreResponse')

// Phase 5 Task 1: Druckdaten und CSV-Export je Gutschein-Stapel sowie die Statistik für den Admin
// (docs/superpowers/plans/2026-09-29-phase-5-admin-praesentation.md). Eingehängt unter /api/admin in app.js,
// GENAU wie routes/admin.js und routes/adminMarketing.js: derselbe 404-ohne-Passwort-Hash-Gate direkt danach
// und requireAdmin auf jeder einzelnen Route.
const router = express.Router()

const BATCH_NOT_FOUND = 'Diesen Stapel gibt es nicht'

// security-review Phase 5: JEDE Antwort dieser Routen (auch 404/401) ohne Zwischenspeicher und ohne ETag
// (lib/noStoreResponse.js). Vor dem Passwort-Hash-Gate, damit auch dessen 404 no-store trägt.
router.use(noStore)

// Ohne hinterlegten Passwort-Hash gibt es keinen Admin-Zugang - wie routes/admin.js.
router.use((req, res, next) => {
  if (!config.adminPasswordHash) return sendJson(res, 404, { error: 'Nicht gefunden' })
  next()
})

const findBatchStmt = db.prepare(`
  SELECT b.id, b.label, b.zweck, b.partner_typ AS partnerTyp,
    p.name AS partner_name, p.logo_file AS partner_logo_file, p.farbe AS partner_farbe
  FROM voucher_batches b
  LEFT JOIN partners p ON p.id = b.partner_id
  WHERE b.id = ?`)

// security-review Phase V2 (L-5): persönliche Codes (lib/vouchers.js isPersonalVoucher) druckt der Admin nie.
const printRowsStmt = db.prepare(
  `SELECT id, code_cipher, redeemed_at, revoked_at, expires_at, gedruckt_at FROM vouchers
   WHERE batch_id = ? AND issued_by_family_id IS NULL AND created_by_family_id IS NULL AND visit_host_family_id IS NULL
     AND dog_id IS NULL
   ORDER BY id`
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
// (lib/voucherPrint.js printableCodes), dazu ids (die Gutschein-Ids zu codes). Das Protokoll vermerkt nur Stapel-Id und
// Anzahl - nie einen Code. Phase V5: schonGedruckt sagt, wie viele davon schon einmal auf Karten standen - so landet kein
// Code unbemerkt zweimal bei der Kundschaft. Rein lesend (Audit V7a): vermerkt wird erst mit POST …/print/gedruckt.
router.get('/voucher-batches/:id/print', requireAdmin, (req, res) => {
  const batch = findBatch(req.params.id)
  if (!batch) return sendJson(res, 404, { error: BATCH_NOT_FOUND })

  const { codes, ids, schonGedruckt, nichtDruckbar } = printableCodes(printRowsStmt.all(batch.id))
  console.info(`[admin] Druckdaten für Stapel ${batch.id}: ${codes.length} Codes, ${nichtDruckbar} nicht druckbar`)
  sendJson(res, 200, { batch: printBatch(batch), codes, ids, schonGedruckt, nichtDruckbar })
})

// Die Druckseite meldet den Druck { ids } (lib/voucherGedruckt.js, nur druckbare dieses Stapels) - Antwort { gedruckt }.
router.post('/voucher-batches/:id/print/gedruckt', requireAdmin, (req, res, next) => {
  try {
    const batch = findBatch(req.params.id)
    if (!batch) return sendJson(res, 404, { error: BATCH_NOT_FOUND })
    const ids = validatePrintedIds(req.body)
    const gedruckt = markPrintedAmong(printableCodes(printRowsStmt.all(batch.id)).ids, ids)
    console.info(`[admin] Stapel ${batch.id}: ${gedruckt} Codes als gedruckt vermerkt`)
    sendJson(res, 200, { gedruckt })
  } catch (err) {
    if (err.status) return sendJson(res, err.status, { error: err.message })
    next(err)
  }
})

// CSV ohne Codes (lib/voucherPrint.js voucherCsv): Semikolon, UTF-8 mit BOM (Excel), als Anhang.
router.get('/voucher-batches/:id/export.csv', requireAdmin, (req, res) => {
  const batch = findBatch(req.params.id)
  if (!batch) return sendJson(res, 404, { error: BATCH_NOT_FOUND })

  res.setHeader('Content-Disposition', `attachment; filename="einladungscodes-stapel-${batch.id}.csv"`)
  endWithoutEtag(res, 200, CSV_TYPE, voucherCsv(csvRowsStmt.all(batch.id)))
})

// Statistik ohne Demo-Daten und ohne Personenbezug (lib/adminStats.js).
router.get('/stats', requireAdmin, (req, res) => {
  sendJson(res, 200, collectStats())
})

module.exports = router
