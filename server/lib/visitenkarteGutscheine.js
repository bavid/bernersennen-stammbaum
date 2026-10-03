'use strict'

// Phase V5: Gutschein-Codes für Visitenkarten - jede gedruckte Karte bekommt einen eigenen offenen Code aus dem
// Kunden-Stapel des Partners (lib/partnerStacks.js: Admin-Partner-Stapel und Weitergabe des eigenen Bereichs, nie ein
// fremder Code). Wer Codes für den Druck holt, vermerkt sie als gedruckt (vouchers.gedruckt_at), damit sie nicht ein
// zweites Mal auf Karten landen; "nur ungedruckte" lässt sich für einen Neudruck abschalten. Gedruckt heißt nicht
// verbraucht: der Code bleibt offen, bis ihn jemand einlöst. Klartext entsteht nur hier (lib/voucherPrint.js
// printableCode) und geht nur in die Antwort - nie ins Protokoll. Die Spalte legt dieses Modul selbst an (wie
// lib/visitenkarte.js die Tabelle) - db.js ist an seiner Dateigrenze.

const db = require('../db')
const { OWN_STACK_SQL, ownStackParams } = require('./partnerStacks')
const { printableCode } = require('./voucherPrint')

const MAX_CODES_PER_REQUEST = 50
const ADMIN_STACK_KIND = 'partner'

if (!db.prepare('PRAGMA table_info(vouchers)').all().some((column) => column.name === 'gedruckt_at')) {
  db.exec('ALTER TABLE vouchers ADD COLUMN gedruckt_at TEXT')
}

// Offen und weitergebbar: weder eingelöst noch zurückgezogen noch abgelaufen, mit Geheimtext, nicht vom Ersteller
// gelöscht und keiner Anfrage zugewiesen (lib/anfrageGutschein.js) - die Endkontrolle macht printableCode.
const OPEN_SQL = `
  v.revoked_at IS NULL AND v.redeemed_at IS NULL
  AND (v.expires_at IS NULL OR v.expires_at > datetime('now'))
  AND v.code_cipher IS NOT NULL AND v.ausgeblendet_at IS NULL AND v.zugewiesen_an_anfrage_id IS NULL`

const countsStmt = db.prepare(`
  SELECT COUNT(*) AS offen, COUNT(CASE WHEN v.gedruckt_at IS NULL THEN 1 END) AS ungedruckt
  FROM vouchers v JOIN voucher_batches b ON b.id = v.batch_id
  WHERE ${OWN_STACK_SQL} AND ${OPEN_SQL}`)

// Ungedruckte zuerst, dann die am längsten gedruckten; innerhalb davon die Admin-Partner-Stapel (zum Drucken gedacht)
// vor den Weitergabe-Codes, sonst in der Reihenfolge, in der sie entstanden sind.
const candidatesStmt = db.prepare(`
  SELECT v.id, v.code_cipher, v.redeemed_at, v.revoked_at, v.expires_at
  FROM vouchers v JOIN voucher_batches b ON b.id = v.batch_id
  WHERE ${OWN_STACK_SQL} AND ${OPEN_SQL} AND (@alle = 1 OR v.gedruckt_at IS NULL)
  ORDER BY v.gedruckt_at IS NOT NULL, v.gedruckt_at, CASE WHEN b.kind = '${ADMIN_STACK_KIND}' THEN 0 ELSE 1 END, v.id`)

const markStmt = db.prepare("UPDATE vouchers SET gedruckt_at = datetime('now') WHERE id = ?")

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

// { anzahl, nurUngedruckt } aus dem Body - anzahl ganzzahlig 1 bis MAX_CODES_PER_REQUEST, nurUngedruckt Boolean
// (fehlt es: true).
function validateCodeRequest(body) {
  const { anzahl, nurUngedruckt = true } = body && typeof body === 'object' && !Array.isArray(body) ? body : {}
  if (!Number.isInteger(anzahl) || anzahl < 1 || anzahl > MAX_CODES_PER_REQUEST) {
    throw httpError(400, `Die Anzahl muss eine ganze Zahl von 1 bis ${MAX_CODES_PER_REQUEST} sein`)
  }
  if (typeof nurUngedruckt !== 'boolean') throw httpError(400, '„nurUngedruckt“ muss true oder false sein')
  return { anzahl, nurUngedruckt }
}

// { offen, ungedruckt } - nur Zahlen, nie Codes. owner: { partnerId, familyId }.
function stackCounts(owner) {
  return countsStmt.get(ownStackParams(owner))
}

// Holt bis zu anzahl offene Codes (formatiert XXXX-XXXX-XXXX) und vermerkt sie als gedruckt - in einer Transaktion,
// damit zwei gleichzeitige Abrufe nie denselben ungedruckten Code bekommen. Ein Code, dessen Geheimtext sich nicht
// lesen lässt, wird übersprungen (und nicht vermerkt). Gibt { codes, fehlen, gutscheine } zurück.
const takeCodesForPrint = db.transaction((owner, { anzahl, nurUngedruckt }) => {
  const codes = []
  for (const row of candidatesStmt.all({ ...ownStackParams(owner), alle: nurUngedruckt ? 0 : 1 })) {
    if (codes.length === anzahl) break
    const code = printableCode(row)
    if (!code) continue
    markStmt.run(row.id)
    codes.push(code)
  }
  return { codes, fehlen: anzahl - codes.length, gutscheine: stackCounts(owner) }
})

module.exports = { MAX_CODES_PER_REQUEST, validateCodeRequest, stackCounts, takeCodesForPrint }
