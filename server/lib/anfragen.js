'use strict'

// Phase N Task 1: Anfragen von Besuchern (Tabelle anfragen, db.js) - "Ich möchte einen Gutschein" (typ 'gutschein')
// oder "Wir möchten Partner werden" (typ 'partner'). Prüfung der Eingaben, Abfragen, Aufbewahrung. Die Routen stehen
// in routes/anfragen.js (öffentlich) und routes/adminAnfragen.js (Admin); die Zuweisung eines Gutscheins in
// lib/anfrageGutschein.js.
//
// Datenschutz: Name, E-Mail und Nachricht sind personenbezogene Daten. Aufbewahrt werden erledigte und abgelehnte
// Anfragen bis RETENTION_DAYS_CLOSED Tage nach dem Abschluss, offene bis RETENTION_DAYS_OPEN Tage nach dem Eingang
// (purgeExpiredAnfragen - jeder Eingang räumt vorher auf, index.js zusätzlich beim Start und alle 24 Stunden).
// Inhalte und E-Mail-Adressen landen nie im Log (geloggt wird nur die Anzahl).

const db = require('../db')
const { cleanId } = require('./validate')
const { lookupPlz } = require('./geo')
const { assertNoBreeder } = require('./breederGuard')
const { stripUnsafeChars, validateEmail, TYP_VALUES: PARTNER_TYP_VALUES } = require('./partners')
const { voucherStatus } = require('./vouchers')

const TYP = Object.freeze({ gutschein: 'gutschein', partner: 'partner' })
const TYP_VALUES = Object.values(TYP)
const STATUS = Object.freeze({ offen: 'offen', erledigt: 'erledigt', abgelehnt: 'abgelehnt' })
const STATUS_VALUES = Object.values(STATUS)

const MAX_NAME_LENGTH = 80
const MAX_FIRMA_LENGTH = 120
const MAX_NACHRICHT_LENGTH = 1000
const MAX_NOTIZ_LENGTH = 1000
const MAX_LIST = 500
const DUPLICATE_WINDOW_HOURS = 24
const RETENTION_DAYS_CLOSED = 180
const RETENTION_DAYS_OPEN = 365
const PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000
const HTML_RE = /[<>]/
// Zusätzlich zum Format aus lib/partners.js: nichts, was in einem mailto:-Link mehrere Empfänger, Kodierungen oder
// Markup ergäbe.
const EMAIL_UNSAFE_RE = /[<>",;%`\\]/

const EMAIL_MISSING_MESSAGE = 'Bitte gebt eure E-Mail-Adresse an – nur so können wir euch antworten.'
const EMAIL_UNKNOWN_MESSAGE = 'Diese E-Mail-Adresse scheint es nicht zu geben.'
const NOT_FOUND_MESSAGE = 'Diese Anfrage gibt es nicht'

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

// --- Prüfung -------------------------------------------------------------------------------------

// Reiner Text wie im Kontaktformular (lib/partnerMessages.js): Steuer- und Bidi-Zeichen raus (Zeilenumbrüche nur
// wo erlaubt), getrimmt, kein HTML, höchstens maxLength Zeichen. Leer -> null.
function cleanPlainText(value, { maxLength, label, allowNewline = false }) {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') throw httpError(400, 'Bitte nur Text eingeben.')
  const text = stripUnsafeChars(value, { allowNewline }).trim()
  if (HTML_RE.test(text)) throw httpError(400, 'Bitte nur reinen Text eingeben (kein HTML).')
  if (text.length > maxLength) throw httpError(400, `${label} darf höchstens ${maxLength} Zeichen haben.`)
  return text || null
}

function validateTyp(value) {
  if (!TYP_VALUES.includes(value)) throw httpError(400, 'Bitte wählt, ob ihr einen Gutschein oder einen Partner-Zugang anfragt.')
  return value
}

// Pflicht, Format wie die Kontaktdaten der Partner (lib/partners.js validateEmail: höchstens 120 Zeichen, kein ?/&).
// Ob es die Domain gibt, prüft danach lib/emailCheck.js (asynchron, in der Route).
function validateRequiredEmail(value) {
  const text = typeof value === 'string' ? stripUnsafeChars(value).trim() : value
  if (text === undefined || text === null || text === '') throw httpError(400, EMAIL_MISSING_MESSAGE)
  if (typeof text !== 'string' || EMAIL_UNSAFE_RE.test(text)) throw httpError(400, 'Die E-Mail-Adresse ist ungültig')
  return validateEmail(text)
}

function validatePartnerTyp(value) {
  if (!PARTNER_TYP_VALUES.includes(value)) throw httpError(400, 'Bitte wählt aus der Liste, was für ein Angebot ihr habt.')
  return value
}

// Optional; wenn angegeben, eine bekannte deutsche PLZ (lib/geo.js).
function validatePlz(value) {
  if (value === undefined || value === null || value === '') return null
  const plz = typeof value === 'string' ? value.trim() : ''
  if (!lookupPlz(plz)) throw httpError(400, 'Diese Postleitzahl kennen wir nicht')
  return plz
}

// Nur für typ 'partner': Firma Pflicht, Art des Angebots aus lib/partners.js TYP_VALUES, PLZ optional.
function validatePartnerFields(input) {
  const firma = cleanPlainText(input.firma, { maxLength: MAX_FIRMA_LENGTH, label: 'Der Name' })
  if (!firma) throw httpError(400, 'Bitte gebt den Namen eurer Hundeschule, eures Tierheims oder Geschäfts an.')
  return { firma, partner_typ: validatePartnerTyp(input.partnerTyp), plz: validatePlz(input.plz) }
}

// Eingabe von POST /api/public/anfragen -> saubere Spalten. Eine Gutschein-Anfrage übernimmt keine Partner-Felder.
// Partner sind nie Züchter (lib/breederGuard.js) - geprüft auf Name, Firma und Nachricht.
function validateAnfrage(body) {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {}
  const typ = validateTyp(input.typ)
  const name = cleanPlainText(input.name, { maxLength: MAX_NAME_LENGTH, label: 'Der Name' })
  const email = validateRequiredEmail(input.email)
  const nachricht = cleanPlainText(input.nachricht, { maxLength: MAX_NACHRICHT_LENGTH, label: 'Die Nachricht', allowNewline: true })
  const partnerFields = typ === TYP.partner ? validatePartnerFields(input) : { firma: null, partner_typ: null, plz: null }
  if (typ === TYP.partner) assertNoBreeder({ name, firma: partnerFields.firma, nachricht })
  return { typ, name, email, nachricht, ...partnerFields }
}

// PUT /api/admin/anfragen/:id { status?, notiz? } - mindestens eins davon. notiz null/'' löscht die Notiz.
function validateAnfrageUpdate(body) {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {}
  const hasStatus = input.status !== undefined
  const hasNotiz = input.notiz !== undefined
  if (!hasStatus && !hasNotiz) throw httpError(400, 'Bitte Status oder Notiz angeben.')
  if (hasStatus && !STATUS_VALUES.includes(input.status)) throw httpError(400, `Status muss einer von ${STATUS_VALUES.join(', ')} sein`)
  if (hasNotiz && input.notiz !== null && typeof input.notiz !== 'string') throw httpError(400, 'Die Notiz muss Text sein.')
  const notiz = hasNotiz && input.notiz !== null ? stripUnsafeChars(input.notiz, { allowNewline: true }).trim() : ''
  if (notiz.length > MAX_NOTIZ_LENGTH) throw httpError(400, `Die Notiz darf höchstens ${MAX_NOTIZ_LENGTH} Zeichen haben.`)
  return { status: hasStatus ? input.status : null, setNotiz: hasNotiz ? 1 : 0, notiz: notiz || null }
}

function validateStatusFilter(value) {
  if (value === undefined || value === '') return null
  if (!STATUS_VALUES.includes(value)) throw httpError(400, `Status muss einer von ${STATUS_VALUES.join(', ')} sein`)
  return value
}

// --- Abfragen ------------------------------------------------------------------------------------

const PURGE_SQL = `DELETE FROM anfragen WHERE
   (status = '${STATUS.offen}' AND created_at < datetime('now', '-${RETENTION_DAYS_OPEN} days'))
   OR (status <> '${STATUS.offen}' AND COALESCE(erledigt_at, created_at) < datetime('now', '-${RETENTION_DAYS_CLOSED} days'))`

// Anfrage samt zugewiesenem Gutschein (nur Hinweis und Status, nie der Code).
const SELECT_SQL = `SELECT a.*, v.id AS v_id, v.code_hint AS v_hint, v.redeemed_at AS v_redeemed_at, v.revoked_at AS v_revoked_at,
     v.expires_at AS v_expires_at
   FROM anfragen a LEFT JOIN vouchers v ON v.id = a.voucher_id`

const purgeStmt = db.prepare(PURGE_SQL)
// email ist COLLATE NOCASE (db.js) - der Vergleich ignoriert damit Groß/klein.
const findDuplicateStmt = db.prepare(
  `SELECT 1 FROM anfragen WHERE email = ? AND typ = ? AND status = '${STATUS.offen}'
     AND created_at > datetime('now', '-${DUPLICATE_WINDOW_HOURS} hours')`
)
const insertStmt = db.prepare(
  `INSERT INTO anfragen (typ, name, email, nachricht, firma, partner_typ, plz)
   VALUES (@typ, @name, @email, @nachricht, @firma, @partner_typ, @plz)`
)
const listStmt = db.prepare(
  `${SELECT_SQL} WHERE (@status IS NULL OR a.status = @status)
   ORDER BY a.status = '${STATUS.offen}' DESC, a.created_at DESC, a.id DESC LIMIT ${MAX_LIST}`
)
const findStmt = db.prepare(`${SELECT_SQL} WHERE a.id = ?`)
// Im SET beziehen sich status/erledigt_at auf die bisherigen Werte. Abschluss-Zeitpunkt: neu beim Wechsel nach
// erledigt/abgelehnt, bleibt bei einem erneuten Setzen desselben Status, fällt weg beim Zurück auf offen.
const updateStmt = db.prepare(
  `UPDATE anfragen SET
     status = COALESCE(@status, status),
     notiz = CASE WHEN @setNotiz = 1 THEN @notiz ELSE notiz END,
     erledigt_at = CASE
       WHEN @status IS NULL THEN erledigt_at
       WHEN @status = '${STATUS.offen}' THEN NULL
       WHEN @status = status AND erledigt_at IS NOT NULL THEN erledigt_at
       ELSE datetime('now') END
   WHERE id = @id`
)
const deleteStmt = db.prepare('DELETE FROM anfragen WHERE id = ?')

// Alle abgelaufenen Anfragen (Fristen siehe Dateikopf). Gibt die Anzahl der gelöschten zurück.
function purgeExpiredAnfragen() {
  return purgeStmt.run().changes
}

// Ein Lauf, der den Server nie mitreißt - geloggt wird nur die Anzahl bzw. die Fehlermeldung der Datenbank.
function runAnfragenPurge(logger = console) {
  try {
    const count = purgeExpiredAnfragen()
    if (count > 0) logger.log(`Abgelaufene Anfragen gelöscht: ${count}`)
    return count
  } catch (err) {
    logger.error(`Aufräumen der Anfragen fehlgeschlagen: ${err.message}`)
    return 0
  }
}

// Einmal sofort, danach alle 24 Stunden (unref: hält den Prozess nicht am Leben). Nur aus index.js aufrufen.
function scheduleAnfragenPurge(logger = console) {
  runAnfragenPurge(logger)
  return setInterval(() => runAnfragenPurge(logger), PURGE_INTERVAL_MS).unref()
}

// Speichert eine geprüfte Anfrage - außer es gibt schon dieselbe offene (E-Mail + Typ) aus den letzten 24 Stunden:
// dann bleibt alles, wie es ist (kein Spam im Admin), die Route antwortet trotzdem gleich. Aufräumen, Prüfen und
// Einfügen in EINER Transaktion. Ergebnis: { created: true, id } oder { created: false }.
const insertAnfrage = db.transaction((clean) => {
  purgeExpiredAnfragen()
  if (findDuplicateStmt.get(clean.email, clean.typ)) return { created: false }
  return { created: true, id: Number(insertStmt.run(clean).lastInsertRowid) }
})

function listAnfragen(status) {
  return listStmt.all({ status })
}

function findAnfrage(id) {
  const anfrageId = cleanId(id)
  return anfrageId ? findStmt.get(anfrageId) : undefined
}

// Gibt die geänderte Zeile zurück, undefined wenn es die Anfrage nicht gibt.
function updateAnfrage(id, change) {
  const anfrageId = cleanId(id)
  if (!anfrageId || !updateStmt.run({ ...change, id: anfrageId }).changes) return undefined
  return findStmt.get(anfrageId)
}

function deleteAnfrage(id) {
  const anfrageId = cleanId(id)
  return Boolean(anfrageId) && deleteStmt.run(anfrageId).changes > 0
}

// --- Antworten -----------------------------------------------------------------------------------

function assignedVoucher(row) {
  if (!row.v_id) return null
  const status = voucherStatus({ redeemed_at: row.v_redeemed_at, revoked_at: row.v_revoked_at, expires_at: row.v_expires_at })
  return { id: row.v_id, hint: row.v_hint, status }
}

// Eine Anfrage für den Admin, camelCase. ort aus der PLZ (lib/geo.js), gutschein: der zugewiesene Gutschein mit
// Hinweis (letzte 4 Zeichen) und Status - nie der Code selbst.
function adminAnfrage(row) {
  return {
    id: row.id,
    typ: row.typ,
    name: row.name,
    email: row.email,
    nachricht: row.nachricht,
    firma: row.firma,
    partnerTyp: row.partner_typ,
    plz: row.plz,
    ort: row.plz ? (lookupPlz(row.plz)?.ort ?? null) : null,
    status: row.status,
    notiz: row.notiz,
    gutschein: assignedVoucher(row),
    createdAt: row.created_at,
    erledigtAt: row.erledigt_at
  }
}

module.exports = {
  TYP,
  TYP_VALUES,
  STATUS,
  STATUS_VALUES,
  MAX_NAME_LENGTH,
  MAX_FIRMA_LENGTH,
  MAX_NACHRICHT_LENGTH,
  MAX_NOTIZ_LENGTH,
  RETENTION_DAYS_CLOSED,
  RETENTION_DAYS_OPEN,
  EMAIL_UNKNOWN_MESSAGE,
  NOT_FOUND_MESSAGE,
  httpError,
  validateAnfrage,
  validateAnfrageUpdate,
  validateStatusFilter,
  purgeExpiredAnfragen,
  runAnfragenPurge,
  scheduleAnfragenPurge,
  insertAnfrage,
  listAnfragen,
  findAnfrage,
  updateAnfrage,
  deleteAnfrage,
  adminAnfrage
}
