'use strict'

// Hinweis-Glocke (client/src/components/hinweise): neue Grüße zu den eigenen Erinnerungen. Ein Gruß ist ein Kommentar
// (entry_comments) einer anderen Identität (author_family_id - ein Gast aus einem befreundeten Zuhause oder ein Mitglied
// einer gemeinsamen Familie) zu einem Eintrag des eigenen Zuhauses. „Neu“ ist er, solange er jünger ist als der Zeitpunkt,
// an dem das Zuhause zuletzt in die Glocke geschaut hat (home_hinweise_gesehen.gesehen_at, je Zuhause eine Zeile). Den
// Zeitpunkt setzt nur der Server (datetime('now'), dasselbe Format wie entry_comments.created_at - so vergleicht SQLite
// die Texte richtig), nie ein Wert aus der Anfrage. Die Tabelle legt dieses Modul selbst an (db.js ist an seiner
// Dateigrenze, wie lib/darstellung.js); ON DELETE CASCADE: die Zeile geht mit dem Zuhause.
// Nur ein Zeitfenster (GRUESSE_TAGE) und höchstens MAX_GRUESSE - die Glocke ist ein ruhiger Hinweis, kein Archiv; den
// Text des Grußes liest man beim Eintrag selbst.

const db = require('../db')

const GRUESSE_TAGE = 30
const MAX_GRUESSE = 20

db.exec(`
  CREATE TABLE IF NOT EXISTS home_hinweise_gesehen (
    family_id INTEGER PRIMARY KEY REFERENCES families(id) ON DELETE CASCADE,
    gesehen_at TEXT NOT NULL
  );
`)

// Grüße an das Zuhause @homeId im Zeitfenster. Der Name ist der, den der Eintrag ohnehin zeigt: bei einem Gast der echte
// Name seines Zuhauses (wie routes/timeline.js GUEST_HOME_JOIN_SQL), sonst der beim Grüßen angegebene Name.
const GREETINGS_FROM_SQL = `FROM entry_comments c
  JOIN timeline_entries t ON t.id = c.entry_id
  LEFT JOIN families gf ON gf.id = c.family_id AND c.family_id != t.family_id AND gf.art = 'zuhause'
  LEFT JOIN home_hinweise_gesehen g ON g.family_id = @homeId
  WHERE t.family_id = @homeId AND c.author_family_id IS NOT NULL AND c.author_family_id != @homeId
    AND c.created_at >= datetime('now', '-${GRUESSE_TAGE} days')`
const NEW_SQL = '(g.gesehen_at IS NULL OR c.created_at > g.gesehen_at)'

const listStmt = db.prepare(
  `SELECT c.id, c.entry_id AS entryId, t.dog_id AS dogId, t.titel, c.created_at AS createdAt,
     COALESCE(gf.name, c.autor_name) AS von, ${NEW_SQL} AS neu
   ${GREETINGS_FROM_SQL}
   ORDER BY c.created_at DESC, c.id DESC
   LIMIT ${MAX_GRUESSE}`
)
const countStmt = db.prepare(`SELECT COUNT(*) AS c ${GREETINGS_FROM_SQL} AND ${NEW_SQL}`)
const markStmt = db.prepare(
  `INSERT INTO home_hinweise_gesehen (family_id, gesehen_at) VALUES (?, datetime('now'))
   ON CONFLICT(family_id) DO UPDATE SET gesehen_at = excluded.gesehen_at`
)

// [{ id, entryId, dogId, titel, von, createdAt, neu }], neueste zuerst.
function greetingsFor(homeId) {
  return listStmt.all({ homeId }).map((row) => ({ ...row, neu: Boolean(row.neu) }))
}

function countNewGreetings(homeId) {
  return countStmt.get({ homeId }).c
}

// „Gesehen“: alles bis jetzt ist nicht mehr neu.
function markGreetingsSeen(homeId) {
  markStmt.run(homeId)
}

module.exports = { GRUESSE_TAGE, MAX_GRUESSE, greetingsFor, countNewGreetings, markGreetingsSeen }
