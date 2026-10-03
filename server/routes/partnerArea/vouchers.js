const express = require('express')
const db = require('../../db')
const { cleanId } = require('../../lib/validate')
const { VOUCHER_COUNTS_SQL } = require('../../lib/vouchers')
const { OWN_STACK_SQL, ownStackParams: stackParams } = require('../../lib/partnerStacks')
const { printBatch, printableCodes } = require('../../lib/voucherPrint')
const { noStore, sendJsonWithoutEtag } = require('../../lib/noStoreResponse')

// Phase 5 Task 4: die Kunden-Gutschein-Stapel eines Partners - die Stapel, die der Admin für ihn angelegt hat
// (voucher_batches.kind 'partner' mit seiner partner_id, quelle 'admin'), und die Weitergabe-Gutscheine seines
// Bereichs (vouchers.issued_by_family_id = der Bereich, quelle 'weitergabe' - in der Demo der Demo-Stapel aus
// lib/demoPartnerAreas.js). Kein Partner-Zugang (zweck 'partnerzugang') und kein Übergabe-Gutschein eines
// Tierheims (dog_id gesetzt): beides legt keine Kunden-Chronik an. Alles hier ist lesend und bleibt darum
// für Demo-Sitzungen offen (middleware/partnerArea.js).
// Klartext-Codes gibt es ausschließlich über /:batchId/print (lib/voucherPrint.js printableCodes, nur offene
// Gutscheine), mit no-store und ohne ETag (lib/noStoreResponse.js) - wie die Druckdaten des Admins
// (routes/adminStats.js). Das Protokoll vermerkt nur Stapel-Id und Anzahl, nie einen Code.

const router = express.Router()

const BATCH_NOT_FOUND = 'Diesen Stapel gibt es nicht'
const QUELLE = Object.freeze({ admin: 'admin', weitergabe: 'weitergabe' })

router.use(noStore)

// Welche Gutscheine zum Partner gehören (Admin-Partner-Stapel und Weitergabe des Bereichs): lib/partnerStacks.js -
// dieselbe Regel wie für die Codes der Visitenkarten (Phase V5).

const listStmt = db.prepare(`
  SELECT b.id, b.label, b.size, b.created_at AS erstelltAm,
    CASE WHEN b.kind = 'partner' THEN '${QUELLE.admin}' ELSE '${QUELLE.weitergabe}' END AS quelle,
    ${VOUCHER_COUNTS_SQL}
  FROM voucher_batches b
  JOIN vouchers v ON v.batch_id = b.id
  WHERE ${OWN_STACK_SQL}
  GROUP BY b.id
  ORDER BY b.created_at DESC, b.id DESC`)

const findOwnBatchStmt = db.prepare(`
  SELECT b.id, b.label, b.zweck
  FROM voucher_batches b
  JOIN vouchers v ON v.batch_id = b.id
  WHERE b.id = @batchId AND ${OWN_STACK_SQL}
  LIMIT 1`)

const printRowsStmt = db.prepare(
  'SELECT id, code_cipher, redeemed_at, revoked_at, expires_at FROM vouchers WHERE batch_id = ? AND dog_id IS NULL ORDER BY id'
)

function ownStackParams(req) {
  return stackParams({ partnerId: req.partner.id, familyId: req.familyId })
}

// GET /vouchers - { stapel: [{ id, label, quelle, size, offen, eingeloest, widerrufen, erstelltAm }] }, neueste
// zuerst. Keine Codes.
router.get('/', (req, res) => {
  sendJsonWithoutEtag(res, 200, { stapel: listStmt.all(ownStackParams(req)) })
})

// GET /vouchers/:batchId/print - dieselbe Form wie GET /api/admin/voucher-batches/:id/print (Client:
// PartnerPrintPage nutzt dieselben Karten wie AdminPrintPage). Das Partner-Motiv kommt immer vom eigenen
// Partner (req.partner) - auch ein Weitergabe-Stapel gehört zu ihm. Fremde oder unbekannte Stapel: 404.
router.get('/:batchId/print', (req, res) => {
  const batchId = cleanId(req.params.batchId)
  const batch = batchId ? findOwnBatchStmt.get({ batchId, ...ownStackParams(req) }) : null
  if (!batch) return sendJsonWithoutEtag(res, 404, { error: BATCH_NOT_FOUND })

  const { codes, nichtDruckbar } = printableCodes(printRowsStmt.all(batch.id))
  console.info(`[partner-area] Druckdaten für Stapel ${batch.id} (Partner ${req.partner.id}): ${codes.length} Codes, ${nichtDruckbar} nicht druckbar`)
  const row = {
    ...batch,
    partnerTyp: null,
    partner_name: req.partner.name,
    partner_logo_file: req.partner.logo_file,
    partner_farbe: req.partner.farbe
  }
  sendJsonWithoutEtag(res, 200, { batch: printBatch(row), codes, nichtDruckbar })
})

module.exports = router
