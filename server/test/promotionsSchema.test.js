const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const Database = require('better-sqlite3')

// Phase P2 Task 8: promotions bekommt freigabe/ablehnungsgrund/erstellt_von_partner, und der CHECK auf
// bereich lernt 'salon' - SQLite kann einen CHECK nicht per ALTER ändern, darum ein einmaliger Umbau
// (wie bei partners, test/partnerSchema.test.js). Daten, Ids und Klick-Verweise bleiben erhalten.
const SERVER_DIR = path.join(__dirname, '..')

// Das promotions-Schema aus Phase 3 (wörtlich aus db.js vor Phase P2), dazu link_clicks.
const OLD_SCHEMA_SQL = `
  CREATE TABLE promotions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partner_id INTEGER,
    bereich TEXT NOT NULL CHECK (bereich IN ('futter','hundeschule','begleiter','unterstuetzen')),
    kennzeichnung TEXT NOT NULL CHECK (kennzeichnung IN ('Anzeige','Empfehlung','Partner')),
    empfohlen_von TEXT, titel TEXT NOT NULL, text TEXT, url TEXT,
    bild_file TEXT, tierart TEXT, aktiv INTEGER NOT NULL DEFAULT 1,
    start TEXT, ende TEXT, sort INTEGER NOT NULL DEFAULT 0, is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_promotions_bereich ON promotions(bereich, aktiv);
  CREATE TABLE link_clicks (
    target_type TEXT NOT NULL, target_id INTEGER NOT NULL, tag TEXT NOT NULL, anzahl INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (target_type, target_id, tag)
  );
`

const OLD_COLUMNS = [
  'id', 'partner_id', 'bereich', 'kennzeichnung', 'empfohlen_von', 'titel', 'text', 'url', 'bild_file', 'tierart',
  'aktiv', 'start', 'ende', 'sort', 'is_demo', 'created_at'
]

function seedOldDatabase(dbFile) {
  const seedDb = new Database(dbFile)
  seedDb.exec(OLD_SCHEMA_SQL)
  const insert = seedDb.prepare(
    `INSERT INTO promotions (partner_id, bereich, kennzeichnung, empfohlen_von, titel, text, url, bild_file, aktiv, start, ende, sort, is_demo, created_at)
     VALUES (@partner_id, @bereich, @kennzeichnung, @empfohlen_von, @titel, @text, @url, @bild_file, @aktiv, @start, @ende, @sort, @is_demo, @created_at)`
  )
  const base = { partner_id: null, empfohlen_von: null, text: null, url: null, bild_file: null, aktiv: 1, start: null, ende: null, sort: 0, is_demo: 0 }
  insert.run({ ...base, bereich: 'futter', kennzeichnung: 'Anzeige', titel: 'Futterhof Altbestand', url: 'https://example.org/', created_at: '2026-01-02 03:04:05' })
  insert.run({ ...base, bereich: 'begleiter', kennzeichnung: 'Empfehlung', empfohlen_von: 'Redaktion', titel: 'Patenschaft', text: 'Zeile eins', bild_file: '00000000-0000-0000-0000-000000000000.png', aktiv: 0, start: '2026-02-01', ende: '2026-03-01', sort: 3, is_demo: 1, created_at: '2026-02-03 04:05:06' })
  // Die Empfehlung mit der höchsten Id wurde gelöscht - ihre Id darf nach dem Umbau nicht neu vergeben werden.
  insert.run({ ...base, bereich: 'unterstuetzen', kennzeichnung: 'Partner', titel: 'Gelöscht', created_at: '2026-03-04 05:06:07' })
  seedDb.prepare("DELETE FROM promotions WHERE titel = 'Gelöscht'").run()
  seedDb.prepare("INSERT INTO link_clicks (target_type, target_id, tag, anzahl) VALUES ('promotion', 1, '2026-01-05', 4)").run()
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

function schemaSnapshot(dbFile) {
  const checkDb = new Database(dbFile, { readonly: true })
  const schema = checkDb.prepare("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all()
  const promotions = checkDb.prepare('SELECT * FROM promotions ORDER BY id').all()
  checkDb.close()
  return { schema, promotions }
}

test('Migration: promotions wird einmalig umgebaut (salon, Freigabe), Daten und Ids bleiben erhalten', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronik-promotions-rebuild-'))
  const dbFile = path.join(dir, 'old.db')
  try {
    seedOldDatabase(dbFile)
    const before = new Database(dbFile, { readonly: true })
    const oldRows = before.prepare(`SELECT ${OLD_COLUMNS.join(', ')} FROM promotions ORDER BY id`).all()
    before.close()

    assert.equal(runMigration(dir, dbFile), '1', 'foreign_keys muss nach dem Umbau wieder ON sein')

    const migrated = new Database(dbFile)
    const tableSql = migrated.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'promotions'").get().sql
    assert.match(tableSql, /'salon'/)
    assert.equal(
      migrated.prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE name = 'promotions_neu' OR sql LIKE '%promotions_neu%'").get().c,
      0,
      'kein Rest von promotions_neu im Schema'
    )

    // Alte Spalten unverändert; bestehende Empfehlungen gelten als freigegeben und nicht vom Partner erstellt
    assert.deepEqual(migrated.prepare(`SELECT ${OLD_COLUMNS.join(', ')} FROM promotions ORDER BY id`).all(), oldRows)
    for (const row of migrated.prepare('SELECT freigabe, ablehnungsgrund, erstellt_von_partner FROM promotions').all()) {
      assert.deepEqual(row, { freigabe: 'freigegeben', ablehnungsgrund: null, erstellt_von_partner: 0 })
    }
    assert.equal(migrated.prepare("SELECT anzahl FROM link_clicks WHERE target_type = 'promotion' AND target_id = 1").get().anzahl, 4)

    // Indizes da, salon geht, unbekannte Bereiche und Kennzeichnungen weiterhin nicht, gelöschte Id bleibt frei
    const indexes = migrated.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'promotions'").all().map((r) => r.name)
    assert.ok(indexes.includes('idx_promotions_bereich'))
    assert.ok(indexes.includes('idx_promotions_partner'))
    const salonId = migrated.prepare("INSERT INTO promotions (bereich, kennzeichnung, titel) VALUES ('salon', 'Anzeige', 'Salon neu')").run().lastInsertRowid
    assert.ok(salonId > 3, 'die Id der gelöschten Empfehlung (3) wird nicht neu vergeben')
    assert.throws(() => migrated.prepare("INSERT INTO promotions (bereich, kennzeichnung, titel) VALUES ('zucht', 'Anzeige', 'x')").run(), /CHECK/)
    assert.throws(() => migrated.prepare("INSERT INTO promotions (bereich, kennzeichnung, titel) VALUES ('futter', 'Werbung', 'x')").run(), /CHECK/)
    assert.equal(migrated.pragma('integrity_check', { simple: true }), 'ok')
    migrated.close()

    // Zweiter Start: nichts ändert sich mehr (weder Schema noch Daten)
    const afterFirst = schemaSnapshot(dbFile)
    runMigration(dir, dbFile)
    assert.deepEqual(schemaSnapshot(dbFile), afterFirst)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// V-Fehler 3: der Verlauf (promotion_events) hängt per Fremdschlüssel an promotions. Gibt es ihn schon, wenn
// promotions umgebaut wird (ein späterer Umbau, foreign_keys OFF), bleibt er stehen und zeigt danach wieder auf die
// neue Tabelle; gelöscht wird er mit dem Beitrag (ON DELETE CASCADE).
test('Migration: ein vorhandener Verlauf übersteht den Umbau von promotions und geht mit dem Beitrag', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronik-promotion-events-'))
  const dbFile = path.join(dir, 'old.db')
  try {
    seedOldDatabase(dbFile)
    const seedDb = new Database(dbFile)
    seedDb.exec(`CREATE TABLE promotion_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      promotion_id INTEGER NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
      aktion TEXT NOT NULL, grund TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`)
    seedDb.prepare("INSERT INTO promotion_events (promotion_id, aktion) VALUES (1, 'eingereicht'), (1, 'freigegeben'), (2, 'eingereicht')").run()
    seedDb.close()

    assert.equal(runMigration(dir, dbFile), '1')
    const migrated = new Database(dbFile)
    migrated.pragma('foreign_keys = ON')
    assert.match(migrated.prepare("SELECT sql FROM sqlite_master WHERE name = 'promotions'").get().sql, /'salon'/, 'promotions wurde umgebaut')
    assert.deepEqual(
      migrated.prepare('SELECT promotion_id, aktion FROM promotion_events ORDER BY id').all(),
      [
        { promotion_id: 1, aktion: 'eingereicht' },
        { promotion_id: 1, aktion: 'freigegeben' },
        { promotion_id: 2, aktion: 'eingereicht' }
      ]
    )
    assert.deepEqual(migrated.pragma('foreign_key_check'), [])
    assert.ok(migrated.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_promotion_events_promotion'").get())

    migrated.prepare('DELETE FROM promotions WHERE id = 1').run()
    assert.deepEqual(migrated.prepare('SELECT promotion_id FROM promotion_events').all(), [{ promotion_id: 2 }])
    assert.throws(() => migrated.prepare("INSERT INTO promotion_events (promotion_id, aktion) VALUES (999, 'eingereicht')").run(), /FOREIGN KEY/)
    migrated.close()
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('neue Datenbank: promotions hat salon und die Freigabe-Spalten von Anfang an', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronik-promotions-fresh-'))
  const dbFile = path.join(dir, 'fresh.db')
  try {
    runMigration(dir, dbFile)
    const freshDb = new Database(dbFile, { readonly: true })
    const columns = freshDb.prepare('PRAGMA table_info(promotions)').all()
    const byName = new Map(columns.map((column) => [column.name, column]))
    assert.equal(byName.get('freigabe').dflt_value, "'freigegeben'")
    assert.equal(byName.get('freigabe').notnull, 1)
    assert.equal(byName.get('ablehnungsgrund').notnull, 0)
    assert.equal(byName.get('erstellt_von_partner').dflt_value, '0')
    assert.match(freshDb.prepare("SELECT sql FROM sqlite_master WHERE name = 'promotions'").get().sql, /'salon'/)
    // V-Fehler 3: der Verlauf je Beitrag, mit Fremdschlüssel samt ON DELETE CASCADE
    assert.match(freshDb.prepare("SELECT sql FROM sqlite_master WHERE name = 'promotion_events'").get().sql, /REFERENCES promotions\(id\) ON DELETE CASCADE/)
    freshDb.close()
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
