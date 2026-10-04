'use strict'

// Einladungskarten von früher: bis zur Feedback-Runde speicherte jeder Partner die Vorderseite seiner Einladungskarte
// getrennt von der Visitenkarte (eine Zeile je Partner in partner_einladungskarte, design als JSON). Seitdem gibt es EINE
// Gestaltung für alle Kombinationen (lib/visitenkarte.js) - diese Tabelle wird nur noch gelesen, bis der Partner das
// nächste Mal speichert (dann führt lib/visitenkarteDesign.js mergeLegacyDesigns sie zusammen und die Zeile fällt weg).
// Die Tabelle legt dieses Modul selbst an (db.js ist an seiner Dateigrenze), bewusst ohne REFERENCES auf partners(id);
// is_demo markiert die Zeilen des Demo-Packs.

const db = require('../db')

db.exec(`
  CREATE TABLE IF NOT EXISTS partner_einladungskarte (
    partner_id INTEGER PRIMARY KEY,
    design TEXT NOT NULL,
    is_demo INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`)

const findStmt = db.prepare('SELECT design FROM partner_einladungskarte WHERE partner_id = ?')
const removeStmt = db.prepare('DELETE FROM partner_einladungskarte WHERE partner_id = ?')

// Die frühere Einladungskarte als JSON-Text, sonst null.
function readLegacyEinladung(partnerId) {
  return findStmt.get(partnerId)?.design ?? null
}

function removeLegacyEinladung(partnerId) {
  removeStmt.run(partnerId)
}

// Demo-Pack: die Zeilen der Demo-Partner (is_demo = 1) und der Partner des letzten Laufs wegräumen.
function removeDemoEinladungskarten(previousPartnerIds = []) {
  const placeholders = previousPartnerIds.map(() => '?').join(', ')
  const where = previousPartnerIds.length ? `is_demo = 1 OR partner_id IN (${placeholders})` : 'is_demo = 1'
  db.prepare(`DELETE FROM partner_einladungskarte WHERE ${where}`).run(...previousPartnerIds)
}

module.exports = { readLegacyEinladung, removeLegacyEinladung, removeDemoEinladungskarten }
