'use strict'

// Phase V2b: eigene Einladungen verwalten - Obergrenze offener Codes, Beschriftung, Löschen und Archiv
// (routes/vouchers.js, routes/besuche.js über lib/visitInvites.js).
// - Eine Privatperson (ein Zuhause; ebenso eine Familie, die mit ihrem gemeinsamen Schlüssel angemeldet ist) hat
//   höchstens MAX_OPEN_CODES offene Codes gleichzeitig - Familien-Einladungen, Besuchs-Einladungen und Gutscheine
//   zum Weitergeben zusammen. Gezählt wird, was sie angelegt hat (vouchers.created_by_family_id) und noch verwalten
//   kann (im eigenen Zuhause oder in einer Familie, in der sie Mitglied ist). Partner und Tierheime: keine Grenze.
// - Die Beschriftung (label) setzt und sieht nur, wer den Code angelegt hat.
// - Löschen zieht einen offenen Code zurück und blendet ihn aus (die Zeile bleibt für die Statistik).
// - Eingelöste Codes stehen im Archiv (GET /api/vouchers/mine?archiv=1).

const { formatCode, decryptCode } = require('./codes')
const { createBatch, voucherStatus, inviteRoleOf, issuingPartnerId } = require('./vouchers')
const { ART } = require('./areaArt')
// Phase V5: legt vouchers.gedruckt_at an - die Liste zeigt, welche Codes schon auf gedruckten Karten stehen.
require('./voucherGedruckt')

const MAX_OPEN_CODES = 5
const MAX_LABEL_LENGTH = 60
const LIMIT_MESSAGE = `Du hast schon ${MAX_OPEN_CODES} offene Codes. Ein neuer geht erst, wenn einer eingelöst, zurückgezogen oder abgelaufen ist.`
const NO_SUCH_CODE_MESSAGE = 'Diesen Code gibt es nicht'

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

const OPEN_SQL = `v.redeemed_at IS NULL AND v.revoked_at IS NULL AND (v.expires_at IS NULL OR v.expires_at > datetime('now'))`

function isCapped(db, homeId) {
  const art = db.prepare('SELECT art FROM families WHERE id = ?').get(homeId)?.art
  return art === ART.zuhause || art === ART.rudel
}

function countOpenCodes(db, homeId) {
  return db
    .prepare(
      `SELECT COUNT(*) AS c FROM vouchers v
       WHERE v.created_by_family_id = @homeId AND v.dog_id IS NULL AND ${OPEN_SQL}
         AND (v.issued_by_family_id = @homeId
              OR v.issued_by_family_id IN (SELECT group_family_id FROM family_members WHERE member_family_id = @homeId))`
    )
    .get({ homeId }).c
}

// Wie viele Codes darf homeId gerade noch anlegen? (Infinity ohne Grenze)
function openSlotsFor(db, homeId) {
  if (!isCapped(db, homeId)) return Infinity
  return Math.max(0, MAX_OPEN_CODES - countOpenCodes(db, homeId))
}

function assertOpenCodeSlot(db, homeId) {
  if (openSlotsFor(db, homeId) <= 0) throw httpError(409, LIMIT_MESSAGE)
}

// { offen, max, frei } - max/frei null, wenn für homeId keine Grenze gilt.
function limitInfo(db, homeId) {
  const offen = countOpenCodes(db, homeId)
  if (!isCapped(db, homeId)) return { offen, max: null, frei: null }
  return { offen, max: MAX_OPEN_CODES, frei: Math.max(0, MAX_OPEN_CODES - offen) }
}

// Eine Zeile für die Liste "Meine Codes". label nur für den Ersteller (viewerId), eigen: viewerId hat ihn angelegt.
// Ein beschädigter Geheimtext darf nicht die ganze Liste mit 500 abbrechen (security-review Phase V2, INFO): der Code
// erscheint dann ohne Klartext, mit codeFehler - der Client bittet darum, ihn zurückzuziehen.
function readableCode(row) {
  if (!row.code_cipher) return { code: null, codeFehler: true }
  try {
    return { code: formatCode(decryptCode(row.code_cipher)), codeFehler: false }
  } catch {
    console.warn(`[vouchers] Gutschein ${row.id}: Geheimtext nicht lesbar`)
    return { code: null, codeFehler: true }
  }
}

function toListItem(row, viewerId) {
  const status = voucherStatus(row)
  const eigen = viewerId !== null && row.created_by_family_id === viewerId
  const { code, codeFehler } = status === 'offen' ? readableCode(row) : { code: null, codeFehler: false }
  return {
    id: row.id,
    code,
    ...(codeFehler ? { codeFehler: true } : {}),
    hint: row.code_hint,
    status,
    joins: Boolean(row.join_family_id),
    rolle: row.join_family_id ? inviteRoleOf(row) : null,
    besuch: Boolean(row.visit_host_family_id),
    expires_at: row.expires_at,
    redeemed_at: row.redeemed_at,
    created_at: row.created_at,
    eigen,
    label: eigen ? row.label : null,
    // Phase V5: steht schon auf gedruckten Karten (Visitenkarten oder Druckseite eines Stapels) - nicht noch einmal
    // weitergeben.
    gedruckt: Boolean(row.gedruckt_at),
    ...(row.redeemed_at ? { neueChronik: Boolean(row.neue_chronik) } : {})
  }
}

const LIST_COLUMNS_SQL = `v.id, v.code_cipher, v.code_hint, v.redeemed_at, v.revoked_at, v.expires_at, v.join_family_id, v.join_rolle,
  v.created_at, v.visit_host_family_id, v.created_by_family_id, v.label, v.gedruckt_at,
  EXISTS (SELECT 1 FROM families nf WHERE nf.voucher_id = v.id) AS neue_chronik`

// Codes des Bereichs areaId (ohne Übergabe-Gutscheine und ohne gelöschte): archiv false -> alles noch nicht
// Eingelöste (offen, abgelaufen, zurückgezogen), archiv true -> die eingelösten. viewerId: siehe toListItem.
// Phase V5: ungedruckte Codes zuerst - die gibt man am besten weiter.
// Abgelaufene Codes brauchen ihren Geheimtext nicht mehr (security-review Phase V2, INFO) - beim Lesen weg damit.
function clearExpiredCiphers(db, areaId) {
  db.prepare(
    `UPDATE vouchers SET code_cipher = NULL
     WHERE issued_by_family_id = ? AND code_cipher IS NOT NULL AND redeemed_at IS NULL AND revoked_at IS NULL
       AND expires_at IS NOT NULL AND expires_at <= datetime('now')`
  ).run(areaId)
}

function listVouchers(db, { areaId, viewerId, archiv = false }) {
  clearExpiredCiphers(db, areaId)
  return db
    .prepare(
      `SELECT ${LIST_COLUMNS_SQL} FROM vouchers v
       WHERE v.issued_by_family_id = @areaId AND v.dog_id IS NULL AND v.ausgeblendet_at IS NULL
         AND ${archiv ? 'v.redeemed_at IS NOT NULL' : 'v.redeemed_at IS NULL'}
       ORDER BY ${archiv ? '' : 'v.gedruckt_at IS NOT NULL, '}v.created_at DESC, v.id DESC`
    )
    .all({ areaId })
    .map((row) => toListItem(row, viewerId))
}

function findListItem(db, id, viewerId) {
  const row = db.prepare(`SELECT ${LIST_COLUMNS_SQL} FROM vouchers v WHERE v.id = ?`).get(id)
  return row ? toListItem(row, viewerId) : null
}

// Ein neuer Gutschein zum Weitergeben für den Bereich area (Zuhause oder Familie - dann mit Beitritt), angelegt von
// homeId. Grenze und Anlegen in EINER Transaktion: zwei gleichzeitige Anfragen können sie nicht überschreiten.
function createPassOnCode(db, area, homeId) {
  if (area.art !== ART.zuhause && area.art !== ART.rudel) throw httpError(400, 'Neue Codes gibt es nur in einem Zuhause oder einer Familie')
  const voucherId = db.transaction(() => {
    assertOpenCodeSlot(db, homeId)
    const { batchId } = createBatch(db, {
      label: `Weitergabe ${area.name}`,
      kind: 'rudel',
      size: 1,
      issuedByFamilyId: area.id,
      joinFamilyId: area.art === ART.rudel ? area.id : null,
      partnerId: issuingPartnerId(db, area),
      createdByFamilyId: homeId
    })
    return db.prepare('SELECT id FROM vouchers WHERE batch_id = ?').get(batchId).id
  })()
  return findListItem(db, voucherId, homeId)
}

function cleanLabel(value) {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') throw httpError(400, 'Die Beschriftung muss ein Text sein')
  const trimmed = value.trim().replace(/\s+/g, ' ')
  if (trimmed.length > MAX_LABEL_LENGTH) throw httpError(400, `Die Beschriftung darf höchstens ${MAX_LABEL_LENGTH} Zeichen haben`)
  return trimmed || null
}

// Beschriftung setzen - nur am eigenen (selbst angelegten), nicht gelöschten Code; sonst 404.
function setLabel(db, { id, homeId, label }) {
  const clean = cleanLabel(label)
  const result = Number.isInteger(id)
    ? db
        .prepare('UPDATE vouchers SET label = ? WHERE id = ? AND created_by_family_id = ? AND ausgeblendet_at IS NULL AND dog_id IS NULL')
        .run(clean, id, homeId)
    : { changes: 0 }
  if (!result.changes) throw httpError(404, NO_SUCH_CODE_MESSAGE)
  return { id, label: clean }
}

// Einen noch nicht eingelösten Code zurückziehen und ausblenden: den eigenen immer, einen anderen des aktiven
// Bereichs nur mit mayModerate (im eigenen Zuhause bzw. ab Stellvertretung in einer Familie). Sonst 404.
function deleteCode(db, { id, homeId, areaId, mayModerate }) {
  const result = Number.isInteger(id)
    ? db
        .prepare(
          `UPDATE vouchers SET revoked_at = COALESCE(revoked_at, datetime('now')), code_cipher = NULL,
             ausgeblendet_at = datetime('now')
           WHERE id = @id AND redeemed_at IS NULL AND ausgeblendet_at IS NULL AND dog_id IS NULL
             AND (created_by_family_id = @homeId OR (@mayModerate = 1 AND issued_by_family_id = @areaId))`
        )
        .run({ id, homeId, areaId, mayModerate: mayModerate ? 1 : 0 })
    : { changes: 0 }
  if (!result.changes) throw httpError(404, NO_SUCH_CODE_MESSAGE)
}

module.exports = {
  MAX_OPEN_CODES,
  MAX_LABEL_LENGTH,
  LIMIT_MESSAGE,
  countOpenCodes,
  openSlotsFor,
  assertOpenCodeSlot,
  limitInfo,
  listVouchers,
  createPassOnCode,
  setLabel,
  deleteCode
}
