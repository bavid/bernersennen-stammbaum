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
    kontaktformular_aktiv INTEGER NOT NULL DEFAULT 1,
    vertrauenswuerdig INTEGER NOT NULL DEFAULT 0,
    ansprechperson TEXT
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
    erstellt_von_partner INTEGER NOT NULL DEFAULT 0,
    partner_reihenfolge INTEGER,
    in_entdecken INTEGER NOT NULL DEFAULT 1,
    zeitraeume TEXT
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
// Phase V1: wie die Anzeigen auf der Partner-Karte in "Entdecken" stehen (lib/partnerPostOrder.js) - reine
// Darstellung, braucht keine neue Freigabe. partner_reihenfolge: vom Partner gewählte Reihenfolge (NULL = nach sort
// und Datum, hinter den geordneten); in_entdecken = 0: nur auf dem Portal, nicht auf der Karte.
addColumnIfMissing('promotions', 'partner_reihenfolge', 'INTEGER')
addColumnIfMissing('promotions', 'in_entdecken', 'INTEGER NOT NULL DEFAULT 1')
// Phase V4a: Termine einer Anzeige ("Tag der offenen Tür am 1.1., 1.2. und 5.–10.5.") als JSON-Liste
// [{ von, bis }] (lib/promotionZeitraeume.js) - NULL = keine. Bewusst eine Spalte statt einer eigenen Tabelle: die
// Daten gehören zum Inhalt des Beitrags, ändern sich mit ihm in derselben Anweisung (lib/partnerPosts.js
// applyPartnerEdit, also mit derselben Freigabe-Regel) und kommen mit jedem SELECT p.* mit - ohne zweite Abfrage je
// Karte, in der Freigabe-Liste des Admins genauso wie in "Entdecken".
addColumnIfMissing('promotions', 'zeitraeume', 'TEXT')
db.exec(PROMOTIONS_INDEXES_SQL)
rebuildTableIfOutdated('promotions', {
  columnsSql: PROMOTIONS_COLUMNS_SQL,
  indexesSql: PROMOTIONS_INDEXES_SQL,
  isCurrent: (sql) => sql.includes("'salon'")
})

// V-Fehler 3: Verlauf je Beitrag (lib/promotionFreigabe.js) - eingereicht, geaendert, freigegeben, abgelehnt
// (mit grund), zurueckgezogen. aktion bewusst ohne CHECK (wie promotions.freigabe), geprüft im Code. Anders als
// promotions.partner_id MIT Fremdschlüssel: der Verlauf gehört zum Beitrag und verschwindet mit ihm (ON DELETE
// CASCADE - auch beim Wegräumen der Demo-Beiträge). Erst NACH dem Umbau oben angelegt; ein späterer Umbau von
// promotions (foreign_keys OFF, rebuildTableIfOutdated) lässt den Verlauf stehen, die Referenz zeigt per Name
// wieder auf die neue Tabelle.
db.exec(`
  CREATE TABLE IF NOT EXISTS promotion_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    promotion_id INTEGER NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
    aktion TEXT NOT NULL,
    grund TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_promotion_events_promotion ON promotion_events(promotion_id, created_at, id);
`)

// Phase P Task 1 (docs/superpowers/plans/2026-09-29-phase-p-partnerbereich.md): Partner-Bereiche für
// alle Partner-Typen. Neue partners-Spalten zuerst per ALTER (für den Umbau darunter sind dann alle
// Spalten schon da), danach der einmalige Umbau für die neuen Typen im CHECK.
addColumnIfMissing('partners', 'gesperrt', 'INTEGER NOT NULL DEFAULT 0')
addColumnIfMissing('partners', 'kontakt_formular_url', 'TEXT')
addColumnIfMissing('partners', 'kontaktformular_aktiv', 'INTEGER NOT NULL DEFAULT 1')
// V-Fehler 3: vertrauenswürdige Partner - Änderungen an schon freigegebenen Beiträgen gehen ohne erneute Freigabe
// online (lib/promotionFreigabe.js partnerEditOutcome). Setzt nur der Admin (PUT /api/admin/partners/:id).
addColumnIfMissing('partners', 'vertrauenswuerdig', 'INTEGER NOT NULL DEFAULT 0')
// Phase V4b: Name der Ansprechperson (optional, reiner Text, höchstens 80 Zeichen - lib/partners.js validatePartner),
// gezeigt auf dem Portal neben „Schreib uns“ und im Kontaktformular. Pflegt der Partner selbst (lib/partnerProfile.js).
addColumnIfMissing('partners', 'ansprechperson', 'TEXT')

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
// Phase V1: angepinnte Einblicke stehen auf der Partner-Karte in "Entdecken" (lib/einblickPins.js) - 'partner' oder
// 'admin' (bewusst ohne CHECK, geprüft im Code; der Admin überstimmt den Partner), NULL = nicht angepinnt.
addColumnIfMissing('partner_einblicke', 'angepinnt_von', 'TEXT')
addColumnIfMissing('partner_einblicke', 'angepinnt_at', 'TEXT')

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

// Phase 5 Task 5b: Protokoll der Admin-Ansicht (lib/adminLog.js). Jeder Aufruf von POST /api/admin/view/:familyId
// hinterlässt eine Zeile { aktion: 'view', ziel: 'family:<id>' } - nur Bereich und Zeitpunkt, nie Namen oder
// Inhalte (die Zeile darf nichts verraten, was der Admin gesehen hat).
db.exec(`
  CREATE TABLE IF NOT EXISTS admin_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    aktion TEXT NOT NULL,
    ziel TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_admin_log_created ON admin_log(created_at DESC, id DESC);
`)

// Phase N Task 1: Anfragen von Besuchern - ein Gutschein (typ 'gutschein') oder ein Partner-Zugang (typ 'partner'),
// gestellt über POST /api/public/anfragen, bearbeitet im Admin (routes/adminAnfragen.js, lib/anfragen.js).
// typ/status/partner_typ bewusst ohne CHECK (wie promotions.freigabe) - geprüft im Code (lib/anfragen.js
// TYP_VALUES/STATUS_VALUES, lib/partners.js TYP_VALUES), damit spätere Werte keinen Tabellen-Umbau brauchen.
// email COLLATE NOCASE: die Duplikat-Sperre (dieselbe offene Anfrage binnen 24 Stunden) ignoriert Groß/klein.
// erledigt_at: Zeitpunkt des Abschlusses (erledigt ODER abgelehnt), NULL solange offen.
// Datenschutz: Name, E-Mail und Nachricht sind personenbezogen - erledigte/abgelehnte Anfragen verschwinden
// 180 Tage nach dem Abschluss, offene 365 Tage nach dem Eingang (lib/anfragen.js, täglich aus index.js). Nie im Log.
// voucher_id: der zugewiesene Gutschein, bewusst ohne REFERENCES (wie families.voucher_id).
db.exec(`
  CREATE TABLE IF NOT EXISTS anfragen (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    typ TEXT NOT NULL,
    name TEXT,
    email TEXT NOT NULL COLLATE NOCASE,
    nachricht TEXT,
    firma TEXT,
    partner_typ TEXT,
    plz TEXT,
    status TEXT NOT NULL DEFAULT 'offen',
    notiz TEXT,
    voucher_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    erledigt_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_anfragen_status ON anfragen(status, created_at);
  CREATE INDEX IF NOT EXISTS idx_anfragen_email ON anfragen(email, typ, created_at);
`)
// Welcher Anfrage ein Gutschein zugewiesen wurde (POST /api/admin/anfragen/:id/gutschein) - so wird kein Code
// zweimal vergeben. Bewusst ohne REFERENCES: eine gelöschte Anfrage gibt ihren (womöglich schon verschickten)
// Code damit NICHT wieder frei. Der Gutschein selbst bleibt offen und druckbar, bis er eingelöst wird.
addColumnIfMissing('vouchers', 'zugewiesen_an_anfrage_id', 'INTEGER')
// security-review Phase N (L1): Zeitpunkt der letzten Bearbeitung im Admin (Status, Notiz, Zuweisung). Eine wieder
// geöffnete Anfrage zählt ihre Aufbewahrung ab hier statt ab dem Eingang (lib/anfragen.js PURGE_SQL). NULL = nie bearbeitet.
addColumnIfMissing('anfragen', 'aktualisiert_at', 'TEXT')

// Phase N Task 5: globale Hinweise - ein Band oben auf allen Seiten (lib/hinweise.js, routes/hinweise.js öffentlich,
// routes/adminHinweise.js Admin). start/ende: ISO in UTC, immer im Format von toISOString() (Textvergleich in SQLite
// stimmt so); ende NULL = offen. stufe ohne CHECK (wie anfragen.typ) - geprüft in lib/hinweise.js STUFE_VALUES.
// is_demo = 1: nur der Beispiel-Hinweis der Vorschau/Testumgebung (scripts/testenv-seed.js), in Produktion nie öffentlich.
db.exec(`
  CREATE TABLE IF NOT EXISTS hinweise (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titel TEXT NOT NULL,
    text TEXT,
    stufe TEXT NOT NULL DEFAULT 'info',
    start TEXT NOT NULL,
    ende TEXT,
    aktiv INTEGER NOT NULL DEFAULT 1,
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_hinweise_aktiv ON hinweise(aktiv, start);
`)

// Phase V2: Zuhause besuchen (lib/visits.js). Eine Zeile = das Zuhause gast_family_id darf das Zuhause
// gastgeber_family_id ansehen und kommentieren. Entsteht über eine Besuchs-Einladung (Gutschein-Stapel mit zweck
// 'besuch', vouchers.visit_host_family_id = der Gastgeber, 7 Tage gültig, lib/visitInvites.js). ON DELETE CASCADE:
// verschwindet ein Zuhause (lib/families.js deleteFamily), gehen seine Besuche in beide Richtungen mit.
db.exec(`
  CREATE TABLE IF NOT EXISTS besuche (
    gast_family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    gastgeber_family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (gast_family_id, gastgeber_family_id),
    CHECK (gast_family_id != gastgeber_family_id)
  );
  CREATE INDEX IF NOT EXISTS idx_besuche_gastgeber ON besuche(gastgeber_family_id);
`)
// Bewusst ohne REFERENCES (wie families.voucher_id): ein eingelöster Besuchs-Gutschein bleibt als Verlauf stehen,
// auch wenn der Gastgeber später gelöscht wird (lib/families.js setzt den Verweis dann auf NULL).
addColumnIfMissing('vouchers', 'visit_host_family_id', 'INTEGER')
// security-review Phase V2 (M-3): ein neuer Gast soll dem Gastgeber auffallen - bestaetigt_at bleibt NULL, bis der
// Gastgeber „Passt“ sagt (POST /api/besuche/gaeste/:id/passt); voucher_id: der Code, über den der Gast kam (für die
// Notiz „über deinen Code ‚…‘“), bewusst ohne REFERENCES. Bestehende Besuche gelten beim Nachrüsten als bestätigt.
db.transaction(() => {
  if (addColumnIfMissing('besuche', 'bestaetigt_at', 'TEXT')) {
    db.exec('UPDATE besuche SET bestaetigt_at = created_at WHERE bestaetigt_at IS NULL')
  }
})()
addColumnIfMissing('besuche', 'voucher_id', 'INTEGER')

// Phase V2: "Erlebt mit" (lib/erlebtMit.js). Ein Eintrag (entry_id) markiert ein Tier eines verbundenen Zuhauses
// (dog_id, Besuch in einer der Richtungen oder gemeinsame Familie). status: 'offen' (Anfrage an die Besitzer des
// Tiers), 'bestaetigt' (der Eintrag erscheint gespiegelt in dessen Chronik - als Verweis, keine Kopie) oder
// 'abgelehnt' (überall ausgeblendet; bleibt stehen, damit dieselbe Markierung nicht erneut anfragt). ON DELETE
// CASCADE: verschwindet der Eintrag oder das Tier, verschwindet die Markierung mit.
db.exec(`
  CREATE TABLE IF NOT EXISTS erlebt_mit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id INTEGER NOT NULL REFERENCES timeline_entries(id) ON DELETE CASCADE,
    dog_id INTEGER NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'offen' CHECK (status IN ('offen', 'bestaetigt', 'abgelehnt')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    entschieden_at TEXT,
    UNIQUE (entry_id, dog_id)
  );
  CREATE INDEX IF NOT EXISTS idx_erlebt_mit_dog ON erlebt_mit(dog_id, status);
`)

// Phase V2b: eigene Einladungen verwalten (routes/vouchers.js, lib/vouchers.js MAX_OPEN_CODES).
// created_by_family_id: die Identität (ein Zuhause, oder eine Familie mit ihrem gemeinsamen Schlüssel), die den Code
// angelegt hat - zählt für die Obergrenze offener Codes und darf die Beschriftung setzen und sehen. Bestehende
// Weitergabe-Gutscheine eines Zuhauses gehören beim Nachrüsten dem Zuhause selbst (einmalig, in einer Transaktion
// mit der Spalte); ältere Einladungen einer Familie bleiben ohne Ersteller (zählen nicht, ohne Beschriftung).
// label: eigene Notiz des Erstellers (höchstens 60 Zeichen, z. B. "Tante Ilse"). ausgeblendet_at: vom Ersteller
// gelöscht (die Zeile bleibt für die Statistik, zurückgezogen). Alles bewusst ohne REFERENCES (lib/families.js
// setzt created_by_family_id beim Löschen auf NULL).
db.transaction(() => {
  if (addColumnIfMissing('vouchers', 'created_by_family_id', 'INTEGER')) {
    db.exec(`UPDATE vouchers SET created_by_family_id = issued_by_family_id
             WHERE created_by_family_id IS NULL AND dog_id IS NULL
               AND issued_by_family_id IN (SELECT id FROM families WHERE art = 'zuhause')`)
  }
})()
addColumnIfMissing('vouchers', 'label', 'TEXT')
addColumnIfMissing('vouchers', 'ausgeblendet_at', 'TEXT')
db.exec('CREATE INDEX IF NOT EXISTS idx_vouchers_created_by ON vouchers(created_by_family_id)')

// Phase V4a: Kalender der Partner (lib/partnerTermine.js, routes/partnerArea/termine.js). Ortszeit als Text - datum
// 'JJJJ-MM-TT', uhrzeit/ende 'HH:MM', gemeint ist Europe/Berlin; Serien rechnet lib/terminSerien.js aus datum, serie
// und serie_bis (höchstens ein Jahr). Gehen ohne Freigabe online (reiner Text, geprüft im Code); ausgeblendet = 1 setzt
// nur der Admin (routes/adminTermine.js). Bewusst ohne REFERENCES auf partners(id) - wie partner_einblicke.
// partner_termin_absagen: einzelne abgesagte Daten ("fällt aus") - verschwinden mit ihrem Termin (ON DELETE CASCADE).
db.exec(`
  CREATE TABLE IF NOT EXISTS partner_termine (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partner_id INTEGER NOT NULL,
    titel TEXT NOT NULL,
    text TEXT,
    ort TEXT,
    datum TEXT NOT NULL,
    uhrzeit TEXT NOT NULL,
    ende TEXT,
    serie TEXT NOT NULL DEFAULT 'keine'
      CHECK (serie IN ('keine', 'woechentlich', 'zweiwoechentlich', 'monatlich_tag', 'monatlich_wochentag')),
    serie_bis TEXT,
    ausgeblendet INTEGER NOT NULL DEFAULT 0,
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_partner_termine_partner ON partner_termine(partner_id, datum);
  CREATE TABLE IF NOT EXISTS partner_termin_absagen (
    termin_id INTEGER NOT NULL REFERENCES partner_termine(id) ON DELETE CASCADE,
    datum TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (termin_id, datum)
  );
`)

// Phase V4b: 1-2 Bannerfotos für den Kopf des Portals (lib/partnerBanner.js, routes/partnerArea/banner.js). position
// 1 oder 2 (lückenlos - Löschen rückt nach), foto_url ein /uploads/-Pfad wie bei den Einblicken (dieselbe Upload-Strecke:
// nur JPG/PNG, Metadaten entfernt). Öffentlich über /public-media nur, solange der Partner sichtbar ist
// (lib/publicMedia.js), der eigene Bereich sieht sie über /uploads (lib/uploadAccess.js). alt: optionaler Alternativtext.
// Bewusst ohne REFERENCES auf partners(id) - wie partner_einblicke. idx_partner_banner_foto: Datei-Freigabe je Dateiname.
db.exec(`
  CREATE TABLE IF NOT EXISTS partner_banner (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partner_id INTEGER NOT NULL,
    position INTEGER NOT NULL CHECK (position IN (1, 2)),
    foto_url TEXT NOT NULL,
    alt TEXT,
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (partner_id, position)
  );
  CREATE INDEX IF NOT EXISTS idx_partner_banner_foto ON partner_banner(foto_url);
`)

// Phase V4b: Telegram-Hinweise für Partner (lib/partnerTelegram.js, routes/partnerArea/telegram.js). partner_telegram: eine
// Zeile je Partner - chat_cipher die Chat-ID, verschlüsselt (lib/codes.js encryptSecret, AAD je Partner), NULL = nicht
// verbunden; hinweis_*: Schalter je Ereignis; getrennt_grund 'blockiert', wenn Telegram 403 meldet (Bot blockiert).
// partner_telegram_codes: Einmal-Codes für den Link https://t.me/<bot>?start=<code> - nur der HMAC (lib/codes.js
// hashCode), 15 Minuten gültig, einmal einlösbar. Bewusst ohne REFERENCES auf partners(id) - wie partner_einblicke.
db.exec(`
  CREATE TABLE IF NOT EXISTS partner_telegram (
    partner_id INTEGER PRIMARY KEY,
    chat_cipher TEXT,
    hinweis_nachricht INTEGER NOT NULL DEFAULT 1,
    hinweis_freigabe INTEGER NOT NULL DEFAULT 1,
    verbunden_at TEXT,
    getrennt_grund TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS partner_telegram_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partner_id INTEGER NOT NULL,
    code_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_partner_telegram_codes_partner ON partner_telegram_codes(partner_id);
`)
// security-review V4b: chat_hash - HMAC der Chat-ID (lib/codes.js hashCode), damit "/stop" in Telegram alle Verbindungen
// dieses Chats findet und "Chat finden" im Admin verbundene Partner-Chats auslässt, ohne jeden Geheimtext zu entschlüsseln.
addColumnIfMissing('partner_telegram', 'chat_hash', 'TEXT')
db.exec('CREATE INDEX IF NOT EXISTS idx_partner_telegram_chat_hash ON partner_telegram(chat_hash)')

module.exports = db
