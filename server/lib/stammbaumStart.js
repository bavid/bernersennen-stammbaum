'use strict'

// Stammbaum als Startansicht (families.stammbaum_start): für ein bestehendes Rudel aus der alten App, dessen Start immer
// der Stammbaum war. 1 = der Client öffnet den Stammbaum statt „Start“ und nennt den Menüpunkt „Stammbaum“ (buildMe in
// lib/context.js meldet es als stammbaumStart). Gesetzt nur vom Betreiber (scripts/migriere-rudel-instanz.js), nie über
// die API. Die Spalte kommt hier dazu statt in db.js (dort ist kein Platz mehr) - bestehende Datenbanken beim Start.

const db = require('../db')

const COLUMN = 'stammbaum_start'

if (!db.prepare('PRAGMA table_info(families)').all().some((column) => column.name === COLUMN)) {
  db.exec(`ALTER TABLE families ADD COLUMN ${COLUMN} INTEGER NOT NULL DEFAULT 0`)
}

const readStmt = db.prepare(`SELECT ${COLUMN} AS an FROM families WHERE id = ?`)
const writeStmt = db.prepare(`UPDATE families SET ${COLUMN} = ? WHERE id = ?`)

function isStammbaumStart(familyId) {
  return Boolean(readStmt.get(familyId)?.an)
}

// Gibt zurück, ob sich etwas geändert hat (false: war schon so oder die Familie gibt es nicht).
function setStammbaumStart(familyId, an) {
  if (isStammbaumStart(familyId) === Boolean(an)) return false
  return writeStmt.run(an ? 1 : 0, familyId).changes > 0
}

module.exports = { isStammbaumStart, setStammbaumStart }
