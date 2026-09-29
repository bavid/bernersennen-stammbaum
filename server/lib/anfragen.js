'use strict'

// Phase N Task 1: Anfragen von Besuchern (Tabelle anfragen, db.js) - "Ich möchte einen Gutschein" (typ 'gutschein')
// oder "Wir möchten Partner werden" (typ 'partner'). Prüfung der Eingaben, Abfragen, Aufbewahrung. Die Routen stehen
// in routes/anfragen.js (öffentlich) und routes/adminAnfragen.js (Admin); die Zuweisung eines Gutscheins in
// lib/anfrageGutschein.js.
//
// Datenschutz: Name, E-Mail und Nachricht sind personenbezogene Daten. Aufbewahrt werden erledigte und abgelehnte
// Anfragen bis RETENTION_DAYS_CLOSED Tage nach dem Abschluss, offene bis RETENTION_DAYS_OPEN Tage nach der letzten
// Bearbeitung (aktualisiert_at, sonst dem Eingang) - purgeExpiredAnfragen läuft beim Start und alle 24 Stunden
// (index.js), nicht bei jedem Eingang. Speicher begrenzt: ab MAX_OPEN_ANFRAGEN offenen Anfragen werden neue still
// verworfen (gleiche Antwort, eine Logzeile je Stunde mit der Anzahl). Inhalte und E-Mail-Adressen landen nie im Log.

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
const PAGE_SIZE = 100
const MAX_SEITE = 100000
const MAX_OPEN_ANFRAGEN = 1000
const DROP_LOG_INTERVAL_MS = 60 * 60 * 1000
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

// ?seite= der Admin-Liste: fehlt sie, Seite 1; sonst eine ganze Zahl von 1 bis MAX_SEITE.
function validateSeite(value) {
  if (value === undefined || value === '') return 1
  const seite = typeof value === 'string' && /^\d{1,6}$/.test(value) ? Number(value) : NaN
  if (!Number.isInteger(seite) || seite < 1 || seite > MAX_SEITE) throw httpError(400, 'Die Seite muss eine positive ganze Zahl sein.')
  return seite
}

// --- Abfragen ------------------------------------------------------------------------------------

const PURGE_SQL = `DELETE FROM anfragen WHERE
   (status = '${STATUS.offen}' AND COALESCE(aktualisiert_at, created_at) < datetime('now', '-${RETENTION_DAYS_OPEN} days'))
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
const countOpenStmt = db.prepare(`SELECT COUNT(*) AS n FROM anfragen WHERE status = '${STATUS.offen}'`)
const insertStmt = db.prepare(
  `INSERT INTO anfragen (typ, name, email, nachricht, firma, partner_typ, plz)
   VALUES (@typ, @name, @email, @nachricht, @firma, @partner_typ, @plz)`
)
const countListStmt = db.prepare('SELECT COUNT(*) AS n FROM anfragen WHERE (@status IS NULL OR status = @status)')
const listStmt = db.prepare(
  `${SELECT_SQL} WHERE (@status IS NULL OR a.status = @status)
   ORDER BY a.status = '${STATUS.offen}' DESC, a.created_at DESC, a.id DESC LIMIT ${PAGE_SIZE} OFFSET @offset`
)
const findStmt = db.prepare(`${SELECT_SQL} WHERE a.id = ?`)
// Im SET beziehen sich status/erledigt_at auf die bisherigen Werte. Abschluss-Zeitpunkt: neu beim Wechsel nach
// erledigt/abgelehnt, bleibt bei einem erneuten Setzen desselben Status, fällt weg beim Zurück auf offen.
// aktualisiert_at: jede Bearbeitung (Status oder Notiz) - davon hängt die Aufbewahrung offener Anfragen ab.
const updateStmt = db.prepare(
  `UPDATE anfragen SET
     aktualisiert_at = datetime('now'),
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

// Prüfen und Einfügen in EINER Transaktion: 'duplikat' (dieselbe offene Anfrage, E-Mail + Typ, aus den letzten 24
// Stunden), 'voll' (schon MAX_OPEN_ANFRAGEN offene) oder die neue id.
const insertIfRoom = db.transaction((clean) => {
  if (findDuplicateStmt.get(clean.email, clean.typ)) return { outcome: 'duplikat' }
  if (countOpenStmt.get().n >= MAX_OPEN_ANFRAGEN) return { outcome: 'voll' }
  return { outcome: 'neu', id: Number(insertStmt.run(clean).lastInsertRowid) }
})

// Verworfene Anfragen (Grenze erreicht): höchstens eine Logzeile je DROP_LOG_INTERVAL_MS, mit der Anzahl seit der
// letzten Zeile - nie Inhalte oder Adressen.
let dropLog = Object.freeze({ lastLoggedAt: null, pending: 0 })

function noteDropped(now, logger) {
  const pending = dropLog.pending + 1
  if (dropLog.lastLoggedAt !== null && now - dropLog.lastLoggedAt < DROP_LOG_INTERVAL_MS) {
    dropLog = Object.freeze({ ...dropLog, pending })
    return
  }
  logger.warn(`Neue Anfragen verworfen (schon ${MAX_OPEN_ANFRAGEN} offene) – seit der letzten Meldung: ${pending}`)
  dropLog = Object.freeze({ lastLoggedAt: now, pending: 0 })
}

// Speichert eine geprüfte Anfrage. Ein Duplikat oder eine volle Liste legen nichts an (kein Spam im Admin, begrenzter
// Speicher) - die Route antwortet trotzdem gleich. Ergebnis: { created: true, id } oder { created: false }.
// logger/now nur für Tests.
function insertAnfrage(clean, { logger = console, now = Date.now() } = {}) {
  const result = insertIfRoom(clean)
  if (result.outcome === 'neu') return { created: true, id: result.id }
  if (result.outcome === 'voll') noteDropped(now, logger)
  return { created: false }
}

// Eine Seite der Admin-Liste (PAGE_SIZE je Seite): { rows, gesamt, seiten }.
function listAnfragen({ status = null, seite = 1 } = {}) {
  const gesamt = countListStmt.get({ status }).n
  const rows = listStmt.all({ status, offset: (seite - 1) * PAGE_SIZE })
  return { rows, gesamt, seiten: Math.max(1, Math.ceil(gesamt / PAGE_SIZE)) }
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
    erledigtAt: row.erledigt_at,
    aktualisiertAt: row.aktualisiert_at
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
  PAGE_SIZE,
  MAX_OPEN_ANFRAGEN,
  EMAIL_UNKNOWN_MESSAGE,
  NOT_FOUND_MESSAGE,
  httpError,
  validateAnfrage,
  validateAnfrageUpdate,
  validateStatusFilter,
  validateSeite,
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
