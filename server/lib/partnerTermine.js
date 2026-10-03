'use strict'

// Phase V4a: Kalender der Partner (Tabellen partner_termine und partner_termin_absagen, db.js). Ein Termin ist ein
// einzelner Tag oder eine Serie (lib/terminSerien.js) mit Titel, Text, Ort und Uhrzeit; einzelne Tage einer Serie
// lassen sich absagen ("fällt aus"). Termine gehen OHNE Freigabe online - darum nur reiner Text (kein HTML, keine
// Links), feste Längen und höchstens MAX_TERMINE je Partner; ausblenden oder löschen kann sie der Admin
// (routes/adminTermine.js). Prüfung und Abfragen hier, die Routen in routes/partnerArea/termine.js (Partner),
// lib/partnerPortal.js (Portal und Kundensicht) und routes/discover.js ("Nächster Termin" auf der Karte).

const db = require('../db')
const { isIsoDate, cleanId } = require('./validate')
const { stripUnsafeChars } = require('./partners')
const { assertNoBreeder } = require('./breederGuard')
const { SERIE, SERIE_VALUES, addYears, maxSerieBis, expandTermin, hasDateFrom, isOccurrence, isUpcoming, berlinNow } = require('./terminSerien')

const MAX_TERMINE = 50
const MAX_TITEL_LENGTH = 80
const MAX_TEXT_LENGTH = 500
const MAX_ORT_LENGTH = 120
// Höchstens ein Jahr im Voraus - so liegt jeder erste Termin in der Übersicht (die reicht genauso weit).
const MAX_VORLAUF_JAHRE = 1
// Übersicht im Partner-Bereich und Portal: die nächsten zwölf Monate - von heute bis einschließlich desselben Tags im
// Folgejahr (wie maxSerieBis in lib/terminSerien.js). Begrenzt durch MAX_TERMINE und dieses Fenster (höchstens 53
// Einzeltermine je Termin) - bewusst ohne Obergrenze der Anzahl, die sonst spätere einzelne Termine abschnitte.
const ZEITRAUM_JAHRE = 1

const LIMIT_MESSAGE = `Höchstens ${MAX_TERMINE} Termine – bitte ältere löschen.`
const NOT_FOUND_MESSAGE = 'Diesen Termin gibt es nicht'
const PLAIN_TEXT_MESSAGE = 'Termine dürfen nur reinen Text enthalten (kein HTML, keine Links).'
const DATE_MESSAGE = 'Bitte ein gültiges Datum angeben (JJJJ-MM-TT).'
const PAST_MESSAGE = 'Der Termin liegt in der Vergangenheit.'
const VORLAUF_MESSAGE = 'Termine höchstens ein Jahr im Voraus.'
const TIME_MESSAGE = 'Bitte eine Uhrzeit angeben (HH:MM).'
const END_TIME_MESSAGE = 'Das Ende bitte als Uhrzeit angeben (HH:MM).'
const END_ORDER_MESSAGE = 'Das Ende muss nach dem Beginn liegen.'
const SERIE_MESSAGE = 'Bitte eine der vorgegebenen Wiederholungen wählen.'
const SERIE_BIS_ORDER_MESSAGE = 'Die Serie darf nicht vor dem ersten Termin enden.'
const SERIE_BIS_MAX_MESSAGE = 'Eine Serie läuft höchstens ein Jahr.'
const NO_OCCURRENCE_MESSAGE = 'An diesem Tag findet der Termin nicht statt.'
const PAST_ABSAGE_MESSAGE = 'Vergangene Termine lassen sich nicht mehr absagen.'

// Spitze Klammern (HTML) und alles, was nach einem Link aussieht (Schema, www., mailto:, eine Domain mit gängiger
// Endung) - Termine sind ungeprüft öffentlich. Eine Heuristik: ausblenden und löschen kann der Admin.
const PLAIN_TEXT_RE = /[<>]|:\/\/|www\.|mailto:|\b[\w-]+\.(?:de|com|org|net|info|eu|at|ch|io|shop|app)\b/i
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

// --- Prüfung -------------------------------------------------------------------------------------

// Steuer- und Bidi-Zeichen raus (lib/partners.js stripUnsafeChars), getrimmt, Länge, reiner Text. Leer -> null.
function cleanField(value, { label, max, required = false, allowNewline = false }) {
  if (value !== undefined && value !== null && typeof value !== 'string') throw httpError(400, `${label} muss Text sein`)
  const text = typeof value === 'string' ? stripUnsafeChars(value, { allowNewline }).trim() : ''
  if (!text) {
    if (required) throw httpError(400, `${label} ist Pflicht`)
    return null
  }
  if (text.length > max) throw httpError(400, `${label} darf höchstens ${max} Zeichen haben`)
  if (PLAIN_TEXT_RE.test(text)) throw httpError(400, PLAIN_TEXT_MESSAGE)
  return text
}

// Neu: ab heute. Bei einer Änderung darf ein schon vergangener erster Termin stehen bleiben (unchanged), damit eine
// laufende Serie bearbeitbar bleibt - verschieben lässt er sich nur nach heute oder später.
function validateDatum(value, { today, unchanged }) {
  if (!isIsoDate(value)) throw httpError(400, DATE_MESSAGE)
  if (value > addYears(today, MAX_VORLAUF_JAHRE)) throw httpError(400, VORLAUF_MESSAGE)
  if (value < today && value !== unchanged) throw httpError(400, PAST_MESSAGE)
  return value
}

function validateZeiten(uhrzeit, ende) {
  if (typeof uhrzeit !== 'string' || !TIME_RE.test(uhrzeit)) throw httpError(400, TIME_MESSAGE)
  if (ende === undefined || ende === null || ende === '') return { uhrzeit, ende: null }
  if (typeof ende !== 'string' || !TIME_RE.test(ende)) throw httpError(400, END_TIME_MESSAGE)
  if (ende <= uhrzeit) throw httpError(400, END_ORDER_MESSAGE)
  return { uhrzeit, ende }
}

// Ohne Serie kein Ende der Serie; ohne Angabe läuft eine Serie das ganze Jahr (maxSerieBis).
function validateSerie(serieValue, serieBisValue, datum) {
  const serie = serieValue === undefined || serieValue === null || serieValue === '' ? SERIE.keine : serieValue
  if (!SERIE_VALUES.includes(serie)) throw httpError(400, SERIE_MESSAGE)
  if (serie === SERIE.keine) return { serie, serie_bis: null }
  if (serieBisValue === undefined || serieBisValue === null || serieBisValue === '') return { serie, serie_bis: maxSerieBis(datum) }
  if (!isIsoDate(serieBisValue)) throw httpError(400, DATE_MESSAGE)
  if (serieBisValue < datum) throw httpError(400, SERIE_BIS_ORDER_MESSAGE)
  if (serieBisValue > maxSerieBis(datum)) throw httpError(400, SERIE_BIS_MAX_MESSAGE)
  return { serie, serie_bis: serieBisValue }
}

// Eingabe des Partners (camelCase: titel, text, ort, datum, uhrzeit, ende, serie, serieBis) -> saubere Spalten.
// Andere Felder (ausgeblendet, partnerId, …) werden übergangen. existing: der Termin vor einer Änderung.
function validateTermin(body, { today = berlinNow().datum, existing = null } = {}) {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {}
  const titel = cleanField(input.titel, { label: 'Der Titel', max: MAX_TITEL_LENGTH, required: true })
  const text = cleanField(input.text, { label: 'Der Text', max: MAX_TEXT_LENGTH, allowNewline: true })
  const ort = cleanField(input.ort, { label: 'Der Ort', max: MAX_ORT_LENGTH })
  const datum = validateDatum(input.datum, { today, unchanged: existing?.datum })
  const zeiten = validateZeiten(input.uhrzeit, input.ende)
  const serie = validateSerie(input.serie, input.serieBis, datum)
  assertNoBreeder({ titel, text, ort })
  return { titel, text, ort, datum, ...zeiten, ...serie }
}

// --- Abfragen ------------------------------------------------------------------------------------

const countStmt = db.prepare('SELECT COUNT(*) AS n FROM partner_termine WHERE partner_id = ?')
const listOwnStmt = db.prepare('SELECT * FROM partner_termine WHERE partner_id = ? ORDER BY datum, uhrzeit, id')
const findOwnStmt = db.prepare('SELECT * FROM partner_termine WHERE partner_id = ? AND id = ?')
const findStmt = db.prepare('SELECT * FROM partner_termine WHERE id = ?')
const insertStmt = db.prepare(
  `INSERT INTO partner_termine (partner_id, titel, text, ort, datum, uhrzeit, ende, serie, serie_bis, is_demo)
   VALUES (@partner_id, @titel, @text, @ort, @datum, @uhrzeit, @ende, @serie, @serie_bis, @is_demo)`
)
const updateStmt = db.prepare(
  `UPDATE partner_termine SET titel = @titel, text = @text, ort = @ort, datum = @datum, uhrzeit = @uhrzeit, ende = @ende,
          serie = @serie, serie_bis = @serie_bis, updated_at = datetime('now')
   WHERE id = @id`
)
const deleteStmt = db.prepare('DELETE FROM partner_termine WHERE id = ?')
const setAusgeblendetStmt = db.prepare("UPDATE partner_termine SET ausgeblendet = ?, updated_at = datetime('now') WHERE id = ?")

const absagenOfTerminStmt = db.prepare('SELECT datum FROM partner_termin_absagen WHERE termin_id = ? ORDER BY datum')
const absagenOfPartnerStmt = db.prepare(
  `SELECT a.termin_id, a.datum FROM partner_termin_absagen a JOIN partner_termine t ON t.id = a.termin_id
   WHERE t.partner_id = ? ORDER BY a.datum`
)
const insertAbsageStmt = db.prepare('INSERT OR IGNORE INTO partner_termin_absagen (termin_id, datum) VALUES (?, ?)')
const deleteAbsageStmt = db.prepare('DELETE FROM partner_termin_absagen WHERE termin_id = ? AND datum = ?')

// Öffentlich: nur nicht ausgeblendete. partnerIds als JSON-Liste (json_each), damit die Abfrage EINMAL vorbereitet wird.
const visibleOfPartnersStmt = db.prepare(
  'SELECT * FROM partner_termine WHERE ausgeblendet = 0 AND partner_id IN (SELECT value FROM json_each(?)) ORDER BY datum, uhrzeit, id'
)
const visibleAbsagenOfPartnersStmt = db.prepare(
  `SELECT a.termin_id, a.datum FROM partner_termin_absagen a JOIN partner_termine t ON t.id = a.termin_id
   WHERE t.ausgeblendet = 0 AND t.partner_id IN (SELECT value FROM json_each(?))`
)

function groupAbsagen(rows) {
  const byTermin = new Map()
  for (const { termin_id: terminId, datum } of rows) byTermin.set(terminId, [...(byTermin.get(terminId) || []), datum])
  return byTermin
}

function findOwnTermin(partnerId, id) {
  const terminId = cleanId(id)
  return terminId ? findOwnStmt.get(partnerId, terminId) : undefined
}

function findTermin(id) {
  const terminId = cleanId(id)
  return terminId ? findStmt.get(terminId) : undefined
}

// Limit und Einfügen in EINER Transaktion - zwei gleichzeitige Anfragen kommen so nicht gemeinsam über MAX_TERMINE.
const insertTermin = db.transaction((partner, clean) => {
  if (countStmt.get(partner.id).n >= MAX_TERMINE) throw httpError(409, LIMIT_MESSAGE)
  const id = insertStmt.run({ ...clean, partner_id: partner.id, is_demo: partner.is_demo ? 1 : 0 }).lastInsertRowid
  return findStmt.get(id)
})

// Die ganze Serie ändern: Absagen, die zur neuen Regel nicht mehr passen, fallen weg (sonst griffen sie später wieder,
// wenn die Serie erneut auf diesen Tag fiele).
const updateTermin = db.transaction((id, clean) => {
  updateStmt.run({ ...clean, id })
  for (const { datum } of absagenOfTerminStmt.all(id)) {
    if (!isOccurrence(clean, datum)) deleteAbsageStmt.run(id, datum)
  }
  return findStmt.get(id)
})

function deleteTermin(id) {
  return deleteStmt.run(id).changes > 0
}

function validAbsageDatum(value) {
  if (!isIsoDate(value)) throw httpError(400, DATE_MESSAGE)
  return value
}

// Nur ein echter, noch nicht vergangener Tag des Termins. Doppelt absagen schadet nicht.
function addAbsage(termin, datum, today = berlinNow().datum) {
  validAbsageDatum(datum)
  if (!isOccurrence(termin, datum)) throw httpError(400, NO_OCCURRENCE_MESSAGE)
  if (datum < today) throw httpError(400, PAST_ABSAGE_MESSAGE)
  insertAbsageStmt.run(termin.id, datum)
}

function removeAbsage(termin, datum) {
  validAbsageDatum(datum)
  deleteAbsageStmt.run(termin.id, datum)
}

function setAusgeblendet(id, ausgeblendet) {
  setAusgeblendetStmt.run(ausgeblendet ? 1 : 0, id)
  return findStmt.get(id)
}

// --- Antworten -----------------------------------------------------------------------------------

function zeitraum(today) {
  return { von: today, bis: addYears(today, ZEITRAUM_JAHRE) }
}

function compareVorkommen(a, b) {
  if (a.datum !== b.datum) return a.datum < b.datum ? -1 : 1
  if (a.uhrzeit !== b.uhrzeit) return a.uhrzeit < b.uhrzeit ? -1 : 1
  return a.terminId - b.terminId
}

// Der eigene Termin in camelCase. abgelaufen: kein Tag mehr ab heute (der Partner kann ihn löschen) - unabhängig vom
// Fenster der Übersicht.
function ownTermin(row, absagen = absagenOfTerminStmt.all(row.id).map((entry) => entry.datum), today = berlinNow().datum) {
  return {
    id: row.id,
    titel: row.titel,
    text: row.text,
    ort: row.ort,
    datum: row.datum,
    uhrzeit: row.uhrzeit,
    ende: row.ende,
    serie: row.serie,
    serieBis: row.serie_bis,
    ausgeblendet: Boolean(row.ausgeblendet),
    abgelaufen: !hasDateFrom(row, today),
    absagen,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function vorkommenOf(row, absagen, range) {
  return expandTermin(row, { ...range, absagen }).map(({ datum, abgesagt }) => ({
    terminId: row.id,
    datum,
    uhrzeit: row.uhrzeit,
    ende: row.ende,
    titel: row.titel,
    text: row.text,
    ort: row.ort,
    serie: row.serie,
    abgesagt
  }))
}

// GET /api/partner-area/termine (und die Antwort jeder Änderung): alle eigenen Termine, dazu die Übersicht der nächsten
// zwölf Monate ab heute - Serien aufgeklappt, abgesagte markiert, ausgeblendete mit ausgeblendet: true. Ohne Text je Tag
// (der steht einmal am Termin) - 50 wöchentliche Serien wären sonst über 2.600 Mal derselbe Text.
function ownTerminList(partnerId, now = berlinNow()) {
  const rows = listOwnStmt.all(partnerId)
  const absagenById = groupAbsagen(absagenOfPartnerStmt.all(partnerId))
  const range = zeitraum(now.datum)
  const vorkommen = rows
    .flatMap((row) =>
      vorkommenOf(row, absagenById.get(row.id) || [], range).map(({ text: _text, ...item }) => ({ ...item, ausgeblendet: Boolean(row.ausgeblendet) }))
    )
    .sort(compareVorkommen)
  return {
    max: MAX_TERMINE,
    heute: now.datum,
    termine: rows.map((row) => ownTermin(row, absagenById.get(row.id) || [], now.datum)),
    vorkommen
  }
}

// Kommende, nicht ausgeblendete Termine mehrerer Partner -> Map partnerId -> Einzeltermine, aufsteigend.
function upcomingByPartner(partnerIds, now) {
  const byPartner = new Map()
  if (!partnerIds.length) return byPartner
  const ids = JSON.stringify(partnerIds)
  const absagenById = groupAbsagen(visibleAbsagenOfPartnersStmt.all(ids))
  const range = zeitraum(now.datum)
  for (const row of visibleOfPartnersStmt.all(ids)) {
    const items = vorkommenOf(row, absagenById.get(row.id) || [], range).filter((item) => isUpcoming(item, now))
    byPartner.set(row.partner_id, [...(byPartner.get(row.partner_id) || []), ...items])
  }
  for (const list of byPartner.values()) list.sort(compareVorkommen)
  return byPartner
}

// Portal und Kundensicht: kommende Termine der nächsten zwölf Monate, abgesagte bleiben mit abgesagt: true stehen. Den Text
// trägt nur der erste stattfindende Tag eines Termins (das Portal zeigt ihn nur dort) - eine wöchentliche Serie wiederholte
// ihn sonst bis zu 53 Mal.
function publicTermine(partnerId, now = berlinNow()) {
  const withText = new Set()
  return (upcomingByPartner([partnerId], now).get(partnerId) || []).map((item) => {
    if (item.abgesagt || withText.has(item.terminId)) return { ...item, text: null }
    withText.add(item.terminId)
    return item
  })
}

// "Nächster Termin" je Partner-Karte in "Entdecken": der nächste, der stattfindet - Map partnerId -> { datum, uhrzeit,
// ende, titel, ort }. Partner ohne kommenden Termin fehlen in der Map.
function nextTermine(partnerIds, now = berlinNow()) {
  const result = new Map()
  for (const [partnerId, list] of upcomingByPartner(partnerIds, now)) {
    const next = list.find((item) => !item.abgesagt)
    if (next) result.set(partnerId, { datum: next.datum, uhrzeit: next.uhrzeit, ende: next.ende, titel: next.titel, ort: next.ort })
  }
  return result
}

const listAdminStmt = db.prepare('SELECT * FROM partner_termine WHERE partner_id = ? ORDER BY ausgeblendet DESC, datum, uhrzeit, id')

// Admin-Partnerpflege: alle Termine eines Partners, auch ausgeblendete und abgelaufene.
function listAdminTermine(partnerId) {
  const absagenById = groupAbsagen(absagenOfPartnerStmt.all(partnerId))
  const today = berlinNow().datum
  return listAdminStmt.all(partnerId).map((row) => ({ ...ownTermin(row, absagenById.get(row.id) || [], today), partnerId: row.partner_id }))
}

module.exports = {
  MAX_TERMINE,
  MAX_TITEL_LENGTH,
  MAX_TEXT_LENGTH,
  MAX_ORT_LENGTH,
  LIMIT_MESSAGE,
  NOT_FOUND_MESSAGE,
  validateTermin,
  findOwnTermin,
  findTermin,
  insertTermin,
  updateTermin,
  deleteTermin,
  addAbsage,
  removeAbsage,
  setAusgeblendet,
  ownTermin,
  ownTerminList,
  publicTermine,
  nextTermine,
  listAdminTermine
}
