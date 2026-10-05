'use strict'

// Phase F: „So finanzieren wir uns“ - die Zahlen und Hinweise, die der Admin pflegt (routes/adminFinanzierung.js) und die
// öffentliche Seite /finanzierung liest (routes/finanzierung.js). Drei Dinge: der Spenden-Hinweis (Text und/oder Link,
// settings-Schlüssel finanzierung_spenden_hinweis), das aktuelle Ziel („Ziel: 500 € für die Hundewiese“, Schlüssel
// finanzierung_ziel) und die Quartale (eigene Tabelle finanzierung_quartale: Einnahmen Spenden, Einnahmen Partner, Kosten,
// Spenden weitergegeben - alles in ganzen Cent wie donation_reports). Die Tabelle legt dieses Modul selbst an (db.js ist an
// seiner Dateigrenze). Keine Demo-Trennung: die Seite ist für alle gleich und zeigt nur, was der Admin eingetragen hat.
// Reiner Text (Steuer-/Bidi-Zeichen raus, kein HTML), Links nur http(s) - der Client zeigt alles nur als Text bzw. href.

const db = require('../db')
const { stripUnsafeChars, sanitizeExternalUrl } = require('./partners')

db.exec(`
  CREATE TABLE IF NOT EXISTS finanzierung_quartale (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jahr INTEGER NOT NULL,
    quartal INTEGER NOT NULL CHECK (quartal BETWEEN 1 AND 4),
    einnahmen_spenden_cents INTEGER NOT NULL DEFAULT 0,
    einnahmen_partner_cents INTEGER NOT NULL DEFAULT 0,
    kosten_cents INTEGER NOT NULL DEFAULT 0,
    spenden_weitergegeben_cents INTEGER NOT NULL DEFAULT 0,
    notiz TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (jahr, quartal)
  );
`)

const KEY_SPENDEN_HINWEIS = 'finanzierung_spenden_hinweis'
const KEY_ZIEL = 'finanzierung_ziel'

const LIMITS = Object.freeze({ hinweisText: 400, zielTitel: 80, empfaenger: 120, notiz: 200, jahrMin: 2024, jahrMax: 2100 })
// Wie lib/promotions.js MAX_CENTS: zehn Millionen Euro reichen.
const MAX_CENTS = 1e9
const MAX_URL_LENGTH = 300

const HINWEIS_FIELDS = Object.freeze(['text', 'url'])
const ZIEL_FIELDS = Object.freeze(['titel', 'betragCents', 'empfaenger'])
// Betragsfelder der Quartale: Eingabe (camelCase) -> Spalte.
const QUARTAL_AMOUNTS = Object.freeze({
  einnahmenSpendenCents: 'einnahmen_spenden_cents',
  einnahmenPartnerCents: 'einnahmen_partner_cents',
  kostenCents: 'kosten_cents',
  spendenWeitergegebenCents: 'spenden_weitergegeben_cents'
})
const QUARTAL_FIELDS = Object.freeze(['jahr', 'quartal', ...Object.keys(QUARTAL_AMOUNTS), 'notiz'])

const HTML_RE = /[<>]/
// Wie lib/einladungRueckseite.js: unsichtbare Zeichen, die stripUnsafeChars nicht kennt.
const INVISIBLE_RE = /[\u200B\u200E\u200F\u2060\u061C\uFEFF\u2028\u2029]/g
const MAX_KEY_ECHO = 40

function httpError(status, message, feld) {
  const err = new Error(message)
  err.status = status
  if (feld) err.feld = feld
  return err
}

function assertKnownFields(body, fields) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw httpError(400, 'Bitte die Angaben als Objekt senden.')
  const unknown = Object.keys(body).find((key) => !fields.includes(key))
  if (unknown !== undefined) throw httpError(400, `Unbekanntes Feld: ${unknown.slice(0, MAX_KEY_ECHO)}`)
}

// Reiner Text: gesäubert, höchstens max Zeichen; mehrzeilig behält Zeilenumbrüche (Spendenkonto, Verwendungszweck).
// undefined/null zählen als leer. Liefert '' für leer.
function cleanText(value, { feld, label, max, multiline = false }) {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') throw httpError(400, `${label} muss Text sein.`, feld)
  const stripped = stripUnsafeChars(value, { allowNewline: multiline }).replace(INVISIBLE_RE, '')
  const text = multiline
    ? stripped
        .split('\n')
        .map((line) => line.replace(/[ \t]+/g, ' ').trim())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    : stripped.replace(/\s+/g, ' ').trim()
  if (HTML_RE.test(text)) throw httpError(400, `${label}: bitte nur reinen Text (kein HTML).`, feld)
  if (text.length > max) throw httpError(400, `${label} darf höchstens ${max} Zeichen haben.`, feld)
  return text
}

// Ganze Cent, 0 bis MAX_CENTS. required: fehlend -> Fehler, sonst null.
function cleanCents(value, { feld, label, required = false }) {
  if (value === undefined || value === null || value === '') {
    if (required) throw httpError(400, `${label} fehlt.`, feld)
    return null
  }
  if (!Number.isInteger(value) || value < 0 || value > MAX_CENTS) {
    throw httpError(400, `${label}: bitte einen Betrag in ganzen Cent zwischen 0 und ${MAX_CENTS} senden.`, feld)
  }
  return value
}

// Auch die normalisierte Form (z. B. „www.…“ -> „https://www.…/“) muss in MAX_URL_LENGTH passen - sonst würde der
// gespeicherte Hinweis beim Lesen (readJsonSetting prüft wie beim Speichern) stillschweigend verschwinden.
function cleanUrl(value) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') throw httpError(400, 'Der Link muss Text sein.', 'url')
  const href = sanitizeExternalUrl(value, MAX_URL_LENGTH)
  if (!href) throw httpError(400, 'Der Link: bitte eine vollständige Adresse mit http(s), z. B. https://example.org/spenden.', 'url')
  if (href.length > MAX_URL_LENGTH) throw httpError(400, `Der Link darf höchstens ${MAX_URL_LENGTH} Zeichen haben.`, 'url')
  return href
}

// --- Spenden-Hinweis -------------------------------------------------------------------------------------------------

// { text, url } - beides darf leer sein (dann zeigt die Seite keinen Hinweis).
function validateSpendenHinweis(body) {
  assertKnownFields(body, HINWEIS_FIELDS)
  return {
    text: cleanText(body.text, { feld: 'text', label: 'Der Hinweis', max: LIMITS.hinweisText, multiline: true }),
    url: cleanUrl(body.url)
  }
}

// --- Ziel -------------------------------------------------------------------------------------------------------------

// { titel, betragCents, empfaenger } oder null, wenn alles leer ist. Mit Betrag oder Empfänger braucht es einen Titel.
function validateZiel(body) {
  assertKnownFields(body, ZIEL_FIELDS)
  const titel = cleanText(body.titel, { feld: 'titel', label: 'Der Titel', max: LIMITS.zielTitel })
  const betragCents = cleanCents(body.betragCents, { feld: 'betragCents', label: 'Der Betrag' })
  const empfaenger = cleanText(body.empfaenger, { feld: 'empfaenger', label: 'Der Empfänger', max: LIMITS.empfaenger })
  if (!titel) {
    if (betragCents !== null || empfaenger) throw httpError(400, 'Bitte gib dem Ziel einen Titel.', 'titel')
    return null
  }
  return { titel, betragCents, empfaenger: empfaenger || null }
}

// --- Quartale -----------------------------------------------------------------------------------------------------------

function cleanJahr(value) {
  if (value === undefined || value === null) throw httpError(400, 'Das Jahr fehlt.', 'jahr')
  if (!Number.isInteger(value)) throw httpError(400, 'Das Jahr muss eine ganze Zahl sein.', 'jahr')
  if (value < LIMITS.jahrMin || value > LIMITS.jahrMax) {
    throw httpError(400, `Das Jahr muss zwischen ${LIMITS.jahrMin} und ${LIMITS.jahrMax} liegen.`, 'jahr')
  }
  return value
}

function cleanQuartal(value) {
  if (value === undefined || value === null) throw httpError(400, 'Das Quartal fehlt.', 'quartal')
  if (!Number.isInteger(value) || value < 1 || value > 4) throw httpError(400, 'Das Quartal muss 1 bis 4 sein.', 'quartal')
  return value
}

// Ein Quartal als Spalten (snake_case) für INSERT/UPDATE.
function validateQuartal(body) {
  assertKnownFields(body, QUARTAL_FIELDS)
  const row = { jahr: cleanJahr(body.jahr), quartal: cleanQuartal(body.quartal) }
  for (const [feld, column] of Object.entries(QUARTAL_AMOUNTS)) {
    row[column] = cleanCents(body[feld], { feld, label: 'Der Betrag', required: true })
  }
  row.notiz = cleanText(body.notiz, { feld: 'notiz', label: 'Die Notiz', max: LIMITS.notiz }) || null
  return row
}

// --- Lesen und Speichern ------------------------------------------------------------------------------------------------

const readSettingStmt = db.prepare('SELECT value FROM settings WHERE key = ?')
const upsertSettingStmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
const deleteSettingStmt = db.prepare('DELETE FROM settings WHERE key = ?')

// Ein JSON-Wert aus settings, geprüft wie beim Speichern; kaputt oder fehlend -> fallback (mit Warnung ohne Inhalt).
function readJsonSetting(key, validate, fallback) {
  const row = readSettingStmt.get(key)
  if (!row) return fallback
  try {
    return validate(JSON.parse(row.value))
  } catch {
    console.warn(`[admin] Finanzierung: gespeicherter Wert ${key} ungültig, nehme die Vorgabe`)
    return fallback
  }
}

const EMPTY_HINWEIS = Object.freeze({ text: '', url: null })
// Die Admin-Sicht ohne Ziel (Formularwerte statt null) - auch routes/adminFinanzierung.js antwortet damit.
const EMPTY_ZIEL = Object.freeze({ titel: '', betragCents: null, empfaenger: null })

function readSpendenHinweis() {
  return readJsonSetting(KEY_SPENDEN_HINWEIS, validateSpendenHinweis, { ...EMPTY_HINWEIS })
}

// { hinweis, changed } - changed nur, wenn sich wirklich etwas geändert hat (dann ein Protokoll-Eintrag).
function saveSpendenHinweis(body) {
  const hinweis = validateSpendenHinweis(body)
  const changed = JSON.stringify(hinweis) !== JSON.stringify(readSpendenHinweis())
  if (changed) upsertSettingStmt.run(KEY_SPENDEN_HINWEIS, JSON.stringify(hinweis))
  return { hinweis, changed }
}

// Das Ziel oder null.
function readZiel() {
  return readJsonSetting(KEY_ZIEL, validateZiel, null)
}

function saveZiel(body) {
  const ziel = validateZiel(body)
  const changed = JSON.stringify(ziel) !== JSON.stringify(readZiel())
  if (changed) {
    if (ziel) upsertSettingStmt.run(KEY_ZIEL, JSON.stringify(ziel))
    else deleteSettingStmt.run(KEY_ZIEL)
  }
  return { ziel, changed }
}

const listQuartaleStmt = db.prepare('SELECT * FROM finanzierung_quartale ORDER BY jahr DESC, quartal DESC')
const findQuartalStmt = db.prepare('SELECT * FROM finanzierung_quartale WHERE id = ?')
const insertQuartalStmt = db.prepare(`
  INSERT INTO finanzierung_quartale (jahr, quartal, einnahmen_spenden_cents, einnahmen_partner_cents, kosten_cents, spenden_weitergegeben_cents, notiz)
  VALUES (@jahr, @quartal, @einnahmen_spenden_cents, @einnahmen_partner_cents, @kosten_cents, @spenden_weitergegeben_cents, @notiz)`)
const updateQuartalStmt = db.prepare(`
  UPDATE finanzierung_quartale
  SET jahr = @jahr, quartal = @quartal, einnahmen_spenden_cents = @einnahmen_spenden_cents, einnahmen_partner_cents = @einnahmen_partner_cents,
      kosten_cents = @kosten_cents, spenden_weitergegeben_cents = @spenden_weitergegeben_cents, notiz = @notiz, updated_at = datetime('now')
  WHERE id = @id`)
const deleteQuartalStmt = db.prepare('DELETE FROM finanzierung_quartale WHERE id = ?')

// Öffentliche Form eines Quartals (camelCase, ohne Id und Zeitstempel).
function publicQuartal(row) {
  return {
    jahr: row.jahr,
    quartal: row.quartal,
    einnahmenSpendenCents: row.einnahmen_spenden_cents,
    einnahmenPartnerCents: row.einnahmen_partner_cents,
    kostenCents: row.kosten_cents,
    spendenWeitergegebenCents: row.spenden_weitergegeben_cents,
    notiz: row.notiz
  }
}

// Für den Admin dazu Id und Zeitstempel.
function adminQuartal(row) {
  return { id: row.id, ...publicQuartal(row), updatedAt: row.updated_at }
}

function isUniqueViolation(err) {
  return typeof err.message === 'string' && err.message.includes('UNIQUE')
}

function duplicateError() {
  return httpError(409, 'Dieses Quartal gibt es schon - bitte den bestehenden Eintrag ändern.')
}

function listQuartale() {
  return listQuartaleStmt.all().map(adminQuartal)
}

// Legt ein Quartal an; 409 bei doppeltem Jahr+Quartal.
function createQuartal(body) {
  const row = validateQuartal(body)
  try {
    const id = insertQuartalStmt.run(row).lastInsertRowid
    return adminQuartal(findQuartalStmt.get(id))
  } catch (err) {
    if (isUniqueViolation(err)) throw duplicateError()
    throw err
  }
}

// Ändert ein Quartal; null, wenn es die Id nicht gibt; 409 bei Kollision mit einem anderen Quartal.
function updateQuartal(id, body) {
  if (!findQuartalStmt.get(id)) return null
  const row = validateQuartal(body)
  try {
    updateQuartalStmt.run({ ...row, id })
  } catch (err) {
    if (isUniqueViolation(err)) throw duplicateError()
    throw err
  }
  return adminQuartal(findQuartalStmt.get(id))
}

// true, wenn es etwas zu löschen gab.
function deleteQuartal(id) {
  return deleteQuartalStmt.run(id).changes > 0
}

// Die ganze öffentliche Antwort (GET /api/finanzierung): nur, was der Admin eingetragen hat.
function publicFinanzierung() {
  const hinweis = readSpendenHinweis()
  return {
    spendenHinweis: hinweis.text || hinweis.url ? hinweis : null,
    ziel: readZiel(),
    quartale: listQuartaleStmt.all().map(publicQuartal)
  }
}

// Die Admin-Sicht (GET /api/admin/finanzierung): Formularwerte statt null, Quartale mit Id.
function adminFinanzierung() {
  return {
    spendenHinweis: readSpendenHinweis(),
    ziel: readZiel() || { ...EMPTY_ZIEL },
    quartale: listQuartale()
  }
}

module.exports = {
  LIMITS,
  MAX_CENTS,
  EMPTY_ZIEL,
  KEY_SPENDEN_HINWEIS,
  KEY_ZIEL,
  validateSpendenHinweis,
  validateZiel,
  validateQuartal,
  readSpendenHinweis,
  saveSpendenHinweis,
  readZiel,
  saveZiel,
  listQuartale,
  createQuartal,
  updateQuartal,
  deleteQuartal,
  publicFinanzierung,
  adminFinanzierung
}
