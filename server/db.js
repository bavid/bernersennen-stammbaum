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
  CREATE INDEX IF NOT EXISTS idx_timeline_family_created ON timeline_entries(family_id, created_at);
`)

// Spalten, die nach dem ersten Release dazukamen – bestehende Datenbanken werden ergänzt.
function addColumnIfMissing(table, column, definition) {
  const exists = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column)
  if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}

addColumnIfMissing('dogs', 'rasse', 'TEXT')
addColumnIfMissing('dogs', 'name_unbekannt', 'INTEGER NOT NULL DEFAULT 0')

module.exports = db
