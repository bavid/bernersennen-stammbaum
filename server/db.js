const fs = require('node:fs')
const path = require('node:path')
const Database = require('better-sqlite3')
const { dbPath } = require('./config')

fs.mkdirSync(path.dirname(dbPath), { recursive: true })
const db = new Database(dbPath)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS families (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS dogs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_id INTEGER NOT NULL REFERENCES families(id),
    name TEXT NOT NULL,
    geschlecht TEXT CHECK(geschlecht IN ('ruede','huendin')) NOT NULL,
    geburtsdatum TEXT,
    farbe_markings TEXT,
    mother_dog_id INTEGER REFERENCES dogs(id),
    father_dog_id INTEGER REFERENCES dogs(id),
    mother_freitext TEXT,
    father_freitext TEXT,
    foto_url TEXT,
    beschreibung TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS timeline_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dog_id INTEGER NOT NULL REFERENCES dogs(id),
    family_id INTEGER NOT NULL REFERENCES families(id),
    autor_name TEXT NOT NULL,
    datum TEXT NOT NULL,
    titel TEXT NOT NULL,
    text TEXT,
    foto_urls TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS breeding_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_id INTEGER NOT NULL REFERENCES families(id),
    mutter_dog_id INTEGER NOT NULL REFERENCES dogs(id),
    vater_dog_id INTEGER REFERENCES dogs(id),
    vater_freitext TEXT,
    datum TEXT NOT NULL,
    wurf_info TEXT,
    foto_urls TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_dogs_family ON dogs(family_id);
  CREATE INDEX IF NOT EXISTS idx_dogs_mother ON dogs(mother_dog_id);
  CREATE INDEX IF NOT EXISTS idx_dogs_father ON dogs(father_dog_id);
  CREATE INDEX IF NOT EXISTS idx_timeline_dog ON timeline_entries(dog_id, datum);
  CREATE INDEX IF NOT EXISTS idx_breeding_family ON breeding_events(family_id, datum);

  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_id INTEGER NOT NULL REFERENCES families(id),
    autor_name TEXT NOT NULL,
    text TEXT NOT NULL,
    termin_datum TEXT,
    termin_zeit TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_notes_family ON notes(family_id, created_at);

  CREATE TABLE IF NOT EXISTS note_replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id INTEGER NOT NULL REFERENCES notes(id),
    family_id INTEGER NOT NULL REFERENCES families(id),
    autor_name TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_note_replies_note ON note_replies(note_id, created_at);

  -- Kommentare anderer Mitglieder zu Chronik-Einträgen
  CREATE TABLE IF NOT EXISTS entry_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id INTEGER NOT NULL REFERENCES timeline_entries(id),
    family_id INTEGER NOT NULL REFERENCES families(id),
    autor_name TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_entry_comments_entry ON entry_comments(entry_id, created_at);

  CREATE TABLE IF NOT EXISTS admin_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_id INTEGER NOT NULL REFERENCES families(id),
    type TEXT CHECK(type IN ('feedback','problem')) NOT NULL,
    autor_name TEXT NOT NULL,
    contact TEXT,
    text TEXT NOT NULL,
    page TEXT,
    user_agent TEXT,
    status TEXT CHECK(status IN ('offen','erledigt')) NOT NULL DEFAULT 'offen',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_admin_messages_status ON admin_messages(status, created_at);

  -- "Lebt zusammen mit": Mitbewohner ohne gemeinsame Abstammung und andere Tiere im selben Zuhause.
  -- Ungerichtet, gespeichert mit dog_a_id < dog_b_id.
  CREATE TABLE IF NOT EXISTS dog_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_id INTEGER NOT NULL REFERENCES families(id),
    dog_a_id INTEGER NOT NULL REFERENCES dogs(id),
    dog_b_id INTEGER NOT NULL REFERENCES dogs(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (dog_a_id, dog_b_id)
  );

  CREATE INDEX IF NOT EXISTS idx_dog_links_family ON dog_links(family_id);
  CREATE INDEX IF NOT EXISTS idx_timeline_family_created ON timeline_entries(family_id, created_at);
`)

// Spalten, die nach dem ersten Release dazukamen – bestehende Datenbanken werden ergänzt.
function addColumnIfMissing(table, column, definition) {
  const exists = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column)
  if (exists) return false
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  return true
}

addColumnIfMissing('dogs', 'rasse', 'TEXT')
addColumnIfMissing('dogs', 'name_unbekannt', 'INTEGER NOT NULL DEFAULT 0')
addColumnIfMissing('dogs', 'tierart', "TEXT NOT NULL DEFAULT 'hund'")
addColumnIfMissing('families', 'quelle', 'TEXT')
addColumnIfMissing('families', 'is_demo', 'INTEGER NOT NULL DEFAULT 0')

// Bestehende Rudel behalten ihren Berner-Auftritt, neue Familien starten mit „Familie auf Pfoten".
// Spalte anlegen und Bestandsdaten umstellen als eine Transaktion, damit ein Absturz dazwischen
// nicht neue Zeilen fälschlich auf 'standard' stehen lässt, während alte noch die Spalte vermissen.
db.transaction(() => {
  if (addColumnIfMissing('families', 'theme', "TEXT NOT NULL DEFAULT 'standard'")) {
    db.exec("UPDATE families SET theme = 'berner'")
  }
})()

module.exports = db
