'use strict'

// Phase V5: vouchers.gedruckt_at - wann ein offener Gutschein zuletzt auf gedruckte Karten kam. Gesetzt von jedem Druck
// mit Klartext-Codes: den Druckseiten der Stapel (routes/adminStats.js, routes/partnerArea/vouchers.js - seit Audit V7a
// erst, wenn die Seite den Druck per POST meldet) und den Visitenkarten (lib/visitenkarteGutscheine.js). Gedruckt heißt nicht verbraucht - der Code bleibt offen, bis ihn jemand
// einlöst; die Marke sorgt nur dafür, dass er nicht ein zweites Mal ausgegeben wird (Visitenkarten nehmen zuerst
// ungedruckte, der Dialog "Kunden-Gutschein weitergeben" zeigt "gedruckt", lib/voucherManage.js). Die Spalte legt dieses
// Modul selbst an (wie lib/serverHistory.js seine Tabelle) - db.js ist an seiner Dateigrenze.

const db = require('../db')

if (!db.prepare('PRAGMA table_info(vouchers)').all().some((column) => column.name === 'gedruckt_at')) {
  db.exec('ALTER TABLE vouchers ADD COLUMN gedruckt_at TEXT')
}

const markStmt = db.prepare("UPDATE vouchers SET gedruckt_at = datetime('now') WHERE id = ?")

// Vermerkt die Gutscheine ids als jetzt gedruckt (in einer Transaktion; innerhalb einer anderen als Sicherungspunkt).
const markPrinted = db.transaction((ids) => {
  for (const id of ids) markStmt.run(id)
})

// Audit V7a: die Druckseiten der Stapel lesen ihre Codes per GET (ändert nichts - ein Vorabruf oder eine fremde Seite, die
// die Adresse lädt, vermerkt so nichts) und melden den Druck danach ausdrücklich per POST …/print/gedruckt { ids } - die
// Ids der Gutscheine, die auf den Karten stehen (aus der GET-Antwort). Vermerkt werden nur Ids, die gerade druckbar sind
// (printableIds: lib/voucherPrint.js printableCodes(...).ids dieses Stapels) - fremde, eingelöste oder widerrufene zählen
// nicht. Ergebnis: wie viele vermerkt wurden. Ungültige Angaben -> 400 (err.status).
const MAX_PRINTED_IDS = 1000
const INVALID_IDS_MESSAGE = 'Bitte die Ids der gedruckten Gutscheine als Liste mitschicken.'

function validatePrintedIds(body) {
  const ids = body?.ids
  const valid = Array.isArray(ids) && ids.length <= MAX_PRINTED_IDS && ids.every((id) => Number.isSafeInteger(id) && id > 0)
  if (!valid) {
    const err = new Error(INVALID_IDS_MESSAGE)
    err.status = 400
    throw err
  }
  return [...new Set(ids)]
}

function markPrintedAmong(printableIds, ids) {
  const allowed = new Set(printableIds)
  const toMark = ids.filter((id) => allowed.has(id))
  markPrinted(toMark)
  return toMark.length
}

module.exports = { markPrinted, validatePrintedIds, markPrintedAmong, MAX_PRINTED_IDS }
