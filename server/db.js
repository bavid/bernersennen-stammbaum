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

// "Meine Chronik" (art='zuhause') ist der private Bereich eines Haushalts; bestehende und neue
// gemeinsame Familien bleiben 'rudel'. family_members verknüpft ein Zuhause mit Rudeln, denen es beitritt.
addColumnIfMissing('families', 'art', "TEXT NOT NULL DEFAULT 'rudel'")
db.exec(`
  CREATE TABLE IF NOT EXISTS family_members (
    member_family_id INTEGER NOT NULL REFERENCES families(id),
    group_family_id INTEGER NOT NULL REFERENCES families(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (member_family_id, group_family_id)
  );
  CREATE INDEX IF NOT EXISTS idx_family_members_group ON family_members(group_family_id);
`)

// Bestehende Rudel behalten ihren Berner-Auftritt, neue Familien starten mit „Familie auf Pfoten".
// Spalte anlegen und Bestandsdaten umstellen als eine Transaktion, damit ein Absturz dazwischen
// nicht neue Zeilen fälschlich auf 'standard' stehen lässt, während alte noch die Spalte vermissen.
db.transaction(() => {
  if (addColumnIfMissing('families', 'theme', "TEXT NOT NULL DEFAULT 'standard'")) {
    db.exec("UPDATE families SET theme = 'berner'")
  }
})()

// Task 2 (Phase Z): ein Zuhause kann eigene Tiere in Rudel teilen, denen es beigetreten ist.
// dog_shares hält, welches Tier in welchem Rudel lesend sichtbar ist (Schreiben bleibt beim Eigentümer).
db.exec(`
  CREATE TABLE IF NOT EXISTS dog_shares (
    dog_id INTEGER NOT NULL REFERENCES dogs(id),
    family_id INTEGER NOT NULL REFERENCES families(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (dog_id, family_id)
  );
  CREATE INDEX IF NOT EXISTS idx_dog_shares_family ON dog_shares(family_id, dog_id);
`)
addColumnIfMissing('dogs', 'bei_uns_seit', 'TEXT')
addColumnIfMissing('dogs', 'bei_uns_bis', 'TEXT')
addColumnIfMissing('dogs', 'abschied_grund', 'TEXT')
addColumnIfMissing('dogs', 'herkunft_art', 'TEXT')
addColumnIfMissing('dogs', 'herkunft_text', 'TEXT')
addColumnIfMissing('timeline_entries', 'privat', 'INTEGER NOT NULL DEFAULT 0')

// Task 3 (Phase Z): welcher Bereich eine Upload-Datei erzeugt hat - damit ein frisches, noch keinem
// Hund/Eintrag zugeordnetes Foto schon vor dem Speichern nur dort sichtbar ist (canSeeUpload in
// lib/uploadAccess.js). filename ist der PRIMARY KEY: ein Dateiname gehört für immer genau einer Familie.
db.exec(`
  CREATE TABLE IF NOT EXISTS uploads (
    filename TEXT PRIMARY KEY,
    family_id INTEGER NOT NULL REFERENCES families(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_uploads_family ON uploads(family_id);
`)

// Phase 1: Gutschein-Codes als Login/PUK. voucher_batches/vouchers halten die Codes (nur Hash + optional
// verschlüsselter Klartext, solange ein Gutschein noch offen ist); users sind optionale eigene Zugänge
// je Bereich, die über die Identität hinweg gelten (session_epoch statt eines Bereichs-Passworts).
db.exec(`
  CREATE TABLE IF NOT EXISTS voucher_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('admin','rudel','partner','demo')),
    partner_id INTEGER,
    size INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS vouchers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id INTEGER NOT NULL REFERENCES voucher_batches(id),
    code_hash TEXT NOT NULL UNIQUE,
    code_cipher TEXT,
    code_hint TEXT NOT NULL,
    partner_id INTEGER,
    issued_by_family_id INTEGER REFERENCES families(id),
    join_family_id INTEGER REFERENCES families(id),
    redeemed_by_family_id INTEGER REFERENCES families(id),
    redeemed_at TEXT,
    expires_at TEXT,
    revoked_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_vouchers_issued ON vouchers(issued_by_family_id);
  CREATE INDEX IF NOT EXISTS idx_vouchers_batch ON vouchers(batch_id);
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_id INTEGER NOT NULL REFERENCES families(id),
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    email TEXT,
    session_epoch INTEGER NOT NULL DEFAULT 0,
    last_login_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_users_family ON users(family_id);
`)
// access_key_hash: Hash des Schlüssels (Gutschein-Code), mit dem sich der Bereich direkt anmeldet.
// legacy_password: 1 = das alte Bereichs-Passwort gilt noch (Bestandsrudel), 0 = nur noch der Schlüssel.
// auth_epoch: wird beim Erneuern des Schlüssels erhöht, damit alte Sitzungen dieses Bereichs enden.
// voucher_id: der Gutschein, aus dem dieser Bereich entstanden ist (falls per Einlösen angelegt).
addColumnIfMissing('families', 'access_key_hash', 'TEXT')
addColumnIfMissing('families', 'legacy_password', 'INTEGER NOT NULL DEFAULT 1')
addColumnIfMissing('families', 'auth_epoch', 'INTEGER NOT NULL DEFAULT 0')
addColumnIfMissing('families', 'voucher_id', 'INTEGER')
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_families_access_key ON families(access_key_hash) WHERE access_key_hash IS NOT NULL')

// Phase 2 Task 2: Partner (Tierheime, Vermittlungsstellen, Hundeschulen, Futter, ...) mit eigener
// Portalseite (/p/:slug). Nie 'zuechter' - siehe lib/breederGuard.js, das alle Partner-Texte prüft.
// Phase P Task 1: dazu Hundesalons und Betreuung (Hundesitter, Tagesstätte, Pension) sowie gesperrt
// (Admin-Sperre, öffentlich wie "nicht aktiv"), kontakt_formular_url und kontaktformular_aktiv. Die
// Typ-Liste muss zu lib/partners.js TYP_VALUES passen. PARTNERS_COLUMNS_SQL ist die EINE Definition für
// neue Datenbanken UND den einmaligen Umbau alter Datenbanken (rebuildPartnersTable unten).
const PARTNERS_COLUMNS_SQL = `
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    typ TEXT NOT NULL CHECK (typ IN ('tierheim','vermittlung','hundeschule','hundesalon','betreuung','futter','sonstige')),
    ist_partner INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'entwurf' CHECK (status IN ('entwurf','aktiv','pausiert')),
    plz TEXT, ort TEXT, lat REAL, lon REAL,
    website TEXT, spenden_url TEXT, vermittlung_url TEXT,
    kontakt_email TEXT, kontakt_telefon TEXT,
    logo_file TEXT, portal_titel TEXT, portal_text TEXT, farbe TEXT,
    quelle TEXT NOT NULL DEFAULT 'manuell' CHECK (quelle IN ('manuell','osm','sitecheck')),
    osm_ref TEXT, is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    gesperrt INTEGER NOT NULL DEFAULT 0,
    kontakt_formular_url TEXT,
    kontaktformular_aktiv INTEGER NOT NULL DEFAULT 1
`
const PARTNERS_INDEXES_SQL = 'CREATE INDEX IF NOT EXISTS idx_partners_status ON partners(status);'

db.exec(`
  CREATE TABLE IF NOT EXISTS partners (${PARTNERS_COLUMNS_SQL});
  ${PARTNERS_INDEXES_SQL}
`)

// Welcher Partner den Gutschein vergeben hat, mit dem dieses Zuhause entstand ("kam über Partner X") -
// gesetzt beim Einlösen aus vouchers.partner_id (siehe lib/vouchers.js redeemVoucher).
addColumnIfMissing('families', 'partner_id', 'INTEGER')

// Phase 2 Task 3: Umkreissuche (lib/places/). places_cache hält OSM-Ergebnisse 7 Tage (Schlüssel siehe
// lib/places/cache.js), places_budget zählt echte Overpass-Anfragen pro Kalendertag gegen
// config.placesDailyLimit - beides nie mit Nutzer-Koordinaten/PLZ im Klartext geloggt.
db.exec(`
  CREATE TABLE IF NOT EXISTS places_cache (
    key TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS places_budget (
    day TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 0
  );
`)

// Phase T Task 1: Tierheim als eigener Bereich (art='tierheim', siehe lib/context.js ART.tierheim) -
// Datenmodell für Vermittlung (Steckbrief, Status) und Übergabe (Gutschein mit vouchers.dog_id,
// dog_transfers). Bewusst KEINE REFERENCES auf dog_transfers.dog_id/from_family_id/to_family_id/
// voucher_id und auf timeline_entries.herkunft_family_id: das sind reine Herkunfts-/Protokoll-Verweise,
// die nach einem Löschen (Familie, Tier, Gutschein) bewusst stehen bleiben dürfen, statt die Löschung
// per Fremdschlüsselprüfung zu blockieren (siehe lib/families.js deleteFamily, das diese Tabellen/
// Spalten deshalb unangetastet lässt).
addColumnIfMissing('dogs', 'vermittlung_status', 'TEXT')
addColumnIfMissing('dogs', 'public_slug', 'TEXT')
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_dogs_public_slug ON dogs(public_slug) WHERE public_slug IS NOT NULL')

addColumnIfMissing('timeline_entries', 'kategorie', 'TEXT')
addColumnIfMissing('timeline_entries', 'is_public', 'INTEGER NOT NULL DEFAULT 0')
addColumnIfMissing('timeline_entries', 'herkunft_family_id', 'INTEGER')

db.exec(`
  CREATE TABLE IF NOT EXISTS dog_transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dog_id INTEGER NOT NULL,
    from_family_id INTEGER,
    to_family_id INTEGER,
    voucher_id INTEGER,
    transferred_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_dog_transfers_dog ON dog_transfers(dog_id);
`)

addColumnIfMissing('dog_shares', 'story_consent', 'INTEGER NOT NULL DEFAULT 0')
addColumnIfMissing('vouchers', 'dog_id', 'INTEGER')
// security-review Phase T: Übergabe-Gutscheine werden je Tier nachgeschlagen (revokeOpenHandoverVouchers,
// die Gültigkeitsprüfung in redeem/claim) - ohne Index ein Full-Table-Scan über vouchers.
db.exec('CREATE INDEX IF NOT EXISTS idx_vouchers_dog ON vouchers(dog_id)')

// Phase 3 Task 1: Reiter "Entdecken" - Empfehlungen/Anzeigen, anonyme Klickzählung, Spendenberichte und
// Admin-Einstellungen (docs/superpowers/plans/2026-09-29-phase-3-entdecken.md). Der Admin pflegt
// promotions/donation_reports/settings über routes/adminMarketing.js (lib/promotions.js validatePromotion).
// link_clicks zählt Klicks auf externe Links pro Tag OHNE Cookie/IP (siehe Task 2, routes/redirect.js).
// promotions.partner_id trägt bewusst KEINE REFERENCES - wie dog_transfers/timeline_entries.herkunft_family_id
// (siehe Kommentar oben) soll eine Empfehlung nicht an einem später gelöschten Partner hängen bleiben.
db.exec(`
  CREATE TABLE IF NOT EXISTS promotions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partner_id INTEGER,
    bereich TEXT NOT NULL CHECK (bereich IN ('futter','hundeschule','begleiter','unterstuetzen')),
    kennzeichnung TEXT NOT NULL CHECK (kennzeichnung IN ('Anzeige','Empfehlung','Partner')),
    empfohlen_von TEXT, titel TEXT NOT NULL, text TEXT, url TEXT,
    bild_file TEXT, tierart TEXT, aktiv INTEGER NOT NULL DEFAULT 1,
    start TEXT, ende TEXT, sort INTEGER NOT NULL DEFAULT 0, is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_promotions_bereich ON promotions(bereich, aktiv);

  CREATE TABLE IF NOT EXISTS link_clicks (
    target_type TEXT NOT NULL, target_id INTEGER NOT NULL, tag TEXT NOT NULL, anzahl INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (target_type, target_id, tag)
  );

  CREATE TABLE IF NOT EXISTS donation_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT, zeitraum TEXT NOT NULL,
    eingang_cents INTEGER NOT NULL, kosten_cents INTEGER NOT NULL, weitergeleitet_cents INTEGER NOT NULL,
    empfaenger TEXT, nachweis_url TEXT, is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
`)

// Phase P Task 1 (docs/superpowers/plans/2026-09-29-phase-p-partnerbereich.md): Partner-Bereiche für
// alle Partner-Typen. Neue partners-Spalten zuerst per ALTER (für den Umbau darunter sind dann alle
// Spalten schon da), danach der einmalige Umbau für die neuen Typen im CHECK.
addColumnIfMissing('partners', 'gesperrt', 'INTEGER NOT NULL DEFAULT 0')
addColumnIfMissing('partners', 'kontakt_formular_url', 'TEXT')
addColumnIfMissing('partners', 'kontaktformular_aktiv', 'INTEGER NOT NULL DEFAULT 1')

// Den CHECK auf partners.typ kann SQLite per ALTER nicht ändern - einmalig neu aufbauen, solange das
// gespeicherte Schema 'hundesalon' noch nicht kennt (das Muster "12 Schritte" aus
// https://www.sqlite.org/lang_altertable.html#otheralter). Kein anderer Tisch hat heute REFERENCES
// partners(...) (families/voucher_batches/vouchers/promotions.partner_id sind bewusst ohne Fremdschlüssel,
// siehe oben) - sollte das später dazukommen, bleibt die Referenz trotzdem gültig: sie zeigt per Name auf
// "partners", und genau so heißt die neue Tabelle nach dem Umbenennen wieder (test/partnerSchema.test.js).
function rebuildPartnersTable() {
  const current = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'partners'").get()
  if (!current || current.sql.includes("'hundesalon'")) return

  const oldColumns = db.prepare('PRAGMA table_info(partners)').all().map((column) => column.name)
  // AUTOINCREMENT: der Umbau würde den Zähler sonst auf die höchste NOCH VORHANDENE Id zurücksetzen - die
  // Id eines schon gelöschten Partners dürfte dann neu vergeben werden.
  const oldSequence = db.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'partners'").get()?.seq ?? 0

  // Muss außerhalb jeder Transaktion umgestellt werden (innerhalb wirkt das Pragma nicht).
  db.pragma('foreign_keys = OFF')
  try {
    db.transaction(() => {
      db.exec(`CREATE TABLE partners_neu (${PARTNERS_COLUMNS_SQL})`)
      const newColumns = new Set(db.prepare('PRAGMA table_info(partners_neu)').all().map((column) => column.name))
      const lost = oldColumns.filter((column) => !newColumns.has(column))
      // Lieber gar nicht umbauen (Rollback) als stillschweigend eine Spalte samt Daten verlieren.
      if (lost.length) throw new Error(`Umbau von partners abgebrochen - unbekannte Spalten: ${lost.join(', ')}`)

      const columnList = oldColumns.join(', ')
      db.exec(`INSERT INTO partners_neu (${columnList}) SELECT ${columnList} FROM partners`)
      db.exec('DROP TABLE partners')
      db.exec('ALTER TABLE partners_neu RENAME TO partners')
      db.exec(PARTNERS_INDEXES_SQL)

      const sequence = db.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'partners'").get()
      if (!sequence) {
        if (oldSequence > 0) db.prepare("INSERT INTO sqlite_sequence (name, seq) VALUES ('partners', ?)").run(oldSequence)
      } else if (sequence.seq < oldSequence) {
        db.prepare("UPDATE sqlite_sequence SET seq = ? WHERE name = 'partners'").run(oldSequence)
      }

      const violations = db.pragma('foreign_key_check')
      if (violations.length) throw new Error(`Umbau von partners abgebrochen - Fremdschlüssel verletzt: ${JSON.stringify(violations)}`)
    })()
  } finally {
    db.pragma('foreign_keys = ON')
  }
}
rebuildPartnersTable()

// Gutschein-Stapel für Partner-Zugänge (Task 2): zweck 'chronik' (bisher: legt ein Zuhause an) oder
// 'partnerzugang'; partner_typ optional als Vorgabe für den neuen Partner - beides wird im Code geprüft.
addColumnIfMissing('voucher_batches', 'zweck', "TEXT NOT NULL DEFAULT 'chronik'")
addColumnIfMissing('voucher_batches', 'partner_typ', 'TEXT')

module.exports = db
