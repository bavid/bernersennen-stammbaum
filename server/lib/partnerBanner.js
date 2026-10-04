'use strict'

// Phase V4b: Bannerfotos für den Kopf des Portals (Tabelle partner_banner, db.js). Prüfung der Eingaben und alle
// Abfragen; die Routen stehen in routes/partnerArea/banner.js. Die Fotos laufen durch dieselbe Upload-Strecke wie die
// Einblicke (lib/photoUpload.js: nur JPG/PNG, Magic Bytes, Metadaten entfernt) und liegen in config.uploadDir -
// öffentlich über /public-media nur, solange der Partner sichtbar ist (lib/publicMedia.js), der eigene Bereich sieht
// sie über /uploads (lib/uploadAccess.js). Positionen sind lückenlos 1..MAX_BANNER: Löschen rückt nach.
// Feedback-Runde: bis zu drei Fotos und ein Layout je Partner (BANNER_LAYOUTS, Spalte partners.banner_layout - beides
// legt dieses Modul selbst an, db.js ist an seiner Dateigrenze). Ohne gewähltes Layout gilt die Vorgabe aus der Zahl
// der Fotos (defaultLayout) - so sieht ein Kopf von vorher genauso aus wie bisher.

const db = require('../db')
const { stripUnsafeChars } = require('./partners')
const { toPublicMediaUrl } = require('./mediaUrls')

// Layout -> wie viele Fotos es zeigt. Die Reihenfolge ist die der Auswahl im Profil (client/src/lib/partnerBanner.js).
const BANNER_LAYOUTS = Object.freeze({ eins: 1, halb: 2, 'gross-links': 2, drei: 3 })
const LAYOUT_IDS = Object.freeze(Object.keys(BANNER_LAYOUTS))
const MAX_BANNER = Math.max(...Object.values(BANNER_LAYOUTS))
const MAX_ALT_LENGTH = 120
const FULL_MESSAGE = `Höchstens ${MAX_BANNER} Bannerfotos – bitte zuerst eins ersetzen oder entfernen.`
const NOT_FOUND_MESSAGE = 'Dieses Bannerfoto gibt es nicht'
const LAYOUT_MESSAGE = 'Bitte eins der angebotenen Layouts wählen.'
const POSITION_RE = new RegExp(`^[1-${MAX_BANNER}]$`)

// Ältere Datenbanken kennen nur die Positionen 1 und 2 (CHECK in partner_banner) - SQLite ändert ein CHECK nicht, also
// wird die Tabelle einmal neu angelegt (Spalten wie in db.js), die Zeilen samt Ids ziehen mit. true, wenn umgebaut.
const WIDE_TABLE_SQL = `
  CREATE TABLE partner_banner_neu (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partner_id INTEGER NOT NULL,
    position INTEGER NOT NULL CHECK (position IN (1, 2, 3)),
    foto_url TEXT NOT NULL,
    alt TEXT,
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (partner_id, position)
  );`
const COLUMNS = 'id, partner_id, position, foto_url, alt, is_demo, created_at'

function widenBannerPositions(database) {
  const table = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'partner_banner'").get()
  if (!table || !/IN\s*\(\s*1\s*,\s*2\s*\)/.test(table.sql)) return false
  database.transaction(() => {
    database.exec(WIDE_TABLE_SQL)
    database.exec(`INSERT INTO partner_banner_neu (${COLUMNS}) SELECT ${COLUMNS} FROM partner_banner`)
    database.exec('DROP TABLE partner_banner')
    database.exec('ALTER TABLE partner_banner_neu RENAME TO partner_banner')
    database.exec('CREATE INDEX IF NOT EXISTS idx_partner_banner_foto ON partner_banner(foto_url)')
  })()
  return true
}

function ensureLayoutColumn(database) {
  const exists = database.prepare("SELECT 1 FROM pragma_table_info('partners') WHERE name = 'banner_layout'").get()
  if (!exists) database.exec('ALTER TABLE partners ADD COLUMN banner_layout TEXT')
}

widenBannerPositions(db)
ensureLayoutColumn(db)

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

// --- Prüfung -------------------------------------------------------------------------------------

// Alternativtext (im Profil "Kurze Beschreibung"): optional, reiner Text in einer Zeile (Steuer- und Bidi-Zeichen
// raus), kein HTML, höchstens MAX_ALT_LENGTH Zeichen. undefined/null/'' -> null.
function validateAlt(value) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') throw httpError(400, 'Die Beschreibung muss reiner Text sein.')
  const alt = stripUnsafeChars(value).trim()
  if (!alt) return null
  if (alt.length > MAX_ALT_LENGTH) throw httpError(400, `Die Beschreibung darf höchstens ${MAX_ALT_LENGTH} Zeichen haben.`)
  if (/[<>]/.test(alt)) throw httpError(400, 'Die Beschreibung darf nur reinen Text enthalten (kein HTML).')
  return alt
}

// Position aus der URL (/banner/:position) - nur "1" bis "3", sonst null (die Route antwortet 404).
function parsePosition(value) {
  return typeof value === 'string' && POSITION_RE.test(value) ? Number(value) : null
}

// Änderung des Alternativtexts: genau { alt } - andere Felder -> 400, statt sie stillschweigend zu übergehen.
function validateBannerUpdate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw httpError(400, 'Ungültige Angaben')
  const unknown = Object.keys(body).find((key) => key !== 'alt')
  if (unknown !== undefined) throw httpError(400, `Dieses Feld lässt sich hier nicht ändern: ${unknown}`)
  if (!Object.hasOwn(body, 'alt')) throw httpError(400, 'Bitte die Beschreibung mitschicken.')
  return validateAlt(body.alt)
}

// Layout-Wahl: genau { layout } mit einem Wert aus BANNER_LAYOUTS - alles andere -> 400.
function validateLayoutUpdate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw httpError(400, 'Ungültige Angaben')
  const unknown = Object.keys(body).find((key) => key !== 'layout')
  if (unknown !== undefined) throw httpError(400, `Dieses Feld lässt sich hier nicht ändern: ${unknown.slice(0, 40)}`)
  if (!LAYOUT_IDS.includes(body.layout)) throw httpError(400, LAYOUT_MESSAGE)
  return body.layout
}

// Vorgabe ohne gewähltes Layout: so viele Fotos, wie da sind - zwei wie bisher groß links, klein rechts.
function defaultLayout(count) {
  if (count >= 3) return 'drei'
  return count === 2 ? 'gross-links' : 'eins'
}

// --- Antwortformen -------------------------------------------------------------------------------

// Für den Partner selbst: das Foto über /uploads (der eigene Bereich sieht es, lib/uploadAccess.js).
function ownBanner(row) {
  return { position: row.position, fotoUrl: row.foto_url, alt: row.alt }
}

// Öffentlich (Portal): das Foto über /public-media. preview: true (Kundensicht) behält die /uploads-Adresse - ein
// Entwurf gibt über /public-media nichts frei (wie lib/einblicke.js publicEinblick).
function publicBanner(row, { preview = false } = {}) {
  return { fotoUrl: preview ? row.foto_url : toPublicMediaUrl(row.foto_url), alt: row.alt }
}

// --- Abfragen ------------------------------------------------------------------------------------

const listStmt = db.prepare('SELECT * FROM partner_banner WHERE partner_id = ? ORDER BY position')
const countStmt = db.prepare('SELECT COUNT(*) AS c FROM partner_banner WHERE partner_id = ?')
const findStmt = db.prepare('SELECT * FROM partner_banner WHERE partner_id = ? AND position = ?')
const insertStmt = db.prepare(
  'INSERT INTO partner_banner (partner_id, position, foto_url, alt, is_demo, created_at) VALUES (?, ?, ?, ?, ?, COALESCE(?, datetime(\'now\')))'
)
const replaceStmt = db.prepare("UPDATE partner_banner SET foto_url = ?, alt = ?, created_at = datetime('now') WHERE id = ?")
const updateAltStmt = db.prepare('UPDATE partner_banner SET alt = ? WHERE id = ?')
const deleteStmt = db.prepare('DELETE FROM partner_banner WHERE id = ?')
const followingStmt = db.prepare('SELECT id, position FROM partner_banner WHERE partner_id = ? AND position > ? ORDER BY position')
const moveStmt = db.prepare('UPDATE partner_banner SET position = ? WHERE id = ?')
const layoutStmt = db.prepare('SELECT banner_layout FROM partners WHERE id = ?')
const saveLayoutStmt = db.prepare('UPDATE partners SET banner_layout = ? WHERE id = ?')

function listBanner(partnerId) {
  return listStmt.all(partnerId)
}

function countBanner(partnerId) {
  return countStmt.get(partnerId).c
}

// Neues Foto an die nächste freie Stelle - zählen und anlegen in EINER Transaktion, zwei gleichzeitige Uploads
// können die Grenze so nicht gemeinsam überschreiten. is_demo folgt dem Partner. createdAt nur für den Demo-Aufbau.
const addBanner = db.transaction(({ partner, fotoUrl, alt, createdAt = null }) => {
  const count = countBanner(partner.id)
  if (count >= MAX_BANNER) throw httpError(409, FULL_MESSAGE)
  insertStmt.run(partner.id, count + 1, fotoUrl, alt, partner.is_demo ? 1 : 0, createdAt)
  return findStmt.get(partner.id, count + 1)
})

// Ersetzt das Foto an position (der Alternativtext kommt mit dem neuen Foto). Ergebnis: { row, previousUrl } - die
// alte Datei entfernt der Aufrufer erst nach der Transaktion. Unbekannte Position -> 404.
const replaceBanner = db.transaction(({ partnerId, position, fotoUrl, alt }) => {
  const existing = findStmt.get(partnerId, position)
  if (!existing) throw httpError(404, NOT_FOUND_MESSAGE)
  replaceStmt.run(fotoUrl, alt, existing.id)
  return { row: findStmt.get(partnerId, position), previousUrl: existing.foto_url }
})

// undefined, wenn es an dieser Stelle kein Foto gibt.
function updateBannerAlt(partnerId, position, alt) {
  const existing = findStmt.get(partnerId, position)
  if (!existing) return undefined
  updateAltStmt.run(alt, existing.id)
  return findStmt.get(partnerId, position)
}

// Entfernt das Foto an position und rückt die folgenden nach. Gibt die Adresse der Datei zurück (der Aufrufer
// entfernt sie) oder null, wenn es dort keins gab.
const deleteBanner = db.transaction((partnerId, position) => {
  const existing = findStmt.get(partnerId, position)
  if (!existing) return null
  deleteStmt.run(existing.id)
  // Eins nach dem anderen aufwärts - ein einzelnes UPDATE könnte die Reihenfolge vertauschen und an UNIQUE scheitern.
  for (const row of followingStmt.all(partnerId, position)) moveStmt.run(row.position - 1, row.id)
  return existing.foto_url
})

// Das Layout des Partners - gewählt oder (nichts bzw. Unbekanntes gespeichert) die Vorgabe aus der Zahl der Fotos.
function readLayout(partnerId) {
  const stored = layoutStmt.get(partnerId)?.banner_layout
  return LAYOUT_IDS.includes(stored) ? stored : defaultLayout(countBanner(partnerId))
}

function saveLayout(partnerId, layout) {
  if (!LAYOUT_IDS.includes(layout)) throw httpError(400, LAYOUT_MESSAGE)
  saveLayoutStmt.run(layout, partnerId)
}

module.exports = {
  BANNER_LAYOUTS,
  MAX_BANNER,
  MAX_ALT_LENGTH,
  FULL_MESSAGE,
  NOT_FOUND_MESSAGE,
  validateAlt,
  validateBannerUpdate,
  validateLayoutUpdate,
  defaultLayout,
  widenBannerPositions,
  parsePosition,
  ownBanner,
  publicBanner,
  listBanner,
  countBanner,
  addBanner,
  replaceBanner,
  updateBannerAlt,
  deleteBanner,
  readLayout,
  saveLayout
}
