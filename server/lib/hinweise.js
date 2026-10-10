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
const { NO_LINK, validateHinweisLink, linkFields } = require('./hinweisLink')

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
const FIELDS = Object.freeze(['titel', 'text', 'titelEn', 'textEn', 'stufe', 'start', 'ende', 'aktiv', 'linkUrl', 'linkLabel', 'linkLabelEn'])
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
  titelEn: 'Welcome to the preview',
  textEn:
    'This is what notices from the team look like – for example before maintenance or when there is something new.\n' +
    'Use × to hide this notice for this session.',
  stufe: STUFE.info
})

// Optional zweisprachig: titel_en/text_en (leer = der Client zeigt auch auf Englisch die deutsche Fassung). Die Spalten
// kommen hier dazu statt in db.js (dort ist kein Platz mehr) - bestehende Datenbanken bekommen sie beim Start.
const COLUMNS = db.prepare('PRAGMA table_info(hinweise)').all().map((column) => column.name)
if (!COLUMNS.includes('titel_en')) db.exec('ALTER TABLE hinweise ADD COLUMN titel_en TEXT')
if (!COLUMNS.includes('text_en')) db.exec('ALTER TABLE hinweise ADD COLUMN text_en TEXT')

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

// Englischer Titel ist optional - ohne ihn gibt es auch keinen englischen Text.
function validateEnglish(titelEn, textEn) {
  const titel = cleanPlain(titelEn, { feld: 'titelEn', label: 'Der englische Titel', maxLength: MAX_TITEL_LENGTH, allowNewline: false })
  const text = cleanPlain(textEn, { feld: 'textEn', label: 'Der englische Text', maxLength: MAX_TEXT_LENGTH, allowNewline: true })
  if (text && !titel) throw httpError(400, 'Zum englischen Text gehört auch ein englischer Titel.', 'titelEn')
  return { titelEn: titel, textEn: text }
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
  const base = existing || { titel: null, text: null, titel_en: null, text_en: null, stufe: STUFE.info, start: now.toISOString(), ende: null, aktiv: 1 }
  const english = validateEnglish(has('titelEn') ? body.titelEn : base.titel_en, has('textEn') ? body.textEn : base.text_en)
  // Optionaler Link (lib/hinweisLink.js): fehlende Felder bleiben wie gespeichert; eine geleerte Adresse nimmt den Link
  // samt Beschriftungen weg.
  const linkWeg = has('linkUrl') && !body.linkUrl
  const link = validateHinweisLink({
    url: has('linkUrl') ? body.linkUrl : base.link_url,
    label: has('linkLabel') ? body.linkLabel : linkWeg ? null : base.link_label,
    labelEn: has('linkLabelEn') ? body.linkLabelEn : linkWeg ? null : base.link_label_en
  })
  const clean = {
    titel: has('titel') || !existing ? validateTitel(body.titel) : base.titel,
    text: has('text') ? validateText(body.text) : base.text,
    titel_en: english.titelEn,
    text_en: english.textEn,
    stufe: has('stufe') ? validateStufe(body.stufe) : base.stufe,
    start: has('start') ? validateStart(body.start) : base.start,
    ende: has('ende') ? validateEnde(body.ende) : base.ende,
    aktiv: has('aktiv') ? validateAktiv(body.aktiv) : base.aktiv,
    ...link
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
  `INSERT INTO hinweise (titel, text, titel_en, text_en, stufe, start, ende, aktiv, is_demo, link_url, link_label, link_label_en)
   VALUES (@titel, @text, @titel_en, @text_en, @stufe, @start, @ende, @aktiv, @is_demo, @link_url, @link_label, @link_label_en)`
)
const findStmt = db.prepare('SELECT * FROM hinweise WHERE id = ?')
const listStmt = db.prepare('SELECT * FROM hinweise ORDER BY start DESC, id DESC')
const countStmt = db.prepare('SELECT COUNT(*) AS n FROM hinweise')
const updateStmt = db.prepare(
  `UPDATE hinweise SET titel = @titel, text = @text, titel_en = @titel_en, text_en = @text_en, stufe = @stufe, start = @start, ende = @ende, aktiv = @aktiv,
     link_url = @link_url, link_label = @link_label, link_label_en = @link_label_en, updated_at = datetime('now')
   WHERE id = @id`
)
const deleteStmt = db.prepare('DELETE FROM hinweise WHERE id = ?')
const deleteDemoStmt = db.prepare('DELETE FROM hinweise WHERE is_demo = 1')
const publicStmt = db.prepare(
  `SELECT id, titel, text, titel_en AS titelEn, text_en AS textEn, stufe, link_url, link_label, link_label_en FROM hinweise
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

const NO_ENGLISH = Object.freeze({ titel_en: null, text_en: null, ...NO_LINK })

// clean: Ausgabe von validateHinweis. Gibt die neue Zeile zurück.
function createHinweis(clean, { isDemo = false } = {}) {
  const id = insertStmt.run({ ...NO_ENGLISH, ...clean, is_demo: isDemo ? 1 : 0 }).lastInsertRowid
  return findHinweis(id)
}

function updateHinweis(id, clean) {
  updateStmt.run({ ...NO_ENGLISH, ...clean, id })
  return findHinweis(id)
}

function deleteHinweis(id) {
  return deleteStmt.run(id).changes > 0
}

// Öffentliche Auswahl: nur Titel, Text (auch englisch) und Stufe - Zeitraum und Verwaltungsdaten bleiben beim Admin.
function listPublicHinweise({ now = new Date(), includeDemo = false } = {}) {
  return publicStmt
    .all({ jetzt: now.toISOString(), includeDemo: includeDemo ? 1 : 0 })
    .map(({ link_url, link_label, link_label_en, ...rest }) => ({ ...rest, ...linkFields({ link_url, link_label, link_label_en }) }))
}

function adminHinweis(row, now = new Date()) {
  return {
    id: row.id,
    titel: row.titel,
    text: row.text,
    titelEn: row.titel_en || null,
    textEn: row.text_en || null,
    stufe: row.stufe,
    start: row.start,
    ende: row.ende,
    aktiv: Boolean(row.aktiv),
    isDemo: Boolean(row.is_demo),
    status: hinweisStatus(row, now),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...linkFields(row)
  }
}

// --- Beispiel-Hinweis (Vorschau/Testumgebung) ----------------------------------------------------

// Ersetzt die Beispiel-Zeilen (is_demo = 1) durch genau einen harmlosen Hinweis; echte Hinweise bleiben unberührt.
// Läuft nur aus scripts/testenv-seed.js - und verweigert Produktion zusätzlich selbst.
const replaceDemoTx = db.transaction((now) => {
  deleteDemoStmt.run()
  const { titelEn, textEn, ...deutsch } = DEMO_HINWEIS
  return createHinweis({ ...deutsch, titel_en: titelEn, text_en: textEn, start: now.toISOString(), ende: null, aktiv: 1 }, { isDemo: true })
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
