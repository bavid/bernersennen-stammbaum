'use strict'

// Phase N Task 5: globale Hinweise (Tabelle hinweise, db.js) - der Admin setzt ein Band für alle Besucher, z. B. vor
// Wartungsarbeiten oder für Neuigkeiten. Öffentlich (routes/hinweise.js) erscheinen nur eingeschaltete Hinweise in
// ihrem Zeitraum (start <= jetzt <= ende, ende NULL = offen), neueste zuerst, höchstens MAX_OEFFENTLICH. Gepflegt im
// Admin (routes/adminHinweise.js). Zeiten speichern wir als ISO in UTC ('2026-10-05T20:00:00.000Z', immer dieselbe
// Länge - so vergleicht SQLite sie als Text richtig); die Admin-Oberfläche rechnet aus und nach Europe/Berlin.
// Titel und Text sind reiner Text (Steuer- und Bidi-Zeichen raus, kein HTML) - der Client zeigt sie nur als Text.
// is_demo = 1: der Beispiel-Hinweis der Vorschau/Testumgebung (replaceDemoHinweise, scripts/testenv-seed.js) - in
// Produktion nie öffentlich, auch nicht, falls eine solche Zeile dorthin gelangt.

const db = require('../db')
const { stripUnsafeChars } = require('./partners')

const STUFE = Object.freeze({ info: 'info', wartung: 'wartung', wichtig: 'wichtig' })
const STUFE_VALUES = Object.freeze(Object.values(STUFE))
const STATUS = Object.freeze({ geplant: 'geplant', aktiv: 'aktiv', abgelaufen: 'abgelaufen', aus: 'aus' })

const MAX_TITEL_LENGTH = 80
const MAX_TEXT_LENGTH = 1000
const MAX_OEFFENTLICH = 5
// Obergrenze der gespeicherten Hinweise (auch ausgeschaltete) - mehr braucht niemand, die Tabelle bleibt klein.
const MAX_HINWEISE = 100
const MIN_YEAR = 2000
const MAX_YEAR = 2100
const FIELDS = Object.freeze(['titel', 'text', 'stufe', 'start', 'ende', 'aktiv'])
const HTML_RE = /[<>]/
// Ein Zeitpunkt mit Zeitzone ('Z' oder ±HH:MM) - eine Ortszeit ohne Zone wäre mehrdeutig.
const ISO_INSTANT_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/

const NOT_FOUND_MESSAGE = 'Diesen Hinweis gibt es nicht'
const HTML_MESSAGE = 'Titel und Text dürfen nur reinen Text enthalten (kein HTML).'

const DEMO_HINWEIS = Object.freeze({
  titel: 'Willkommen auf der Vorschau',
  text:
    'So sehen Hinweise des Teams aus – etwa vor Wartungsarbeiten oder wenn es etwas Neues gibt.\n' +
    'Mit × blendest du diesen Hinweis für diese Sitzung aus.',
  stufe: STUFE.info
})

// feld: welches Formularfeld der Fehler betrifft - der Admin zeigt ihn direkt dort (routes/adminHinweise.js).
function httpError(status, message, feld) {
  const err = new Error(message)
  err.status = status
  if (feld) err.feld = feld
  return err
}

// --- Prüfung -------------------------------------------------------------------------------------

function cleanPlain(value, { feld, label, maxLength, allowNewline }) {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') throw httpError(400, `${label} muss Text sein.`, feld)
  const text = stripUnsafeChars(value, { allowNewline }).trim()
  if (HTML_RE.test(text)) throw httpError(400, HTML_MESSAGE, feld)
  if (text.length > maxLength) throw httpError(400, `${label} darf höchstens ${maxLength} Zeichen haben.`, feld)
  return text || null
}

function validateTitel(value) {
  const titel = cleanPlain(value, { feld: 'titel', label: 'Der Titel', maxLength: MAX_TITEL_LENGTH, allowNewline: false })
  if (!titel) throw httpError(400, 'Bitte gib einen Titel an.', 'titel')
  return titel
}

function validateText(value) {
  return cleanPlain(value, { feld: 'text', label: 'Der Text', maxLength: MAX_TEXT_LENGTH, allowNewline: true })
}

function validateStufe(value) {
  if (!STUFE_VALUES.includes(value)) throw httpError(400, `Die Stufe muss eine von ${STUFE_VALUES.join(', ')} sein.`, 'stufe')
  return value
}

function validateAktiv(value) {
  if (typeof value !== 'boolean') throw httpError(400, '„aktiv“ muss true oder false sein.', 'aktiv')
  return value ? 1 : 0
}

// ISO-Zeitpunkt mit Zeitzone -> UTC als toISOString(). Kalender-Unsinn (30. Februar) fällt durch den Vergleich der
// Datumsteile mit der Ortszeit aus der Eingabe auf - Date würde ihn sonst still in den März schieben.
function parseInstant(value) {
  if (typeof value !== 'string') return null
  const match = ISO_INSTANT_RE.exec(value.trim())
  if (!match) return null
  const [year, month, day, hour, minute] = match.slice(1, 6).map(Number)
  const date = new Date(value.trim())
  if (Number.isNaN(date.getTime())) return null
  const local = new Date(Date.UTC(year, month - 1, day, hour, minute))
  const sameCalendar =
    local.getUTCFullYear() === year &&
    local.getUTCMonth() === month - 1 &&
    local.getUTCDate() === day &&
    local.getUTCHours() === hour &&
    local.getUTCMinutes() === minute
  if (!sameCalendar) return null
  if (date.getUTCFullYear() < MIN_YEAR || date.getUTCFullYear() > MAX_YEAR) return null
  return date.toISOString()
}

function validateStart(value) {
  const start = parseInstant(value)
  if (!start) throw httpError(400, 'Bitte gib einen gültigen Beginn an (Datum und Uhrzeit).', 'start')
  return start
}

// Leer = offenes Ende.
function validateEnde(value) {
  if (value === null || value === undefined || value === '') return null
  const ende = parseInstant(value)
  if (!ende) throw httpError(400, 'Bitte gib ein gültiges Ende an (Datum und Uhrzeit) oder lass es leer.', 'ende')
  return ende
}

const MAX_FIELD_NAME_ECHO = 40

function assertKnownFields(input) {
  const unknown = Object.keys(input).find((key) => !FIELDS.includes(key))
  if (unknown) throw httpError(400, `Unbekanntes Feld: ${unknown.slice(0, MAX_FIELD_NAME_ECHO)}`)
}

// Eingabe von POST (existing fehlt) bzw. PUT (existing = die gespeicherte Zeile) -> saubere Spalten. Beim Anlegen:
// Titel Pflicht, Stufe info, eingeschaltet, Beginn jetzt, offenes Ende. Beim Ändern bleiben fehlende Felder, wie sie
// sind - das Ende wird dann gegen den (neuen oder bestehenden) Beginn geprüft.
function validateHinweis(body, { now = new Date(), existing = null } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw httpError(400, 'Ungültige Eingabe')
  assertKnownFields(body)
  const has = (key) => body[key] !== undefined
  if (existing && !FIELDS.some(has)) throw httpError(400, 'Nichts zu ändern')
  const base = existing || { titel: null, text: null, stufe: STUFE.info, start: now.toISOString(), ende: null, aktiv: 1 }
  const clean = {
    titel: has('titel') || !existing ? validateTitel(body.titel) : base.titel,
    text: has('text') ? validateText(body.text) : base.text,
    stufe: has('stufe') ? validateStufe(body.stufe) : base.stufe,
    start: has('start') ? validateStart(body.start) : base.start,
    ende: has('ende') ? validateEnde(body.ende) : base.ende,
    aktiv: has('aktiv') ? validateAktiv(body.aktiv) : base.aktiv
  }
  if (clean.ende && clean.ende <= clean.start) throw httpError(400, 'Das Ende muss nach dem Beginn liegen.', 'ende')
  return clean
}

// --- Status --------------------------------------------------------------------------------------

// Für die Liste im Admin: aus (ausgeschaltet), geplant (Beginn noch nicht erreicht), abgelaufen (Ende vorbei), aktiv.
// Grenzen zählen mit (start <= jetzt <= ende), genau wie bei der öffentlichen Auswahl.
function hinweisStatus(row, now = new Date()) {
  const jetzt = now.toISOString()
  if (!row.aktiv) return STATUS.aus
  if (row.start > jetzt) return STATUS.geplant
  if (row.ende && row.ende < jetzt) return STATUS.abgelaufen
  return STATUS.aktiv
}

// --- Abfragen ------------------------------------------------------------------------------------

const insertStmt = db.prepare(
  `INSERT INTO hinweise (titel, text, stufe, start, ende, aktiv, is_demo)
   VALUES (@titel, @text, @stufe, @start, @ende, @aktiv, @is_demo)`
)
const findStmt = db.prepare('SELECT * FROM hinweise WHERE id = ?')
const listStmt = db.prepare('SELECT * FROM hinweise ORDER BY start DESC, id DESC')
const countStmt = db.prepare('SELECT COUNT(*) AS n FROM hinweise')
const updateStmt = db.prepare(
  `UPDATE hinweise SET titel = @titel, text = @text, stufe = @stufe, start = @start, ende = @ende, aktiv = @aktiv,
     updated_at = datetime('now')
   WHERE id = @id`
)
const deleteStmt = db.prepare('DELETE FROM hinweise WHERE id = ?')
const deleteDemoStmt = db.prepare('DELETE FROM hinweise WHERE is_demo = 1')
const publicStmt = db.prepare(
  `SELECT id, titel, text, stufe FROM hinweise
   WHERE aktiv = 1 AND start <= @jetzt AND (ende IS NULL OR ende >= @jetzt) AND (@includeDemo = 1 OR is_demo = 0)
   ORDER BY start DESC, id DESC LIMIT ${MAX_OEFFENTLICH}`
)

function findHinweis(id) {
  return findStmt.get(id) || null
}

function listHinweise() {
  return listStmt.all()
}

function countHinweise() {
  return countStmt.get().n
}

// clean: Ausgabe von validateHinweis. Gibt die neue Zeile zurück.
function createHinweis(clean, { isDemo = false } = {}) {
  const id = insertStmt.run({ ...clean, is_demo: isDemo ? 1 : 0 }).lastInsertRowid
  return findHinweis(id)
}

function updateHinweis(id, clean) {
  updateStmt.run({ ...clean, id })
  return findHinweis(id)
}

function deleteHinweis(id) {
  return deleteStmt.run(id).changes > 0
}

// Öffentliche Auswahl: nur Titel, Text und Stufe - Zeitraum und Verwaltungsdaten bleiben beim Admin.
function listPublicHinweise({ now = new Date(), includeDemo = false } = {}) {
  return publicStmt.all({ jetzt: now.toISOString(), includeDemo: includeDemo ? 1 : 0 })
}

function adminHinweis(row, now = new Date()) {
  return {
    id: row.id,
    titel: row.titel,
    text: row.text,
    stufe: row.stufe,
    start: row.start,
    ende: row.ende,
    aktiv: Boolean(row.aktiv),
    isDemo: Boolean(row.is_demo),
    status: hinweisStatus(row, now),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

// --- Beispiel-Hinweis (Vorschau/Testumgebung) ----------------------------------------------------

// Ersetzt die Beispiel-Zeilen (is_demo = 1) durch genau einen harmlosen Hinweis; echte Hinweise bleiben unberührt.
// Läuft nur aus scripts/testenv-seed.js - und verweigert Produktion zusätzlich selbst.
const replaceDemoTx = db.transaction((now) => {
  deleteDemoStmt.run()
  return createHinweis({ ...DEMO_HINWEIS, start: now.toISOString(), ende: null, aktiv: 1 }, { isDemo: true })
})

function replaceDemoHinweise({ appEnv, now = new Date() }) {
  if (appEnv === 'production') throw new Error('Der Beispiel-Hinweis gehört nur in die Vorschau oder Testumgebung, nie in Produktion.')
  return replaceDemoTx(now)
}

module.exports = {
  STUFE,
  STUFE_VALUES,
  STATUS,
  MAX_TITEL_LENGTH,
  MAX_TEXT_LENGTH,
  MAX_OEFFENTLICH,
  MAX_HINWEISE,
  NOT_FOUND_MESSAGE,
  httpError,
  validateHinweis,
  hinweisStatus,
  findHinweis,
  listHinweise,
  countHinweise,
  createHinweis,
  updateHinweis,
  deleteHinweis,
  listPublicHinweise,
  adminHinweis,
  replaceDemoHinweise
}
