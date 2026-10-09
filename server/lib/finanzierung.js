'use strict'

// Phase F: „So finanzieren wir uns“ - die Zahlen und Hinweise, die der Admin pflegt (routes/adminFinanzierung.js) und die
// öffentliche Seite /finanzierung liest (routes/finanzierung.js). Drei Dinge: der Spenden-Hinweis (Text und/oder Link,
// settings-Schlüssel finanzierung_spenden_hinweis), das aktuelle Ziel („Ziel: 500 € für die Hundewiese“, Schlüssel
// finanzierung_ziel) und die Quartale (eigene Tabelle finanzierung_quartale: Einnahmen Spenden, Einnahmen Partner, Kosten,
// Spenden weitergegeben - alles in ganzen Cent wie donation_reports). Die Tabelle legt dieses Modul selbst an (db.js ist an
// seiner Dateigrenze). Keine Demo-Trennung: die Seite ist für alle gleich und zeigt nur, was der Admin eingetragen hat.
// Reiner Text (Steuer-/Bidi-Zeichen raus, kein HTML), Links nur http(s) - der Client zeigt alles nur als Text bzw. href.

const db = require('../db')
const { sanitizeExternalUrl } = require('./partners')
const { MAX_CENTS, httpError, assertKnownFields, cleanText, cleanCents } = require('./finanzierungFelder')
const { listKosten, publicPosten } = require('./finanzierungKosten')
const { berechneFinanzen, verteileUeberschuss } = require('./finanzierungVerteilung')

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

// „Kosten & Reserve“: was der Admin in diesem Quartal aus der Rücklage „Server-Zukunft“ entnommen hat (lib/
// finanzierungVerteilung.js zieht es vom berechneten Stand ab). Alte Datenbanken bekommen die Spalte hier.
const ENTNAHME_COLUMN = 'reserve_entnahme_cents'
if (!db.prepare('PRAGMA table_info(finanzierung_quartale)').all().some((column) => column.name === ENTNAHME_COLUMN)) {
  db.exec(`ALTER TABLE finanzierung_quartale ADD COLUMN ${ENTNAHME_COLUMN} INTEGER NOT NULL DEFAULT 0`)
}

const KEY_SPENDEN_HINWEIS = 'finanzierung_spenden_hinweis'
const KEY_ZIEL = 'finanzierung_ziel'

const LIMITS = Object.freeze({ hinweisText: 400, zielTitel: 80, empfaenger: 120, notiz: 200, jahrMin: 2024, jahrMax: 2100 })
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
const QUARTAL_FIELDS = Object.freeze(['jahr', 'quartal', ...Object.keys(QUARTAL_AMOUNTS), 'reserveEntnahmeCents', 'notiz'])

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
  // Optional (ältere Formulare kennen das Feld nicht): fehlend = keine Entnahme.
  row[ENTNAHME_COLUMN] = cleanCents(body.reserveEntnahmeCents, { feld: 'reserveEntnahmeCents', label: 'Die Entnahme' }) ?? 0
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
  INSERT INTO finanzierung_quartale (jahr, quartal, einnahmen_spenden_cents, einnahmen_partner_cents, kosten_cents, spenden_weitergegeben_cents, reserve_entnahme_cents, notiz)
  VALUES (@jahr, @quartal, @einnahmen_spenden_cents, @einnahmen_partner_cents, @kosten_cents, @spenden_weitergegeben_cents, @reserve_entnahme_cents, @notiz)`)
const updateQuartalStmt = db.prepare(`
  UPDATE finanzierung_quartale
  SET jahr = @jahr, quartal = @quartal, einnahmen_spenden_cents = @einnahmen_spenden_cents, einnahmen_partner_cents = @einnahmen_partner_cents,
      kosten_cents = @kosten_cents, spenden_weitergegeben_cents = @spenden_weitergegeben_cents, reserve_entnahme_cents = @reserve_entnahme_cents,
      notiz = @notiz, updated_at = datetime('now')
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
    reserveEntnahmeCents: row.reserve_entnahme_cents,
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

// „Kosten & Reserve“: Jahreskosten, Saldo, Rücklage „Server-Zukunft“ und die Verteilung je Quartal
// (lib/finanzierungVerteilung.js) - berechnet, nie gespeichert.
function finanzen(quartale, posten) {
  return berechneFinanzen({ quartale, posten, heute: new Date() })
}

// Die ganze öffentliche Antwort (GET /api/finanzierung): nur, was der Admin eingetragen hat - Posten ohne Id, Notiz und Daten.
function publicFinanzierung() {
  const hinweis = readSpendenHinweis()
  const quartale = listQuartaleStmt.all().map(publicQuartal)
  const posten = listKosten()
  const rechnung = finanzen(quartale, posten)
  return {
    spendenHinweis: hinweis.text || hinweis.url ? hinweis : null,
    ziel: readZiel(),
    quartale,
    kosten: { proJahrCents: rechnung.kostenProJahrCents, posten: posten.map(publicPosten) },
    saldoCents: rechnung.saldoCents,
    ruecklage: rechnung.ruecklage,
    verteilung: rechnung.verteilung
  }
}

// Die Admin-Sicht (GET /api/admin/finanzierung): Formularwerte statt null, Quartale und Posten mit Id, dazu die Prognose
// („Du bist … im Minus“, „bis Jahresende fehlen …“).
function adminFinanzierung() {
  const quartale = listQuartale()
  const posten = listKosten()
  const rechnung = finanzen(quartale, posten)
  return {
    spendenHinweis: readSpendenHinweis(),
    ziel: readZiel() || { ...EMPTY_ZIEL },
    quartale,
    kosten: { proJahrCents: rechnung.kostenProJahrCents, posten },
    prognose: {
      kostenBisherCents: rechnung.kostenBisherCents,
      spendenBisherCents: rechnung.spendenBisherCents,
      saldoCents: rechnung.saldoCents,
      restKostenJahrCents: rechnung.restKostenJahrCents,
      prognoseJahresendeCents: rechnung.prognoseJahresendeCents
    },
    ruecklage: rechnung.ruecklage,
    verteilung: rechnung.verteilung
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
  adminFinanzierung,
  verteileUeberschuss
}
