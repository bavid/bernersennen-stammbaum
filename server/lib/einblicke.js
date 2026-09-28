'use strict'

// Phase P Task 3b: Einblicke - Fotos mit Datum, die ein Partner auf seinem Portal zeigt (Tabelle
// partner_einblicke, db.js). Prüfung der Eingaben und alle Abfragen; die Routen stehen in
// routes/partnerArea/einblicke.js (Partner), routes/admin.js (Ausblenden) und routes/partners.js (Portal).

const db = require('../db')
const { isIsoDate, cleanId } = require('./validate')
const { stripUnsafeChars } = require('./partners')
const { assertNoBreeder } = require('./breederGuard')
const { toPublicMediaUrl } = require('./mediaUrls')

const MAX_EINBLICKE = 60
const MAX_TEXT_LENGTH = 300
const LIMIT_MESSAGE = `Höchstens ${MAX_EINBLICKE} Einblicke – bitte ältere löschen.`
const CONSENT_MESSAGE = 'Bitte bestätigt die Einwilligung der Halterinnen und Halter.'
const EDITABLE_FIELDS = ['datum', 'text']
const ALIAS_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

// --- Prüfung -------------------------------------------------------------------------------------

const pad = (n) => String(n).padStart(2, '0')
const dateString = (year, month, day) => `${year}-${pad(month)}-${pad(day)}`

// "Heute" als der spätere Tag von Server-Ortszeit und UTC - so scheitert ein Einblick von heute nicht
// daran, dass Server und Partner kurz nach Mitternacht in verschiedenen Tagen stehen.
function latestToday(now = new Date()) {
  const local = dateString(now.getFullYear(), now.getMonth() + 1, now.getDate())
  const utc = dateString(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate())
  return local > utc ? local : utc
}

function validateDatum(value) {
  if (!isIsoDate(value)) throw httpError(400, 'Bitte gebt ein gültiges Datum an (JJJJ-MM-TT).')
  if (value > latestToday()) throw httpError(400, 'Das Datum darf nicht in der Zukunft liegen.')
  return value
}

// Optional, reiner Text: Steuer- und Bidi-Zeichen raus (lib/partners.js stripUnsafeChars, Zeilenumbrüche
// bleiben), kein HTML, höchstens MAX_TEXT_LENGTH Zeichen, Züchter-Schutz. undefined/null/'' -> null.
function validateText(value) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') throw httpError(400, 'Der Text muss reiner Text sein.')
  const text = stripUnsafeChars(value, { allowNewline: true }).trim()
  if (!text) return null
  if (text.length > MAX_TEXT_LENGTH) throw httpError(400, `Der Text darf höchstens ${MAX_TEXT_LENGTH} Zeichen haben.`)
  if (/[<>]/.test(text)) throw httpError(400, 'Der Text darf nur reinen Text enthalten (kein HTML).')
  assertNoBreeder({ text })
  return text
}

// Genau true (JSON) bzw. "true" (multipart-Feld) - nichts anderes zählt als Einwilligung.
function assertConsent(value) {
  if (value !== true && value !== 'true') throw httpError(400, CONSENT_MESSAGE)
}

// Neuer Einblick aus dem multipart-Formular (Felder als Strings).
function validateNewEinblick(body = {}) {
  assertConsent(body.einwilligung)
  return { datum: validateDatum(body.datum), text: validateText(body.text) }
}

// Änderung: nur datum und text, jeweils nur wenn mitgeschickt. Andere Felder (ausgeblendet, foto, ...)
// -> 400, statt sie stillschweigend zu übergehen.
function validateEinblickUpdate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw httpError(400, 'Ungültige Angaben')
  const unknown = Object.keys(body).find((key) => !EDITABLE_FIELDS.includes(key))
  if (unknown !== undefined) throw httpError(400, `Dieses Feld lässt sich hier nicht ändern: ${unknown}`)
  const changes = {}
  if (Object.hasOwn(body, 'datum')) changes.datum = validateDatum(body.datum)
  if (Object.hasOwn(body, 'text')) changes.text = validateText(body.text)
  return changes
}

// --- Antwortformen -------------------------------------------------------------------------------

// Für den Partner selbst und den Admin: das Foto über /uploads (nur mit Sitzung, lib/uploadAccess.js
// gibt es dem eigenen Partner-Bereich frei), mit Ausblend-Kennzeichen.
function ownEinblick(row) {
  return {
    id: row.id,
    fotoUrl: row.foto_url,
    datum: row.datum,
    text: row.text,
    ausgeblendet: Boolean(row.ausgeblendet),
    createdAt: row.created_at
  }
}

// Öffentlich (Portal): das Foto über /public-media. preview: true (Kundensicht des Partners selbst,
// routes/partnerArea/preview.js) behält die /uploads-Adresse - ein Entwurf gibt über /public-media nichts frei.
function publicEinblick(row, { preview = false } = {}) {
  return { id: row.id, fotoUrl: preview ? row.foto_url : toPublicMediaUrl(row.foto_url), datum: row.datum, text: row.text }
}

// --- Abfragen ------------------------------------------------------------------------------------

const countAllStmt = db.prepare('SELECT COUNT(*) AS c FROM partner_einblicke WHERE partner_id = ?')
const countVisibleStmt = db.prepare('SELECT COUNT(*) AS c FROM partner_einblicke WHERE partner_id = ? AND ausgeblendet = 0')
const listOwnStmt = db.prepare('SELECT * FROM partner_einblicke WHERE partner_id = ? ORDER BY datum DESC, id DESC')
const listVisibleStmt = db.prepare(
  `SELECT * FROM partner_einblicke WHERE partner_id = ? AND ausgeblendet = 0 ORDER BY datum DESC, id DESC LIMIT ${MAX_EINBLICKE}`
)
const findStmt = db.prepare('SELECT * FROM partner_einblicke WHERE id = ?')
const findOwnStmt = db.prepare('SELECT * FROM partner_einblicke WHERE id = ? AND partner_id = ?')
const insertStmt = db.prepare(
  `INSERT INTO partner_einblicke (partner_id, foto_url, datum, text, einwilligung, is_demo)
   VALUES (@partnerId, @fotoUrl, @datum, @text, 1, @isDemo)`
)
const deleteStmt = db.prepare('DELETE FROM partner_einblicke WHERE id = ?')
const photoInUseStmt = db.prepare('SELECT 1 FROM partner_einblicke WHERE foto_url = ? LIMIT 1')

function countEinblicke(partnerId) {
  return countAllStmt.get(partnerId).c
}

function countVisibleEinblicke(partnerId) {
  return countVisibleStmt.get(partnerId).c
}

function listOwnEinblicke(partnerId) {
  return listOwnStmt.all(partnerId)
}

// Für das Portal: höchstens MAX_EINBLICKE, ohne ausgeblendete, neueste zuerst.
function listVisibleEinblicke(partnerId) {
  return listVisibleStmt.all(partnerId)
}

function findEinblick(id) {
  const cleanedId = cleanId(id)
  return cleanedId ? findStmt.get(cleanedId) : undefined
}

// Nur ein Einblick DIESES Partners - alles andere (fremd, unbekannt, ungültige Id) ist undefined (-> 404).
function findOwnEinblick(partnerId, id) {
  const cleanedId = cleanId(id)
  return cleanedId ? findOwnStmt.get(cleanedId, partnerId) : undefined
}

// Zählt und legt an in EINER Transaktion - zwei gleichzeitige Uploads können die Grenze so nicht
// gemeinsam überschreiten. is_demo folgt dem Partner.
const insertEinblickTx = db.transaction(({ partner, fotoUrl, datum, text }) => {
  if (countEinblicke(partner.id) >= MAX_EINBLICKE) throw httpError(409, LIMIT_MESSAGE)
  const id = insertStmt.run({ partnerId: partner.id, fotoUrl, datum, text, isDemo: partner.is_demo ? 1 : 0 }).lastInsertRowid
  return findStmt.get(id)
})

function insertEinblick(values) {
  return insertEinblickTx(values)
}

function updateEinblick(id, changes) {
  const columns = Object.keys(changes)
  if (columns.length) {
    db.prepare(`UPDATE partner_einblicke SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ?`).run(
      ...columns.map((column) => changes[column]),
      id
    )
  }
  return findStmt.get(id)
}

// Löscht den Einblick; true, wenn sein Foto danach von keinem anderen Einblick mehr genutzt wird (dann
// darf der Aufrufer die Datei entfernen).
function deleteEinblick(einblick) {
  deleteStmt.run(einblick.id)
  return !photoInUseStmt.get(einblick.foto_url)
}

function setAusgeblendet(id, ausgeblendet) {
  db.prepare('UPDATE partner_einblicke SET ausgeblendet = ? WHERE id = ?').run(ausgeblendet ? 1 : 0, id)
  return findStmt.get(id)
}

// Teaser einer Partner-Karte als Unterabfrage für die Partner-Abfrage selbst (EINE Abfrage je Antwort
// statt einer je Karte): foto_url des neuesten sichtbaren Einblicks, nutzt idx_einblicke_partner.
// alias: Tabellen-Alias der partners-Zeile (oder leer für "partners").
function teaserFotoSql(alias) {
  const table = alias || 'partners'
  if (!ALIAS_RE.test(table)) throw new Error(`Ungültiger Alias für teaserFotoSql: ${alias}`)
  return `(SELECT e.foto_url FROM partner_einblicke e WHERE e.partner_id = ${table}.id AND e.ausgeblendet = 0
    ORDER BY e.datum DESC, e.id DESC LIMIT 1) AS teaser_foto_url`
}

// Öffentliche Adresse des Teasers einer Zeile aus einer Abfrage mit teaserFotoSql, sonst null.
function teaserFoto(row) {
  return row.teaser_foto_url ? toPublicMediaUrl(row.teaser_foto_url) : null
}

module.exports = {
  MAX_EINBLICKE,
  MAX_TEXT_LENGTH,
  LIMIT_MESSAGE,
  CONSENT_MESSAGE,
  validateDatum,
  validateText,
  validateNewEinblick,
  validateEinblickUpdate,
  ownEinblick,
  publicEinblick,
  countEinblicke,
  countVisibleEinblicke,
  listOwnEinblicke,
  listVisibleEinblicke,
  findEinblick,
  findOwnEinblick,
  insertEinblick,
  updateEinblick,
  deleteEinblick,
  setAusgeblendet,
  teaserFotoSql,
  teaserFoto
}
