'use strict'

// Phase 5 Task 4 / Phase V5: welche Gutscheine zum Kunden-Stapel eines Partners gehören - geteilt von der Stapel-Liste
// samt Druckdaten (routes/partnerArea/vouchers.js) und den Codes für Visitenkarten (lib/visitenkarteGutscheine.js).
// Ein Stapel gehört zum Partner, wenn er ein Admin-Partner-Stapel mit seiner partner_id ist (ohne ausgebenden Bereich)
// ODER sein Bereich die Gutscheine ausgegeben hat (Weitergabe - egal, welche Art der Stapel trägt: kind 'rudel', in
// der Demo 'demo'). Nur Kunden-Gutscheine (zweck 'chronik'): kein Partner-Zugang, kein Übergabe-Gutschein eines
// Tierheims (dog_id gesetzt) - beides legt keine Kunden-Chronik an. Setzt die Aliase b (voucher_batches) und
// v (vouchers) voraus; die Parameter kommen aus ownStackParams.

const { ZWECK } = require('./vouchers')

const OWN_STACK_SQL = `
  b.zweck = @zweck AND v.dog_id IS NULL
  AND ((b.kind = 'partner' AND b.partner_id = @partnerId AND v.issued_by_family_id IS NULL)
    OR v.issued_by_family_id = @familyId)`

// req.partner.id und req.familyId (middleware/partnerArea.js requirePartnerArea).
function ownStackParams({ partnerId, familyId }) {
  return { zweck: ZWECK.chronik, partnerId, familyId }
}

module.exports = { OWN_STACK_SQL, ownStackParams }
