'use strict'

// Geschäftsanfrage (/partner-werden): die ausführliche Partner-Anfrage mit Terminvorschlägen. Die Grunddaten (Firma,
// Ansprechperson, E-Mail, PLZ, Nachricht) stehen wie bisher in anfragen (typ 'partner', lib/anfragen.js); was nur die
// Geschäftsanfrage hat, steht hier in geschaeft_anfragen - eine Zeile je Anfrage, verknüpft über anfrage_id. Ältere
// Partner-Anfragen haben keine Zeile und bleiben unverändert lesbar. Die Tabelle legt dieses Modul selbst an (db.js
// ist an seiner Dateigrenze, Muster lib/visitenkarte.js). ON DELETE CASCADE: Löschen und Aufräumen der Anfrage
// (lib/anfragen.js PURGE_SQL) nehmen die Zeile mit. Inhalte landen nie im Log.
// Der Admin bestätigt einen Vorschlag (bestaetigt_index, optional mit kurzer Notiz) - eine E-Mail an die
// Anfragenden verschickt die App nicht; den Text zum Kopieren baut der Client (lib/geschaeftAnfrage.js).

const db = require('../db')
const { stripUnsafeChars, TYP_VALUES: PARTNER_TYP_VALUES } = require('./partners')
const { validateTermine, formatTermin, MAX_TERMINE } = require('./terminvorschlaege')

db.exec(`
  CREATE TABLE IF NOT EXISTS geschaeft_anfragen (
    anfrage_id INTEGER PRIMARY KEY REFERENCES anfragen(id) ON DELETE CASCADE,
    art TEXT NOT NULL,
    telefon TEXT,
    ort TEXT NOT NULL,
    webseite TEXT,
    bundesweit INTEGER NOT NULL DEFAULT 0,
    termine TEXT NOT NULL,
    bestaetigt_index INTEGER,
    bestaetigt_notiz TEXT,
    bestaetigt_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`)

const ART_VALUES = Object.freeze(['tierheim', 'hundeschule', 'hundesalon', 'betreuung', 'tierarzt', 'sonstige'])
const FALLBACK_PARTNER_TYP = 'sonstige'
const MAX_ORT_LENGTH = 80
const MAX_TELEFON_LENGTH = 30
const MAX_WEBSEITE_LENGTH = 200
const MAX_BESTAETIGUNG_NOTIZ_LENGTH = 300
const TELEFON_RE = /^\+?[\d\s/()-]{5,30}$/
const HTML_RE = /[<>]/

const ART_MESSAGE = 'Bitte wählt aus der Liste, was für ein Angebot ihr habt.'
const ORT_MESSAGE = 'Bitte gebt euren Ort an.'
const TELEFON_MESSAGE = 'Die Telefonnummer ist ungültig.'
const WEBSEITE_MESSAGE = 'Die Webseite muss mit https:// beginnen.'
const EINWILLIGUNG_MESSAGE = 'Bitte bestätigt, dass wir euch für diese Anfrage kontaktieren dürfen.'
const INDEX_MESSAGE = 'Bitte einen der vorgeschlagenen Termine wählen.'
const NOTIZ_MESSAGE = `Die Notiz darf höchstens ${MAX_BESTAETIGUNG_NOTIZ_LENGTH} Zeichen haben.`

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

function cleanText(value, maxLength, message) {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') throw httpError(400, message)
  const text = stripUnsafeChars(value).trim()
  if (HTML_RE.test(text) || text.length > maxLength) throw httpError(400, message)
  return text || null
}

function validateWebseite(value) {
  const text = cleanText(value, MAX_WEBSEITE_LENGTH, WEBSEITE_MESSAGE)
  if (!text) return null
  let url
  try {
    url = new URL(text)
  } catch {
    throw httpError(400, WEBSEITE_MESSAGE)
  }
  if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.')) throw httpError(400, WEBSEITE_MESSAGE)
  return url.href
}

function validateTelefon(value) {
  const text = cleanText(value, MAX_TELEFON_LENGTH, TELEFON_MESSAGE)
  if (text && !TELEFON_RE.test(text)) throw httpError(400, TELEFON_MESSAGE)
  return text
}

// body.geschaeft -> saubere Felder. partnerTyp: die Art für anfragen.partner_typ (Tierarzt gibt es dort nicht ->
// 'sonstige', die genaue Art steht hier). now nur für Tests.
function validateGeschaeft(value, { now } = {}) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  if (!ART_VALUES.includes(input.art)) throw httpError(400, ART_MESSAGE)
  const ort = cleanText(input.ort, MAX_ORT_LENGTH, ORT_MESSAGE)
  if (!ort) throw httpError(400, ORT_MESSAGE)
  const telefon = validateTelefon(input.telefon)
  const webseite = validateWebseite(input.webseite)
  if (input.einwilligung !== true) throw httpError(400, EINWILLIGUNG_MESSAGE)
  const termine = validateTermine(input.termine, { now })
  const partnerTyp = PARTNER_TYP_VALUES.includes(input.art) ? input.art : FALLBACK_PARTNER_TYP
  return Object.freeze({ art: input.art, partnerTyp, ort, telefon, webseite, bundesweit: input.bundesweit === true, termine })
}

// PUT /api/admin/anfragen/:id/termin { index: 0..2 | null, notiz? } - null nimmt die Bestätigung zurück.
function validateBestaetigung(body) {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {}
  const index = input.index
  if (index !== null && !(Number.isInteger(index) && index >= 0 && index < MAX_TERMINE)) throw httpError(400, INDEX_MESSAGE)
  if (input.notiz !== undefined && input.notiz !== null && typeof input.notiz !== 'string') throw httpError(400, NOTIZ_MESSAGE)
  const notiz = typeof input.notiz === 'string' ? stripUnsafeChars(input.notiz, { allowNewline: true }).trim() : ''
  if (notiz.length > MAX_BESTAETIGUNG_NOTIZ_LENGTH) throw httpError(400, NOTIZ_MESSAGE)
  return { index, notiz: index === null ? null : notiz || null }
}

const insertStmt = db.prepare(
  `INSERT INTO geschaeft_anfragen (anfrage_id, art, telefon, ort, webseite, bundesweit, termine)
   VALUES (@anfrageId, @art, @telefon, @ort, @webseite, @bundesweit, @termine)`
)
const findStmt = db.prepare('SELECT * FROM geschaeft_anfragen WHERE anfrage_id = ?')
const confirmStmt = db.prepare(
  `UPDATE geschaeft_anfragen SET bestaetigt_index = @index, bestaetigt_notiz = @notiz,
     bestaetigt_at = CASE WHEN @index IS NULL THEN NULL ELSE datetime('now') END
   WHERE anfrage_id = @anfrageId`
)

// Nur innerhalb der Einfüge-Transaktion von lib/anfragen.js aufrufen.
function insertGeschaeft(anfrageId, geschaeft) {
  insertStmt.run({
    anfrageId,
    art: geschaeft.art,
    telefon: geschaeft.telefon,
    ort: geschaeft.ort,
    webseite: geschaeft.webseite,
    bundesweit: geschaeft.bundesweit ? 1 : 0,
    termine: JSON.stringify(geschaeft.termine)
  })
}

function parseTermine(text) {
  try {
    const termine = JSON.parse(text)
    return Array.isArray(termine) ? termine : []
  } catch {
    return []
  }
}

// Für den Admin (camelCase), null für Anfragen ohne Geschäftsangaben.
function geschaeftView(anfrageId) {
  const row = findStmt.get(anfrageId)
  if (!row) return null
  return {
    art: row.art,
    telefon: row.telefon,
    ort: row.ort,
    webseite: row.webseite,
    bundesweit: row.bundesweit === 1,
    termine: parseTermine(row.termine),
    bestaetigt: row.bestaetigt_index === null ? null : { index: row.bestaetigt_index, notiz: row.bestaetigt_notiz, at: row.bestaetigt_at }
  }
}

// Bestätigt einen Vorschlag. undefined, wenn die Anfrage keine Geschäftsangaben hat; 400, wenn es den Vorschlag nicht gibt.
function confirmTermin(anfrageId, { index, notiz }) {
  const view = geschaeftView(anfrageId)
  if (!view) return undefined
  if (index !== null && index >= view.termine.length) throw httpError(400, INDEX_MESSAGE)
  confirmStmt.run({ anfrageId, index, notiz })
  return geschaeftView(anfrageId)
}

// Für die Admin-Benachrichtigung (lib/notify.js, nur mit "Details mitsenden"): die Vorschläge als eine Zeile.
function termineText(termine) {
  return termine.map((termin, i) => `${i + 1}) ${formatTermin(termin)}`).join('; ')
}

module.exports = {
  ART_VALUES,
  MAX_BESTAETIGUNG_NOTIZ_LENGTH,
  EINWILLIGUNG_MESSAGE,
  validateGeschaeft,
  validateBestaetigung,
  insertGeschaeft,
  geschaeftView,
  confirmTermin,
  termineText
}
