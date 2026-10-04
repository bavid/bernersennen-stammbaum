'use strict'

// Phase V2: Besuchs-Einladungen ("Jemanden in mein Zuhause einladen"). Ein Zuhause legt für sich selbst einen Code
// im Gutschein-Format an (Stapel mit zweck 'besuch', vouchers.visit_host_family_id = das Zuhause), 7 Tage gültig und
// einmal einlösbar. Eingelöst wird er aus dem eigenen Zuhause heraus (redeemVisitInvite, POST /api/besuche/einloesen)
// oder von einem neuen Haushalt über /v#CODE (lib/vouchers.js redeemVoucher legt dann Zuhause UND Besuch an).

const { normalizeCode, hashCode } = require('./codes')
const { createBatch, findVoucherByHash, assertVoucherOpen, assertVisitHostOpen, ZWECK } = require('./vouchers')
const { findHome, isVisiting, addVisit } = require('./visits')
const { assertOpenCodeSlot } = require('./voucherManage')

const VISIT_INVITE_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

const NOT_A_VISIT_MESSAGE = 'Das ist keine Besuchs-Einladung. Einladungscodes für eine eigene Chronik löst du nach dem Abmelden ein.'
const OWN_INVITE_MESSAGE = 'Das ist deine eigene Einladung – gib sie an die Person weiter, die dich besuchen soll.'
const ALREADY_VISITING_MESSAGE = 'Ihr seid schon verbunden – du findest das Zuhause oben im Bereichswechsler.'

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

// Legt eine Besuchs-Einladung des Zuhauses hostId an und gibt { voucherId, code, expiresAt } zurück (code im
// Klartext, nur für die Antwort - danach liegt er wie jeder offene Gutschein nur verschlüsselt vor).
// now (optional, für Tests): Bezugszeitpunkt für die 7 Tage. Phase V2b: zählt zur Obergrenze offener Codes des
// Zuhauses (lib/voucherManage.js, 409) - Prüfen und Anlegen in einer Transaktion.
function createVisitInvite(db, hostId, { now = new Date() } = {}) {
  const host = findHome(hostId)
  if (!host) throw httpError(400, 'Einladen geht nur aus „Mein Zuhause“ heraus')
  const expiresAt = new Date(now.getTime() + VISIT_INVITE_DAYS * DAY_MS)
  return db.transaction(() => {
    assertOpenCodeSlot(db, hostId)
    const { batchId, codes } = createBatch(db, {
      label: `Besuch ${host.name}`,
      kind: 'rudel',
      size: 1,
      issuedByFamilyId: hostId,
      visitHostFamilyId: hostId,
      zweck: ZWECK.besuch,
      expiresAt,
      createdByFamilyId: hostId
    })
    const row = db.prepare('SELECT id, expires_at FROM vouchers WHERE batch_id = ?').get(batchId)
    return { voucherId: row.id, code: codes[0], expiresAt: row.expires_at }
  })()
}

// Löst eine Besuchs-Einladung aus dem eigenen Zuhause guestId ein: verbraucht den Code (atomar wie lib/vouchers.js
// claimOpenVoucher) und legt den Besuch an. Erst prüfen, dann verbrauchen - ein falscher Code (Chronik-Gutschein,
// Partner-Zugang, Übergabe, die eigene Einladung, schon verbunden) bleibt unangetastet.
function redeemVisitInvite(db, { code, guestId }) {
  const normalized = normalizeCode(code)
  if (!normalized) throw httpError(404, 'Diesen Code kennen wir nicht')
  const guest = findHome(guestId)
  if (!guest || guest.is_demo) throw httpError(400, 'Nur aus „Mein Zuhause“ heraus möglich')
  const codeHash = hashCode(normalized)

  return db.transaction(() => {
    const voucher = findVoucherByHash(db, codeHash)
    assertVoucherOpen(voucher)
    if (voucher.zweck !== ZWECK.besuch) throw httpError(400, NOT_A_VISIT_MESSAGE)
    assertVisitHostOpen(db, voucher)
    const hostId = voucher.visit_host_family_id
    if (hostId === guestId) throw httpError(400, OWN_INVITE_MESSAGE)
    if (isVisiting(guestId, hostId)) throw httpError(409, ALREADY_VISITING_MESSAGE)

    const claim = db
      .prepare(
        `UPDATE vouchers SET redeemed_at = datetime('now'), code_cipher = NULL, redeemed_by_family_id = @guestId
         WHERE code_hash = @codeHash AND redeemed_at IS NULL AND revoked_at IS NULL
           AND (expires_at IS NULL OR expires_at > datetime('now'))`
      )
      .run({ guestId, codeHash })
    if (claim.changes !== 1) throw httpError(410, 'Dieser Code wurde inzwischen verändert')

    addVisit(guestId, hostId, voucher.id)
    const host = findHome(hostId)
    return { host: { id: host.id, name: host.name } }
  })()
}

module.exports = { createVisitInvite, redeemVisitInvite, VISIT_INVITE_DAYS }
