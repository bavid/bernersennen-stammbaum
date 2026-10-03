'use strict'

// Phase V5: vouchers.gedruckt_at - wann ein offener Gutschein zuletzt auf gedruckte Karten kam. Gesetzt von jedem Druck
// mit Klartext-Codes: den Druckseiten der Stapel (routes/adminStats.js, routes/partnerArea/vouchers.js) und den
// Visitenkarten (lib/visitenkarteGutscheine.js). Gedruckt heißt nicht verbraucht - der Code bleibt offen, bis ihn jemand
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

module.exports = { markPrinted }
