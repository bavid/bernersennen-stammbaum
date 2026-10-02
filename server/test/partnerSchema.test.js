const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const Database = require('better-sqlite3')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, createHousehold, getCookie } = require('./helpers')

// Phase P Task 1 (docs/superpowers/plans/2026-09-29-phase-p-partnerbereich.md): Umbau der partners-Tabelle
// (neue Typen hundesalon/betreuung), neue Spalten, Bereichsart 'partner' und die Admin-Endpunkte
// /partners/:id/area(/key). t.test() bleibt auf einer Ebene.
const ADMIN_TEST_PASSWORD = 'admin-test-partner-schema-1'
const dataDir = useTempDataDir('partner-schema', { LOGIN_RATE_LIMIT: '200', CODE_RATE_LIMIT: '200' })
const SERVER_DIR = path.join(__dirname, '..')
const KEY_RE = /^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/

// --- Migration ------------------------------------------------------------------------------------

// Das partners-Schema VOR Phase P (wörtlich aus db.js), plus die Tabellen, deren partner_id auf einen
// Partner zeigt. partner_refs gibt es in der App nicht - sie prüft, dass eine echte Fremdschlüssel-
// Referenz (REFERENCES partners(id)) den Umbau unbeschadet übersteht.
const OLD_SCHEMA_SQL = `
  CREATE TABLE families (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    art TEXT NOT NULL DEFAULT 'rudel',
    partner_id INTEGER
  );
  CREATE TABLE partners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    typ TEXT NOT NULL CHECK (typ IN ('tierheim','vermittlung','hundeschule','futter','sonstige')),
    ist_partner INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'entwurf' CHECK (status IN ('entwurf','aktiv','pausiert')),
    plz TEXT, ort TEXT, lat REAL, lon REAL,
    website TEXT, spenden_url TEXT, vermittlung_url TEXT,
    kontakt_email TEXT, kontakt_telefon TEXT,
    logo_file TEXT, portal_titel TEXT, portal_text TEXT, farbe TEXT,
    quelle TEXT NOT NULL DEFAULT 'manuell' CHECK (quelle IN ('manuell','osm','sitecheck')),
    osm_ref TEXT, is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_partners_status ON partners(status);
  CREATE TABLE voucher_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('admin','rudel','partner','demo')),
    partner_id INTEGER,
    size INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE vouchers (
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
  CREATE TABLE partner_refs (id INTEGER PRIMARY KEY, partner_id INTEGER NOT NULL REFERENCES partners(id));
`

const OLD_PARTNER_COLUMNS = [
  'id', 'slug', 'name', 'typ', 'ist_partner', 'status', 'plz', 'ort', 'lat', 'lon', 'website', 'spenden_url',
  'vermittlung_url', 'kontakt_email', 'kontakt_telefon', 'logo_file', 'portal_titel', 'portal_text', 'farbe',
  'quelle', 'osm_ref', 'is_demo', 'created_at'
]

function seedOldDatabase(dbFile, { extraPartnerColumn = false } = {}) {
  const seedDb = new Database(dbFile)
  seedDb.exec(OLD_SCHEMA_SQL)
  if (extraPartnerColumn) seedDb.exec('ALTER TABLE partners ADD COLUMN unbekannte_spalte TEXT')
  const insertPartner = seedDb.prepare(
    `INSERT INTO partners (slug, name, typ, status, plz, ort, lat, lon, website, portal_text, logo_file, is_demo, created_at)
     VALUES (@slug, @name, @typ, @status, @plz, @ort, @lat, @lon, @website, @portal_text, @logo_file, @is_demo, @created_at)`
  )
  const base = { plz: '10115', ort: 'Berlin', lat: 52.53, lon: 13.38, website: null, portal_text: null, logo_file: null, is_demo: 0 }
  insertPartner.run({ ...base, slug: 'tierheim-altbestand', name: 'Tierheim Altbestand', typ: 'tierheim', status: 'aktiv', website: 'https://example.org/', created_at: '2026-01-02 03:04:05' })
  insertPartner.run({ ...base, slug: 'hundeschule-altbestand', name: 'Hundeschule Altbestand', typ: 'hundeschule', status: 'entwurf', portal_text: 'Zeile eins\nZeile zwei', created_at: '2026-02-03 04:05:06' })
  insertPartner.run({ ...base, slug: 'futter-altbestand', name: 'Futterladen Altbestand', typ: 'futter', status: 'pausiert', logo_file: '00000000-0000-0000-0000-000000000000.png', is_demo: 1, created_at: '2026-03-04 05:06:07' })
  // Der Partner mit der höchsten Id wurde gelöscht - seine Id darf nach dem Umbau nicht neu vergeben werden.
  insertPartner.run({ ...base, slug: 'geloescht-altbestand', name: 'Gelöscht', typ: 'sonstige', status: 'entwurf', created_at: '2026-04-05 06:07:08' })
  seedDb.prepare("DELETE FROM partners WHERE slug = 'geloescht-altbestand'").run()

  seedDb.prepare("INSERT INTO families (name, password_hash, art, partner_id) VALUES ('Tierheim Altbestand', '!', 'tierheim', 1)").run()
  seedDb.prepare("INSERT INTO voucher_batches (label, kind, partner_id, size) VALUES ('Partner-Stapel', 'partner', 2, 1)").run()
  seedDb.prepare("INSERT INTO vouchers (batch_id, code_hash, code_hint, partner_id) VALUES (1, 'hash-altbestand', 'ABCD', 2)").run()
  seedDb.prepare("INSERT INTO promotions (partner_id, bereich, kennzeichnung, titel) VALUES (3, 'futter', 'Anzeige', 'Futter-Anzeige')").run()
  seedDb.prepare('INSERT INTO partner_refs (id, partner_id) VALUES (1, 1)').run()
  seedDb.close()
}

// db.js in einem eigenen Prozess laden (wie test/schema-vouchers.test.js), damit die Migration auf der
// alten Datei läuft. Gibt die Ausgabe des Kindprozesses zurück.
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
  const partners = checkDb.prepare('SELECT * FROM partners ORDER BY id').all()
  checkDb.close()
  return { schema, partners }
}

test('Migration: alte partners-Tabelle wird einmalig umgebaut, Daten und Verweise bleiben erhalten', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronik-partner-rebuild-'))
  const dbFile = path.join(dir, 'old.db')
  try {
    seedOldDatabase(dbFile)
    const before = new Database(dbFile, { readonly: true })
    const oldRows = before.prepare(`SELECT ${OLD_PARTNER_COLUMNS.join(', ')} FROM partners ORDER BY id`).all()
    before.close()

    assert.equal(runMigration(dir, dbFile), '1', 'foreign_keys muss nach dem Umbau wieder ON sein')

    const migrated = new Database(dbFile)
    const tableSql = migrated.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'partners'").get().sql
    assert.match(tableSql, /'hundesalon'/)
    assert.match(tableSql, /'betreuung'/)
    assert.equal(
      migrated.prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE name = 'partners_neu' OR sql LIKE '%partners_neu%'").get().c,
      0,
      'kein Rest von partners_neu im Schema'
    )

    // Alle alten Spalten unverändert, neue Spalten mit ihren Defaults
    assert.deepEqual(migrated.prepare(`SELECT ${OLD_PARTNER_COLUMNS.join(', ')} FROM partners ORDER BY id`).all(), oldRows)
    for (const row of migrated.prepare('SELECT gesperrt, kontakt_formular_url, kontaktformular_aktiv, vertrauenswuerdig FROM partners').all()) {
      assert.deepEqual(row, { gesperrt: 0, kontakt_formular_url: null, kontaktformular_aktiv: 1, vertrauenswuerdig: 0 })
    }

    // Verweise über partner_id (ohne REFERENCES) und eine echte Fremdschlüssel-Referenz bleiben gültig
    assert.equal(migrated.prepare("SELECT p.slug FROM families f JOIN partners p ON p.id = f.partner_id WHERE f.art = 'tierheim'").get().slug, 'tierheim-altbestand')
    assert.equal(migrated.prepare('SELECT p.slug FROM voucher_batches b JOIN partners p ON p.id = b.partner_id').get().slug, 'hundeschule-altbestand')
    assert.equal(migrated.prepare('SELECT p.slug FROM vouchers v JOIN partners p ON p.id = v.partner_id').get().slug, 'hundeschule-altbestand')
    assert.equal(migrated.prepare('SELECT p.slug FROM promotions m JOIN partners p ON p.id = m.partner_id').get().slug, 'futter-altbestand')
    assert.match(migrated.prepare("SELECT sql FROM sqlite_master WHERE name = 'partner_refs'").get().sql, /REFERENCES partners\(id\)/)
    assert.deepEqual(migrated.pragma('foreign_key_check'), [])
    assert.equal(migrated.pragma('integrity_check', { simple: true }), 'ok')

    // Index und UNIQUE(slug) sind wieder da, neue Typen gehen, Züchter weiterhin nicht
    const indexes = migrated.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'partners'").all().map((r) => r.name)
    assert.ok(indexes.includes('idx_partners_status'))
    assert.throws(() => migrated.prepare("INSERT INTO partners (slug, name, typ) VALUES ('tierheim-altbestand', 'Doppelt', 'sonstige')").run(), /UNIQUE/)
    const salonId = migrated.prepare("INSERT INTO partners (slug, name, typ) VALUES ('salon-neu', 'Hundesalon Neu', 'hundesalon')").run().lastInsertRowid
    assert.ok(salonId > 4, 'die Id des gelöschten Partners (4) wird nicht neu vergeben')
    migrated.prepare("INSERT INTO partners (slug, name, typ) VALUES ('betreuung-neu', 'Betreuung Neu', 'betreuung')").run()
    assert.throws(() => migrated.prepare("INSERT INTO partners (slug, name, typ) VALUES ('zucht-neu', 'Zucht', 'zuechter')").run(), /CHECK/)

    // voucher_batches hat die neuen Spalten
    assert.deepEqual(migrated.prepare('SELECT zweck, partner_typ FROM voucher_batches').get(), { zweck: 'chronik', partner_typ: null })
    migrated.close()

    // Zweiter Start: nichts ändert sich mehr (weder Schema noch Daten)
    const afterFirst = schemaSnapshot(dbFile)
    runMigration(dir, dbFile)
    assert.deepEqual(schemaSnapshot(dbFile), afterFirst)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('Migration: eine unbekannte Spalte bricht den Umbau ab, statt sie zu verlieren (Rollback)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronik-partner-rebuild-fail-'))
  const dbFile = path.join(dir, 'old.db')
  try {
    seedOldDatabase(dbFile, { extraPartnerColumn: true })
    assert.throws(() => runMigration(dir, dbFile), /unbekannte_spalte/)

    const checkDb = new Database(dbFile, { readonly: true })
    assert.doesNotMatch(checkDb.prepare("SELECT sql FROM sqlite_master WHERE name = 'partners'").get().sql, /hundesalon/)
    assert.equal(checkDb.prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE name = 'partners_neu'").get().c, 0)
    assert.equal(checkDb.prepare('SELECT COUNT(*) AS c FROM partners').get().c, 3)
    checkDb.close()
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// --- Admin, Bereiche, Sitzungen -------------------------------------------------------------------

function samplePartner(overrides = {}) {
  return { name: 'Hundeschule Wiesengrund', typ: 'hundeschule', plz: '10115', status: 'aktiv', ...overrides }
}

test('Partner-Bereiche für alle Typen, Hundesalon/Betreuung, Kontaktformular-Link', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')

  const adminLogin = await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: ADMIN_TEST_PASSWORD } })
  const adminCookie = getCookie(adminLogin.res)
  const post = (urlPath, body, cookie = adminCookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const put = (urlPath, body, cookie = adminCookie) => call(base, urlPath, { method: 'PUT', body, cookie })
  const get = (urlPath, cookie = adminCookie) => call(base, urlPath, { cookie })
  const del = (urlPath, cookie = adminCookie) => call(base, urlPath, { method: 'DELETE', cookie })

  async function createPartner(overrides) {
    const res = await post('/api/admin/partners', samplePartner(overrides))
    assert.equal(res.status, 201, JSON.stringify(res.data))
    return res.data
  }

  async function loginWithKey(key) {
    const res = await post('/api/login', { secret: key }, null)
    assert.equal(res.status, 200)
    return { me: res.data, cookie: getCookie(res.res) }
  }

  const adminPartner = async (id) => (await get('/api/admin/partners')).data.find((p) => p.id === id)

  let schoolPartner
  let schoolArea

  await t.test('Neue Typen: Hundesalon und Betreuung lassen sich anlegen, Züchter bleibt ausgeschlossen', async () => {
    const salon = await createPartner({ name: 'Hundesalon Seidenfell', typ: 'hundesalon' })
    assert.equal(salon.typ, 'hundesalon')
    assert.equal(salon.gesperrt, 0)
    assert.equal(salon.kontaktformular_aktiv, 1)
    assert.equal(salon.kontakt_formular_url, null)

    const betreuung = await createPartner({ name: 'Tagesstätte Pfotenpause', typ: 'betreuung' })
    assert.equal(betreuung.typ, 'betreuung')

    assert.equal((await post('/api/admin/partners', samplePartner({ name: 'Zwinger vom Deich', typ: 'zuechter' }))).status, 400)
  })

  await t.test('Kontaktformular-Link: nur http(s), steht im Portal, bleibt ohne Feld im Update erhalten', async () => {
    assert.equal((await post('/api/admin/partners', samplePartner({ name: 'Formular JS', kontaktFormularUrl: 'javascript:alert(1)' }))).status, 400)
    assert.equal((await post('/api/admin/partners', samplePartner({ name: 'Formular FTP', kontaktFormularUrl: 'ftp://example.org/kontakt' }))).status, 400)

    const created = await createPartner({ name: 'Hundeschule Formular', slug: 'hundeschule-formular', kontaktFormularUrl: 'www.example.org/kontakt' })
    assert.equal(created.kontakt_formular_url, 'https://www.example.org/kontakt')

    const portal = await get('/api/public/partners/hundeschule-formular', null)
    assert.equal(portal.status, 200)
    assert.equal(portal.data.kontakt_formular_url, 'https://www.example.org/kontakt')

    // Ein Update ohne kontaktFormularUrl/kontaktformularAktiv (z. B. der bisherige Admin-Client) lässt beide stehen
    const untouched = await put(`/api/admin/partners/${created.id}`, samplePartner({ name: 'Hundeschule Formular' }))
    assert.equal(untouched.status, 200)
    assert.equal(untouched.data.kontakt_formular_url, 'https://www.example.org/kontakt')
    assert.equal(untouched.data.kontaktformular_aktiv, 1)

    const switchedOff = await put(`/api/admin/partners/${created.id}`, samplePartner({ name: 'Hundeschule Formular', kontaktformularAktiv: false }))
    assert.equal(switchedOff.data.kontaktformular_aktiv, 0)
    assert.equal((await put(`/api/admin/partners/${created.id}`, samplePartner({ name: 'Hundeschule Formular', kontaktformularAktiv: 'nein' }))).status, 400)

    const cleared = await put(`/api/admin/partners/${created.id}`, samplePartner({ name: 'Hundeschule Formular', kontaktFormularUrl: '' }))
    assert.equal(cleared.data.kontakt_formular_url, null)
    assert.equal(cleared.data.kontaktformular_aktiv, 0)
  })

  await t.test('POST /partners/:id/area für eine Hundeschule: art partner, is_demo vom Partner, Schlüssel einmalig', async () => {
    schoolPartner = await createPartner({ name: 'Hundeschule Bereichstest', slug: 'hundeschule-bereichstest' })
    const area = await post(`/api/admin/partners/${schoolPartner.id}/area`)
    assert.equal(area.status, 201)
    assert.equal(area.data.art, 'partner')
    assert.ok(Number.isInteger(area.data.familyId))
    assert.match(area.data.key, KEY_RE)
    schoolArea = area.data

    const family = db
      .prepare('SELECT name, art, partner_id, is_demo, password_hash, legacy_password, access_key_hash FROM families WHERE id = ?')
      .get(schoolArea.familyId)
    assert.equal(family.art, 'partner')
    assert.equal(family.partner_id, schoolPartner.id)
    assert.equal(family.name, 'Hundeschule Bereichstest')
    assert.equal(family.is_demo, 0)
    assert.equal(family.password_hash, '!')
    assert.equal(family.legacy_password, 0)
    assert.ok(family.access_key_hash)

    assert.equal((await post(`/api/admin/partners/${schoolPartner.id}/area`)).status, 409)
    // Der alte Pfad /shelter bleibt Tierheimen/Vermittlungen vorbehalten
    assert.equal((await post(`/api/admin/partners/${schoolPartner.id}/shelter`)).status, 400)
    assert.equal((await post(`/api/admin/partners/${schoolPartner.id}/shelter/key`)).status, 404)
    assert.equal((await post('/api/admin/partners/999999/area')).status, 404)

    const household = await createHousehold(base, 'Familie Ohne Admin')
    assert.equal((await post(`/api/admin/partners/${schoolPartner.id}/area`, undefined, household.cookie)).status, 401)
  })

  await t.test('GET /api/admin/partners liefert area_family_id, area_art und gesperrt', async () => {
    const row = await adminPartner(schoolPartner.id)
    assert.equal(row.area_family_id, schoolArea.familyId)
    assert.equal(row.area_art, 'partner')
    assert.equal(row.gesperrt, 0)
    assert.equal(row.shelter_family_id, null)

    const without = await createPartner({ name: 'Hundeschule Ohne Bereich', slug: 'hundeschule-ohne-bereich' })
    const withoutRow = await adminPartner(without.id)
    assert.equal(withoutRow.area_family_id, null)
    assert.equal(withoutRow.area_art, null)
  })

  await t.test('Schlüssel-Login: me.art partner, me.partner mit slug/typ/status/gesperrt', async () => {
    const { me, cookie } = await loginWithKey(schoolArea.key)
    assert.equal(me.art, 'partner')
    assert.equal(me.id, schoolArea.familyId)
    assert.deepEqual(me.partner, {
      id: schoolPartner.id,
      slug: 'hundeschule-bereichstest',
      name: 'Hundeschule Bereichstest',
      typ: 'hundeschule',
      status: 'aktiv',
      gesperrt: false,
      // V-Fehler 3: Änderungen an freigegebenen Beiträgen gehen nur bei vertrauenswürdigen Partnern sofort online
      vertrauenswuerdig: false,
      // Phase P2 Task 9: ungelesene Nachrichten im Posteingang
      unread: 0
    })

    const again = await get('/api/me', cookie)
    assert.equal(again.data.art, 'partner')
    assert.equal(again.data.partner.slug, 'hundeschule-bereichstest')
  })

  await t.test('Aus dem Partner-Bereich: Beitreten, Gründen, claim und Tier anlegen -> 400', async () => {
    const { cookie } = await loginWithKey(schoolArea.key)

    assert.equal((await post('/api/families/join', { password: 'irgendein-passwort' }, cookie)).status, 400)
    assert.equal((await post('/api/families/group', { name: 'Neues Rudel', password: 'rudel-passwort-1' }, cookie)).status, 400)
    assert.equal((await post('/api/vouchers/claim', { code: 'ABCD-EFGH-JKMN' }, cookie)).status, 400)

    const dog = await post('/api/dogs', { name: 'Flocke', geschlecht: 'huendin', tierart: 'hund' }, cookie)
    assert.equal(dog.status, 400)
    assert.equal(dog.data.error, 'Partner-Bereiche haben keine Tiere')
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM dogs WHERE family_id = ?').get(schoolArea.familyId).c, 0)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM family_members WHERE member_family_id = ?').get(schoolArea.familyId).c, 0)
  })

  await t.test('POST /partners/:id/area/key: neuer Schlüssel, alte Sitzung und alter Schlüssel fallen raus', async () => {
    const { cookie: oldCookie } = await loginWithKey(schoolArea.key)

    const reissued = await post(`/api/admin/partners/${schoolPartner.id}/area/key`)
    assert.equal(reissued.status, 200)
    assert.match(reissued.data.key, KEY_RE)
    assert.notEqual(reissued.data.key, schoolArea.key)

    assert.equal((await get('/api/me', oldCookie)).status, 401)
    assert.equal((await post('/api/login', { secret: schoolArea.key }, null)).status, 401)
    const { me } = await loginWithKey(reissued.data.key)
    assert.equal(me.id, schoolArea.familyId)
    schoolArea = { ...schoolArea, key: reissued.data.key }

    const withoutArea = await createPartner({ name: 'Hundeschule Ohne Schlüssel', slug: 'hundeschule-ohne-schluessel' })
    assert.equal((await post(`/api/admin/partners/${withoutArea.id}/area/key`)).status, 404)
    assert.equal((await post('/api/admin/partners/999999/area/key')).status, 404)
  })

  await t.test('Tierheim: /area legt art tierheim an, /shelter bleibt Alias, ein zweiter Bereich -> 409', async () => {
    const shelterPartner = await createPartner({ name: 'Tierheim Lindenweg', typ: 'tierheim', slug: 'tierheim-lindenweg' })
    const area = await post(`/api/admin/partners/${shelterPartner.id}/area`)
    assert.equal(area.status, 201)
    assert.equal(area.data.art, 'tierheim')
    assert.equal(db.prepare('SELECT art FROM families WHERE id = ?').get(area.data.familyId).art, 'tierheim')
    assert.equal((await post(`/api/admin/partners/${shelterPartner.id}/shelter`)).status, 409)

    const row = await adminPartner(shelterPartner.id)
    assert.equal(row.area_family_id, area.data.familyId)
    assert.equal(row.area_art, 'tierheim')
    assert.equal(row.shelter_family_id, area.data.familyId)

    const { me } = await loginWithKey(area.data.key)
    assert.equal(me.art, 'tierheim')
    assert.deepEqual(me.partner, {
      id: shelterPartner.id,
      slug: 'tierheim-lindenweg',
      name: 'Tierheim Lindenweg',
      typ: 'tierheim',
      status: 'aktiv',
      gesperrt: false,
      vertrauenswuerdig: false,
      unread: 0
    })

    // Vermittlung über den alten Pfad, danach /area -> 409, beide Schlüssel-Pfade funktionieren
    const vermittlung = await createPartner({ name: 'Vermittlung Seeblick', typ: 'vermittlung', slug: 'vermittlung-seeblick' })
    const viaShelter = await post(`/api/admin/partners/${vermittlung.id}/shelter`)
    assert.equal(viaShelter.status, 201)
    assert.equal(viaShelter.data.art, 'tierheim')
    assert.equal((await post(`/api/admin/partners/${vermittlung.id}/area`)).status, 409)
    assert.equal((await post(`/api/admin/partners/${vermittlung.id}/shelter/key`)).status, 200)
    assert.equal((await post(`/api/admin/partners/${vermittlung.id}/area/key`)).status, 200)
  })

  await t.test('Bereich eines Demo-Partners bekommt is_demo=1', async () => {
    const demoSalon = await createPartner({ name: 'Hundesalon Demo-Test', typ: 'hundesalon', slug: 'hundesalon-demo-test' })
    db.prepare('UPDATE partners SET is_demo = 1 WHERE id = ?').run(demoSalon.id)
    const area = await post(`/api/admin/partners/${demoSalon.id}/area`)
    assert.equal(area.status, 201)
    assert.equal(db.prepare('SELECT is_demo, art FROM families WHERE id = ?').get(area.data.familyId).is_demo, 1)
  })

  await t.test('Löschen: ein Partner-Bereich blockiert das Löschen wie ein Tierheim-Bereich', async () => {
    const draft = await createPartner({ name: 'Betreuung Entwurf', typ: 'betreuung', slug: 'betreuung-entwurf', status: 'entwurf' })
    assert.equal((await post(`/api/admin/partners/${draft.id}/area`)).status, 201)
    const blocked = await del(`/api/admin/partners/${draft.id}`)
    assert.equal(blocked.status, 409)
    assert.match(blocked.data.error, /Partner-Bereich/)
    assert.ok(await adminPartner(draft.id))
  })

  await t.test('Typwechsel über die Grenze Tierheim/übrige Partner bei bestehendem Bereich -> 409, innerhalb geht', async () => {
    const crossing = await put(`/api/admin/partners/${schoolPartner.id}`, samplePartner({ name: 'Hundeschule Bereichstest', typ: 'tierheim' }))
    assert.equal(crossing.status, 409)
    assert.equal((await adminPartner(schoolPartner.id)).typ, 'hundeschule')

    const within = await put(`/api/admin/partners/${schoolPartner.id}`, samplePartner({ name: 'Hundeschule Bereichstest', typ: 'hundesalon' }))
    assert.equal(within.status, 200)
    assert.equal(within.data.typ, 'hundesalon')

    // Ohne Bereich darf der Typ frei wechseln
    const free = await createPartner({ name: 'Hundeschule Typwechsel', slug: 'hundeschule-typwechsel' })
    assert.equal((await put(`/api/admin/partners/${free.id}`, samplePartner({ name: 'Hundeschule Typwechsel', typ: 'tierheim' }))).status, 200)
  })
})
