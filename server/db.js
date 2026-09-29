const fs = require('node:fs')
const path = require('node:path')
const Database = require('better-sqlite3')
const { dbPath } = require('./config')
const { ensureLeitung } = require('./lib/ensureLeitung')

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

// Einen CHECK kann SQLite per ALTER nicht ändern - die Tabelle wird dann einmalig neu aufgebaut, solange
// isCurrent(gespeichertes CREATE-SQL) false ist (das Muster "12 Schritte" aus
// https://www.sqlite.org/lang_altertable.html#otheralter). columnsSql ist dieselbe Spalten-Definition wie
// für neue Datenbanken, indexesSql legt die Indizes danach wieder an. Genutzt für partners (Phase P Task 1)
// und promotions (Phase P2 Task 8). Nur mit festen Tabellennamen aus diesem Modul aufrufen.
function rebuildTableIfOutdated(table, { columnsSql, indexesSql, isCurrent }) {
  const current = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)
  if (!current || isCurrent(current.sql)) return

  const newTable = `${table}_neu`
  const oldColumns = db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name)
  // AUTOINCREMENT: der Umbau würde den Zähler sonst auf die höchste NOCH VORHANDENE Id zurücksetzen - die
  // Id einer schon gelöschten Zeile dürfte dann neu vergeben werden.
  const oldSequence = db.prepare('SELECT seq FROM sqlite_sequence WHERE name = ?').get(table)?.seq ?? 0

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

      const violations = db.pragma('foreign_key_check')
      if (violations.length) throw new Error(`Umbau von ${table} abgebrochen - Fremdschlüssel verletzt: ${JSON.stringify(violations)}`)
    })()
  } finally {
    db.pragma('foreign_keys = ON')
  }
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

// Phase R Task 1: Rolle eines Haushalts in einer Familie (family_members.rolle).
// rolle: 'gast' | 'mitglied' | 'stellvertretung' | 'leitung' - bewusst ohne CHECK (wie promotions.freigabe),
// geprüft im Code (lib/roles.js ROLES; ein unbekannter Wert zählt dort als "keine Berechtigung").
// Wer mit dem gemeinsamen Schlüssel der Familie angemeldet ist (homeId === familyId), hat keine Zeile
// hier und gilt trotzdem als Leitung (lib/roles.js roleOf).
// Jede Familie mit Mitgliedern, aber ohne Leitung, bekommt ihr ältestes Mitglied als Leitung
// (lib/ensureLeitung.js - dieselbe Regel greift in Task 2 nach dem Löschen eines Leitungs-Haushalts).
// Spalte und Nachtrag laufen als EINE Transaktion und bei jedem Start: idempotent, denn danach hat jede
// Familie mit Mitgliedern eine Leitung - ein zweiter Lauf findet nichts mehr.
db.transaction(() => {
  addColumnIfMissing('family_members', 'rolle', "TEXT NOT NULL DEFAULT 'mitglied'")
  ensureLeitung(db)
})()

// Phase R Task 2: wer einen Kommentar bzw. eine Pinnwand-Antwort geschrieben hat - die Identität
// (req.homeId, ein Zuhause oder die Familie selbst bei einem Login mit dem gemeinsamen Schlüssel).
// family_id bleibt weiterhin der Bereich, in dem der Beitrag steht (Sichtbarkeit, VISIBLE_COMMENT_SQL).
// NULL bei Altbestand (vor Phase R geschrieben) - den darf in einer Familie nur noch die Stellvertretung
// oder Leitung löschen (lib/authorship.js). Bewusst ohne REFERENCES: ein Beitrag bleibt lesbar, auch wenn
// der Haushalt längst gelöscht ist (er zeigt dann "ehemaliges Mitglied").
addColumnIfMissing('entry_comments', 'author_family_id', 'INTEGER')
addColumnIfMissing('note_replies', 'author_family_id', 'INTEGER')

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
// Phase 5 Task 1: Statistik und Herkunft schlagen Bereiche je Partner nach (lib/adminStats.js, lib/herkunft.js).
db.exec('CREATE INDEX IF NOT EXISTS idx_families_partner ON families(partner_id)')

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
// Phase R Task 2: Rolle, die ein Einladungs-Gutschein (join_family_id gesetzt) beim Einlösen vergibt -
// NULL heißt 'mitglied' (lib/vouchers.js redeemVoucher). Bewusst ohne CHECK wie family_members.rolle,
// geprüft im Code (lib/roles.js isRole; ein unbekannter Wert fällt beim Einlösen auf 'mitglied' zurück).
addColumnIfMissing('vouchers', 'join_rolle', 'TEXT')
// security-review Phase T: Übergabe-Gutscheine werden je Tier nachgeschlagen (revokeOpenHandoverVouchers,
// die Gültigkeitsprüfung in redeem/claim) - ohne Index ein Full-Table-Scan über vouchers.
db.exec('CREATE INDEX IF NOT EXISTS idx_vouchers_dog ON vouchers(dog_id)')

// Phase 3 Task 1: Reiter "Entdecken" - Empfehlungen/Anzeigen, anonyme Klickzählung, Spendenberichte und
// Admin-Einstellungen (docs/superpowers/plans/2026-09-29-phase-3-entdecken.md). Der Admin pflegt
// promotions/donation_reports/settings über routes/adminMarketing.js (lib/promotions.js validatePromotion).
// link_clicks zählt Klicks auf externe Links pro Tag OHNE Cookie/IP (siehe Task 2, routes/redirect.js).
// promotions.partner_id trägt bewusst KEINE REFERENCES - wie dog_transfers/timeline_entries.herkunft_family_id
// (siehe Kommentar oben) soll eine Empfehlung nicht an einem später gelöschten Partner hängen bleiben.
// Phase P2 Task 8: Beiträge der Partner (routes/partnerArea/posts.js) liegen ebenfalls hier
// (erstellt_von_partner = 1) und brauchen eine Freigabe durch den Admin. PROMOTIONS_COLUMNS_SQL ist die EINE
// Definition für neue Datenbanken UND den einmaligen Umbau alter Datenbanken (siehe unten, bereich 'salon').
// Die Bereich-Liste muss zu lib/promotions.js BEREICH_VALUES passen.
const PROMOTIONS_COLUMNS_SQL = `
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partner_id INTEGER,
    bereich TEXT NOT NULL CHECK (bereich IN ('futter','hundeschule','begleiter','unterstuetzen','salon')),
    kennzeichnung TEXT NOT NULL CHECK (kennzeichnung IN ('Anzeige','Empfehlung','Partner')),
    empfohlen_von TEXT, titel TEXT NOT NULL, text TEXT, url TEXT,
    bild_file TEXT, tierart TEXT, aktiv INTEGER NOT NULL DEFAULT 1,
    start TEXT, ende TEXT, sort INTEGER NOT NULL DEFAULT 0, is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    freigabe TEXT NOT NULL DEFAULT 'freigegeben',
    ablehnungsgrund TEXT,
    erstellt_von_partner INTEGER NOT NULL DEFAULT 0
`
// idx_promotions_partner: eigene Beiträge (Liste, Limit) und die Beiträge auf dem Portal je Partner.
const PROMOTIONS_INDEXES_SQL = `
  CREATE INDEX IF NOT EXISTS idx_promotions_bereich ON promotions(bereich, aktiv);
  CREATE INDEX IF NOT EXISTS idx_promotions_partner ON promotions(partner_id, erstellt_von_partner);
`

db.exec(`
  CREATE TABLE IF NOT EXISTS promotions (${PROMOTIONS_COLUMNS_SQL});

  CREATE TABLE IF NOT EXISTS link_clicks (
    target_type TEXT NOT NULL, target_id INTEGER NOT NULL, tag TEXT NOT NULL, anzahl INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (target_type, target_id, tag)
  );
  -- Phase 5 Task 1: Tagesreihe und 7/30-Tage-Summen der Klicks filtern nach tag (lib/adminStats.js).
  CREATE INDEX IF NOT EXISTS idx_link_clicks_tag ON link_clicks(tag);

  CREATE TABLE IF NOT EXISTS donation_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT, zeitraum TEXT NOT NULL,
    eingang_cents INTEGER NOT NULL, kosten_cents INTEGER NOT NULL, weitergeleitet_cents INTEGER NOT NULL,
    empfaenger TEXT, nachweis_url TEXT, is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
`)

// Phase P2 Task 8: bestehende Datenbanken bekommen die Freigabe-Spalten per ALTER (bestehende Empfehlungen
// gelten damit als freigegeben und nicht vom Partner erstellt), danach die Indizes und der einmalige Umbau
// für den neuen bereich 'salon' im CHECK (rebuildTableIfOutdated oben, test/promotionsSchema.test.js).
// freigabe: 'eingereicht' | 'freigegeben' | 'abgelehnt' - bewusst ohne CHECK, geprüft wird im Code
// (lib/promotions.js FREIGABE_VALUES, gesetzt nur von routes/adminMarketing.js und lib/partnerPosts.js).
addColumnIfMissing('promotions', 'freigabe', "TEXT NOT NULL DEFAULT 'freigegeben'")
addColumnIfMissing('promotions', 'ablehnungsgrund', 'TEXT')
addColumnIfMissing('promotions', 'erstellt_von_partner', 'INTEGER NOT NULL DEFAULT 0')
db.exec(PROMOTIONS_INDEXES_SQL)
rebuildTableIfOutdated('promotions', {
  columnsSql: PROMOTIONS_COLUMNS_SQL,
  indexesSql: PROMOTIONS_INDEXES_SQL,
  isCurrent: (sql) => sql.includes("'salon'")
})

// Phase P Task 1 (docs/superpowers/plans/2026-09-29-phase-p-partnerbereich.md): Partner-Bereiche für
// alle Partner-Typen. Neue partners-Spalten zuerst per ALTER (für den Umbau darunter sind dann alle
// Spalten schon da), danach der einmalige Umbau für die neuen Typen im CHECK.
addColumnIfMissing('partners', 'gesperrt', 'INTEGER NOT NULL DEFAULT 0')
addColumnIfMissing('partners', 'kontakt_formular_url', 'TEXT')
addColumnIfMissing('partners', 'kontaktformular_aktiv', 'INTEGER NOT NULL DEFAULT 1')

// Den CHECK auf partners.typ kann SQLite per ALTER nicht ändern - einmalig neu aufbauen, solange das
// gespeicherte Schema 'hundesalon' noch nicht kennt (rebuildTableIfOutdated oben). Kein anderer Tisch hat
// heute REFERENCES partners(...) (families/voucher_batches/vouchers/promotions.partner_id sind bewusst ohne
// Fremdschlüssel, siehe oben) - sollte das später dazukommen, bleibt die Referenz trotzdem gültig: sie zeigt
// per Name auf "partners", und genau so heißt die neue Tabelle nach dem Umbenennen wieder
// (test/partnerSchema.test.js).
rebuildTableIfOutdated('partners', {
  columnsSql: PARTNERS_COLUMNS_SQL,
  indexesSql: PARTNERS_INDEXES_SQL,
  isCurrent: (sql) => sql.includes("'hundesalon'")
})

// Gutschein-Stapel für Partner-Zugänge (Task 2): zweck 'chronik' (bisher: legt ein Zuhause an) oder
// 'partnerzugang'; partner_typ optional als Vorgabe für den neuen Partner - beides wird im Code geprüft.
// Bewusst kein CHECK auf zweck (bestehende Datenbanken haben die Spalte schon ohne): die Absicherung
// sind lib/vouchers.js validateZweck (Admin-Eingabe) und assertBatchPurpose (createBatch).
addColumnIfMissing('voucher_batches', 'zweck', "TEXT NOT NULL DEFAULT 'chronik'")
addColumnIfMissing('voucher_batches', 'partner_typ', 'TEXT')

// Phase P Task 3b: Einblicke - Fotos mit Datum, die ein Partner auf seinem Portal zeigt (lib/einblicke.js,
// routes/partnerArea/einblicke.js). foto_url ist ein /uploads/-Pfad wie dogs.foto_url; öffentlich wird das
// Foto nur über /public-media ausgeliefert, solange der Partner sichtbar und der Einblick nicht vom Admin
// ausgeblendet ist (lib/publicMedia.js). Bewusst ohne REFERENCES auf partners(id) - wie families.partner_id.
// idx_einblicke_foto: für die Datei-Freigabe (/public-media, /uploads) je Dateiname.
db.exec(`
  CREATE TABLE IF NOT EXISTS partner_einblicke (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partner_id INTEGER NOT NULL,
    foto_url TEXT NOT NULL,
    datum TEXT NOT NULL,
    text TEXT,
    einwilligung INTEGER NOT NULL,
    ausgeblendet INTEGER NOT NULL DEFAULT 0,
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_einblicke_partner ON partner_einblicke(partner_id, datum DESC);
  CREATE INDEX IF NOT EXISTS idx_einblicke_foto ON partner_einblicke(foto_url);
`)

// Phase P2 Task 9: Nachrichten aus dem Kontaktformular eines Portals (POST /api/public/partners/:slug/contact)
// an den Posteingang des Partners (/api/partner-area/messages), siehe lib/partnerMessages.js.
// Datenschutz: Name, E-Mail, Telefon und Nachricht sind personenbezogene Daten von Kundinnen und Kunden. Sie
// werden höchstens 180 Tage aufbewahrt - jeder Eingang und jedes Öffnen des Posteingangs löscht vorher die
// älteren Nachrichten dieses Partners (lib/partnerMessages.js RETENTION_DAYS); löschen kann der Partner jederzeit
// selbst. Nie im Log. Bewusst ohne REFERENCES auf partners(id) - wie partner_einblicke.
db.exec(`
  CREATE TABLE IF NOT EXISTS partner_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partner_id INTEGER NOT NULL,
    name TEXT, email TEXT, telefon TEXT,
    bezug TEXT,
    nachricht TEXT NOT NULL,
    gelesen_at TEXT,
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_partner_messages_partner ON partner_messages(partner_id, created_at);
`)

module.exports = db
