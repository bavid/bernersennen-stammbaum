'use strict'

// Einen CHECK kann SQLite per ALTER nicht ändern - die Tabelle wird dann einmalig neu aufgebaut, solange
// isCurrent(gespeichertes CREATE-SQL) false ist (das Muster "12 Schritte" aus
// https://www.sqlite.org/lang_altertable.html#otheralter). columnsSql ist dieselbe Spalten-Definition wie
// für neue Datenbanken, indexesSql legt die Indizes danach wieder an. Genutzt für partners (Phase P Task 1),
// promotions (Phase P2 Task 8) und dogs (Geschlecht "unbekannt", lib/dogsSchema.js). Nur mit festen
// Tabellennamen aus dem Code aufrufen (db.js) - nie mit einer Eingabe.

// Verletzte Fremdschlüssel der ganzen Datenbank als vergleichbare Schlüssel.
function foreignKeyViolations(db) {
  return new Set(db.pragma('foreign_key_check').map((row) => `${row.table}:${row.rowid}:${row.parent}:${row.fkid}`))
}

function rebuildTableIfOutdated(db, table, { columnsSql, indexesSql, isCurrent }) {
  const current = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)
  if (!current || isCurrent(current.sql)) return false

  const newTable = `${table}_neu`
  const oldColumns = db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name)
  // AUTOINCREMENT: der Umbau würde den Zähler sonst auf die höchste NOCH VORHANDENE Id zurücksetzen - die
  // Id einer schon gelöschten Zeile dürfte dann neu vergeben werden.
  const oldSequence = db.prepare('SELECT seq FROM sqlite_sequence WHERE name = ?').get(table)?.seq ?? 0
  // Nur was der Umbau selbst verletzen würde, bricht ihn ab - ein Altfehler irgendwo sonst soll den Start nicht verhindern.
  const violationsBefore = foreignKeyViolations(db)

  // Muss außerhalb jeder Transaktion umgestellt werden (innerhalb wirkt das Pragma nicht).
  db.pragma('foreign_keys = OFF')
  try {
    db.transaction(() => {
      db.exec(`CREATE TABLE ${newTable} (${columnsSql})`)
      const newColumns = new Set(db.prepare(`PRAGMA table_info(${newTable})`).all().map((column) => column.name))
      const lost = oldColumns.filter((column) => !newColumns.has(column))
      // Lieber gar nicht umbauen (Rollback) als stillschweigend eine Spalte samt Daten verlieren.
      if (lost.length) throw new Error(`Umbau von ${table} abgebrochen - unbekannte Spalten: ${lost.join(', ')}`)

      const columnList = oldColumns.join(', ')
      db.exec(`INSERT INTO ${newTable} (${columnList}) SELECT ${columnList} FROM ${table}`)
      db.exec(`DROP TABLE ${table}`)
      db.exec(`ALTER TABLE ${newTable} RENAME TO ${table}`)
      db.exec(indexesSql)

      const sequence = db.prepare('SELECT seq FROM sqlite_sequence WHERE name = ?').get(table)
      if (!sequence) {
        if (oldSequence > 0) db.prepare('INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)').run(table, oldSequence)
      } else if (sequence.seq < oldSequence) {
        db.prepare('UPDATE sqlite_sequence SET seq = ? WHERE name = ?').run(oldSequence, table)
      }

      const violations = [...foreignKeyViolations(db)].filter((key) => !violationsBefore.has(key))
      if (violations.length) throw new Error(`Umbau von ${table} abgebrochen - Fremdschlüssel verletzt: ${violations.join(', ')}`)
    })()
  } finally {
    db.pragma('foreign_keys = ON')
  }
  return true
}

module.exports = { rebuildTableIfOutdated }
