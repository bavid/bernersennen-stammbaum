const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const Database = require('better-sqlite3')

// Geschlecht „weiß ich nicht“: der CHECK auf dogs.geschlecht lernt 'unbekannt'. SQLite kann einen CHECK nicht per ALTER
// ändern, darum ein einmaliger Umbau (lib/dogsSchema.js, lib/tableRebuild.js - wie bei partners und promotions). Alle
// Zeilen, Ids, der Zähler und alle Verweise auf Tiere (Chronik, Eltern, Würfe, Mitbewohner) bleiben erhalten.
const SERVER_DIR = path.join(__dirname, '..')

// Das dogs-Schema vor dem Umbau (wörtlich aus db.js, mit den später per ALTER angehängten Spalten), dazu die Tabellen, die
// auf Tiere verweisen.
const OLD_SCHEMA_SQL = `
  CREATE TABLE families (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE dogs (
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
  ALTER TABLE dogs ADD COLUMN rasse TEXT;
  ALTER TABLE dogs ADD COLUMN name_unbekannt INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE dogs ADD COLUMN tierart TEXT NOT NULL DEFAULT 'hund';
  CREATE TABLE timeline_entries (
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
  CREATE TABLE breeding_events (
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
  CREATE TABLE notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_id INTEGER NOT NULL REFERENCES families(id),
    autor_name TEXT NOT NULL,
    text TEXT NOT NULL,
    termin_datum TEXT,
    termin_zeit TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_dogs_family ON dogs(family_id);
  CREATE INDEX idx_dogs_mother ON dogs(mother_dog_id);
  CREATE INDEX idx_dogs_father ON dogs(father_dog_id);
`

const OLD_COLUMNS = [
  'id', 'family_id', 'name', 'geschlecht', 'geburtsdatum', 'farbe_markings', 'mother_dog_id', 'father_dog_id',
  'mother_freitext', 'father_freitext', 'foto_url', 'beschreibung', 'created_at', 'rasse', 'name_unbekannt', 'tierart'
]

function seedOldDatabase(dbFile) {
  const seedDb = new Database(dbFile)
  seedDb.pragma('foreign_keys = ON')
  seedDb.exec(OLD_SCHEMA_SQL)
  seedDb.prepare("INSERT INTO families (name, password_hash) VALUES ('Familie am Deich', 'x')").run()
  const insert = seedDb.prepare(
    `INSERT INTO dogs (family_id, name, geschlecht, geburtsdatum, mother_dog_id, father_dog_id, father_freitext, rasse, tierart, created_at)
     VALUES (1, @name, @geschlecht, @geburtsdatum, @mother, @father, @fatherText, @rasse, @tierart, @created)`
  )
  const base = { geburtsdatum: null, mother: null, father: null, fatherText: null, rasse: null, tierart: 'hund' }
  insert.run({ ...base, name: 'Aiko', geschlecht: 'huendin', geburtsdatum: '2019-03-01', rasse: 'Berner Sennenhund', created: '2026-01-01 10:00:00' })
  insert.run({ ...base, name: 'Hermes', geschlecht: 'ruede', created: '2026-01-02 10:00:00' })
  insert.run({ ...base, name: 'Benno', geschlecht: 'ruede', mother: 1, father: 2, created: '2026-01-03 10:00:00' })
  insert.run({ ...base, name: 'Flocke', geschlecht: 'huendin', tierart: 'katze', fatherText: 'Kater vom Hof', created: '2026-01-04 10:00:00' })
  // Das Tier mit der höchsten Id wurde gelöscht - seine Id darf nach dem Umbau nicht neu vergeben werden.
  insert.run({ ...base, name: 'Gelöscht', geschlecht: 'ruede', created: '2026-01-05 10:00:00' })
  seedDb.prepare("DELETE FROM dogs WHERE name = 'Gelöscht'").run()
  seedDb.prepare("INSERT INTO timeline_entries (dog_id, family_id, autor_name, datum, titel) VALUES (3, 1, 'Wir', '2026-02-01', 'Erster Schnee')").run()
  seedDb.prepare("INSERT INTO breeding_events (family_id, mutter_dog_id, vater_dog_id, datum) VALUES (1, 1, 2, '2025-12-01')").run()
  // Ein Altfehler, der nichts mit dogs zu tun hat (Zettel einer längst gelöschten Familie): er darf den Umbau nicht verhindern.
  seedDb.pragma('foreign_keys = OFF')
  seedDb.prepare("INSERT INTO notes (family_id, autor_name, text) VALUES (99, 'Wir', 'Alter Zettel')").run()
  seedDb.close()
}

function runMigration(dir, dbFile) {
  const script = "const db = require('./db'); process.stdout.write(String(db.pragma('foreign_keys', { simple: true }))); db.close()"
  return execFileSync(process.execPath, ['-e', script], {
    cwd: SERVER_DIR,
    env: { ...process.env, DATA_DIR: dir, DB_PATH: dbFile, JWT_SECRET: 'test-secret' },
    stdio: ['ignore', 'pipe', 'pipe']
  }).toString()
}

function snapshot(dbFile) {
  const checkDb = new Database(dbFile, { readonly: true })
  const schema = checkDb.prepare("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all()
  const dogs = checkDb.prepare('SELECT * FROM dogs ORDER BY id').all()
  checkDb.close()
  return { schema, dogs }
}

test('Migration: dogs wird einmalig umgebaut (Geschlecht "unbekannt"), Tiere, Ids und Verweise bleiben erhalten', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronik-dogs-rebuild-'))
  const dbFile = path.join(dir, 'old.db')
  try {
    seedOldDatabase(dbFile)
    const before = new Database(dbFile, { readonly: true })
    const oldRows = before.prepare(`SELECT ${OLD_COLUMNS.join(', ')} FROM dogs ORDER BY id`).all()
    before.close()
    assert.equal(oldRows.length, 4)

    assert.equal(runMigration(dir, dbFile), '1', 'foreign_keys muss nach dem Umbau wieder ON sein')

    const migrated = new Database(dbFile)
    migrated.pragma('foreign_keys = ON')
    const tableSql = migrated.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'dogs'").get().sql
    assert.match(tableSql, /CHECK\(geschlecht IN \('ruede','huendin','unbekannt'\)\)/)
    assert.equal(
      migrated.prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE name = 'dogs_neu' OR sql LIKE '%dogs_neu%'").get().c,
      0,
      'kein Rest von dogs_neu im Schema'
    )

    // Alte Spalten unverändert, die später angehängten Spalten (z. B. Vermittlung, Steckbrief) leer
    assert.deepEqual(migrated.prepare(`SELECT ${OLD_COLUMNS.join(', ')} FROM dogs ORDER BY id`).all(), oldRows)
    for (const row of migrated.prepare('SELECT vermittlung_status, public_slug, bei_uns_seit FROM dogs').all()) {
      assert.deepEqual(row, { vermittlung_status: null, public_slug: null, bei_uns_seit: null })
    }

    // Verweise auf Tiere: Chronik, Eltern und Würfe zeigen weiter auf dieselben Tiere
    assert.equal(migrated.prepare('SELECT d.name FROM timeline_entries t JOIN dogs d ON d.id = t.dog_id').get().name, 'Benno')
    assert.deepEqual(
      migrated.prepare('SELECT m.name AS mutter, v.name AS vater FROM dogs d JOIN dogs m ON m.id = d.mother_dog_id JOIN dogs v ON v.id = d.father_dog_id').get(),
      { mutter: 'Aiko', vater: 'Hermes' }
    )
    assert.equal(migrated.prepare('SELECT COUNT(*) AS c FROM breeding_events b JOIN dogs m ON m.id = b.mutter_dog_id').get().c, 1)
    // Nur der Altfehler der Zettel ist übrig - der Umbau hat keinen neuen hinterlassen.
    assert.deepEqual(migrated.pragma('foreign_key_check').map((row) => row.table), ['notes'])

    // Indizes da, "unbekannt" geht, andere Werte weiterhin nicht, die gelöschte Id bleibt frei
    const indexes = migrated.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'dogs'").all().map((r) => r.name)
    for (const name of ['idx_dogs_family', 'idx_dogs_mother', 'idx_dogs_father', 'idx_dogs_public_slug']) assert.ok(indexes.includes(name), name)
    const newId = migrated.prepare("INSERT INTO dogs (family_id, name, geschlecht) VALUES (1, 'Wilma', 'unbekannt')").run().lastInsertRowid
    assert.ok(newId > 5, 'die Id des gelöschten Tiers (5) wird nicht neu vergeben')
    assert.throws(() => migrated.prepare("INSERT INTO dogs (family_id, name, geschlecht) VALUES (1, 'x', 'divers')").run(), /CHECK/)
    assert.throws(() => migrated.prepare("INSERT INTO dogs (family_id, name, geschlecht) VALUES (1, 'x', NULL)").run(), /NOT NULL/)
    assert.equal(migrated.pragma('integrity_check', { simple: true }), 'ok')
    migrated.prepare('DELETE FROM dogs WHERE id = ?').run(newId)
    migrated.close()

    // Zweiter Start: nichts ändert sich mehr (weder Schema noch Daten)
    const afterFirst = snapshot(dbFile)
    runMigration(dir, dbFile)
    assert.deepEqual(snapshot(dbFile), afterFirst)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('Neue Datenbank: dogs entsteht gleich mit "unbekannt" und allen Spalten - kein Umbau nötig', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronik-dogs-new-'))
  const dbFile = path.join(dir, 'new.db')
  try {
    runMigration(dir, dbFile)
    const first = snapshot(dbFile)
    const dogsSql = first.schema.find((row) => row.type === 'table' && row.name === 'dogs').sql
    assert.match(dogsSql, /'unbekannt'/)
    const checkDb = new Database(dbFile, { readonly: true })
    const columns = checkDb.prepare('PRAGMA table_info(dogs)').all().map((column) => column.name)
    checkDb.close()
    for (const column of ['rasse', 'tierart', 'name_unbekannt', 'bei_uns_seit', 'herkunft_text', 'vermittlung_status', 'public_slug']) {
      assert.ok(columns.includes(column), column)
    }
    runMigration(dir, dbFile)
    assert.deepEqual(snapshot(dbFile), first)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
