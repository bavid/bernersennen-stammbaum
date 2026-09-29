'use strict'

// Phase N Task 1: einer Anfrage einen Gutschein zuweisen (POST /api/admin/anfragen/:id/gutschein). Der Admin wählt
// einen Stapel; genommen wird der erste offene, noch nicht zugewiesene Gutschein, dessen Zweck zur Anfrage passt
// (Gutschein-Anfrage -> Kunden-Gutschein 'chronik', Partner-Anfrage -> 'partnerzugang'). Wir versenden keine
// E-Mails - der Code geht einmal an den Admin zurück (zum Kopieren), danach steht er nur noch wie jeder offene
// Code in den Stapel-Details. Der Gutschein bleibt offen (und druckbar), bis er eingelöst wird; vouchers.
// zugewiesen_an_anfrage_id verhindert, dass er ein zweites Mal vergeben wird. Codes landen nie im Log.

const db = require('../db')
const { cleanId } = require('./validate')
const { formatCode, decryptCode } = require('./codes')
const { ZWECK, voucherStatus } = require('./vouchers')
const { AKTION, anfrageZiel, logAdminAction } = require('./adminLog')
const { TYP, NOT_FOUND_MESSAGE, httpError } = require('./anfragen')

// Nur Stapel des Admins: 'admin' (auch Partner-Zugänge) und 'partner' (Kunden-Gutscheine eines Partners, der
// Bereich bekommt dann dessen Herkunft) - nie Weitergabe-Stapel eines Bereichs ('rudel') oder die Demo.
const ASSIGNABLE_BATCH_KINDS = ['admin', 'partner']
const ZWECK_FOR_TYP = Object.freeze({ [TYP.gutschein]: ZWECK.chronik, [TYP.partner]: ZWECK.partnerzugang })
const ZWECK_MISMATCH_MESSAGE = Object.freeze({
  [TYP.gutschein]: 'Für eine Gutschein-Anfrage bitte einen Stapel mit Kunden-Gutscheinen wählen.',
  [TYP.partner]: 'Für eine Partner-Anfrage bitte einen Stapel mit Partner-Zugängen wählen.'
})

// Ist der schon zugewiesene Gutschein zurückgezogen oder abgelaufen (Code falsch verschickt, E-Mail kam zurück, ...),
// darf die Anfrage einen neuen bekommen - ein offener oder eingelöster bleibt die Zuweisung.
const REASSIGNABLE_STATUS = ['widerrufen', 'abgelaufen']

const findAnfrageStmt = db.prepare('SELECT id, typ, partner_typ, voucher_id FROM anfragen WHERE id = ?')
const findBatchStmt = db.prepare('SELECT id, kind, zweck, partner_typ FROM voucher_batches WHERE id = ?')
const findAssignedVoucherStmt = db.prepare('SELECT redeemed_at, revoked_at, expires_at FROM vouchers WHERE id = ?')
// Frei: offen (wie lib/vouchers.js voucherStatus), mit Geheimtext, noch keiner Anfrage zugewiesen - und kein
// Einladungs-, Übergabe- oder Weitergabe-Gutschein (join_family_id/dog_id/issued_by_family_id). Ein an einen
// bestehenden Partner gebundener Partner-Zugang (partner_id) gehört genau diesem Partner und ist nie frei; bei
// Kunden-Gutscheinen ist partner_id nur die Herkunft und bleibt erlaubt (@allowPartnerId).
const findFreeVoucherStmt = db.prepare(
  `SELECT id, code_cipher FROM vouchers
   WHERE batch_id = @batchId AND zugewiesen_an_anfrage_id IS NULL AND code_cipher IS NOT NULL
     AND redeemed_at IS NULL AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > datetime('now'))
     AND join_family_id IS NULL AND dog_id IS NULL AND issued_by_family_id IS NULL
     AND (@allowPartnerId = 1 OR partner_id IS NULL)
   ORDER BY id LIMIT 1`
)
const markVoucherStmt = db.prepare('UPDATE vouchers SET zugewiesen_an_anfrage_id = ? WHERE id = ? AND zugewiesen_an_anfrage_id IS NULL')
// Wächter "voucher_id IS <bisheriger Wert>": NULL beim ersten Mal, sonst der zurückgezogene/abgelaufene Gutschein.
const markAnfrageStmt = db.prepare(
  "UPDATE anfragen SET voucher_id = @voucherId, status = 'erledigt', erledigt_at = datetime('now') WHERE id = @id AND voucher_id IS @previous"
)

function findAssignableBatch(batchIdInput, anfrage) {
  const batchId = cleanId(batchIdInput)
  const batch = batchId ? findBatchStmt.get(batchId) : undefined
  if (!batch) throw httpError(404, 'Diesen Stapel gibt es nicht')
  if (!ASSIGNABLE_BATCH_KINDS.includes(batch.kind)) throw httpError(400, 'Aus diesem Stapel lassen sich keine Gutscheine zuweisen.')
  if (batch.zweck !== ZWECK_FOR_TYP[anfrage.typ]) throw httpError(400, ZWECK_MISMATCH_MESSAGE[anfrage.typ] || 'Dieser Stapel passt nicht zur Anfrage.')
  // Die Typ-Vorgabe eines Partner-Zugang-Stapels gilt beim Einlösen (lib/partnerAccess.js) - sie muss zur Anfrage passen.
  if (batch.partner_typ && anfrage.partner_typ && batch.partner_typ !== anfrage.partner_typ) {
    throw httpError(400, `Dieser Stapel legt den Typ „${batch.partner_typ}“ fest, die Anfrage ist „${anfrage.partner_typ}“.`)
  }
  return batch
}

function assertNotYetAssigned(anfrage) {
  if (!anfrage.voucher_id) return
  const previous = findAssignedVoucherStmt.get(anfrage.voucher_id)
  if (previous && !REASSIGNABLE_STATUS.includes(voucherStatus(previous))) {
    throw httpError(409, 'Dieser Anfrage wurde schon ein Gutschein zugewiesen.')
  }
}

// Weist in EINER Transaktion zu: Gutschein markieren, Anfrage auf erledigt setzen (samt voucher_id), Protokoll
// ({ aktion 'gutschein-zugewiesen', ziel 'anfrage:<id>' } - nie der Code). Beide UPDATEs tragen einen Wächter,
// falls zwei Zuweisungen gleichzeitig laufen. Gibt { code (XXXX-XXXX-XXXX), anfrageId } zurück oder wirft einen
// Fehler mit .status (404 Anfrage/Stapel, 400 falscher Stapel, 409 schon zugewiesen/kein freier).
function assignVoucherToAnfrage(anfrageIdInput, batchIdInput) {
  return db.transaction(() => {
    const anfrageId = cleanId(anfrageIdInput)
    const anfrage = anfrageId ? findAnfrageStmt.get(anfrageId) : undefined
    if (!anfrage) throw httpError(404, NOT_FOUND_MESSAGE)
    assertNotYetAssigned(anfrage)

    const batch = findAssignableBatch(batchIdInput, anfrage)
    const voucher = findFreeVoucherStmt.get({ batchId: batch.id, allowPartnerId: batch.zweck === ZWECK.chronik ? 1 : 0 })
    if (!voucher) throw httpError(409, 'In diesem Stapel ist kein freier Gutschein mehr.')

    const code = formatCode(decryptCode(voucher.code_cipher))
    const marked = markVoucherStmt.run(anfrage.id, voucher.id).changes === 1
    if (!marked || markAnfrageStmt.run({ voucherId: voucher.id, id: anfrage.id, previous: anfrage.voucher_id }).changes !== 1) {
      throw httpError(409, 'Die Zuweisung hat sich überschnitten – bitte noch einmal versuchen.')
    }
    logAdminAction(AKTION.gutscheinZugewiesen, anfrageZiel(anfrage.id))
    return { code, anfrageId: anfrage.id }
  })()
}

module.exports = { assignVoucherToAnfrage, ASSIGNABLE_BATCH_KINDS }
