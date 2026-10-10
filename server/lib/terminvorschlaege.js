'use strict'

// Geschäftsanfrage (/partner-werden): Terminvorschläge für ein erstes Gespräch. Rein, ohne Datenbank - geprüft in
// lib/geschaeftAnfragen.js, gespiegelt im Client (client/src/lib/geschaeftAnfrage.js).
// Regeln: 1 bis MAX_TERMINE Vorschläge, je ein Datum (frühestens morgen, höchstens MAX_TAGE_VORAUS Tage voraus,
// Montag bis Samstag, Kalender in Europe/Berlin), ein Zeitfenster und optional Telefon oder Video. Doppelte
// Vorschläge (gleicher Tag und gleiches Zeitfenster) werden abgelehnt.

const MIN_TERMINE = 1
const MAX_TERMINE = 3
const MAX_TAGE_VORAUS = 60
const ZEITZONE = 'Europe/Berlin'
const DAY_MS = 24 * 60 * 60 * 1000
const SONNTAG = 0
const DATUM_RE = /^\d{4}-\d{2}-\d{2}$/

const ZEITFENSTER = Object.freeze({
  vormittag: 'Vormittag (9–12 Uhr)',
  mittag: 'Mittag (12–15 Uhr)',
  nachmittag: 'Nachmittag (15–18 Uhr)',
  abend: 'Abend (18–20 Uhr)'
})
const KANAL = Object.freeze({ telefon: 'Telefon', video: 'Video' })
const WOCHENTAGE = Object.freeze(['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'])

const TERMINE_MESSAGE = `Bitte schlagt mindestens ${MIN_TERMINE} und höchstens ${MAX_TERMINE} Termine vor.`
const DATUM_MESSAGE = `Ein Termin muss zwischen morgen und in ${MAX_TAGE_VORAUS} Tagen liegen, Montag bis Samstag.`
const ZEITFENSTER_MESSAGE = 'Bitte wählt für jeden Termin ein Zeitfenster.'
const KANAL_MESSAGE = 'Bitte wählt Telefon oder Video – oder lasst es offen.'
const DOPPELT_MESSAGE = 'Bitte schlagt jeden Termin nur einmal vor.'

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

// Heutiges Datum (YYYY-MM-DD) im Kalender von Berlin.
function heuteBerlin(now = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZEITZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

function datumPlusTage(datum, tage) {
  return new Date(Date.parse(`${datum}T00:00:00Z`) + tage * DAY_MS).toISOString().slice(0, 10)
}

function istGueltigesDatum(datum) {
  if (typeof datum !== 'string' || !DATUM_RE.test(datum)) return false
  const parsed = new Date(`${datum}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === datum
}

function wochentag(datum) {
  return new Date(`${datum}T00:00:00Z`).getUTCDay()
}

function validateDatum(value, heute) {
  if (!istGueltigesDatum(value)) throw httpError(400, DATUM_MESSAGE)
  const imRahmen = value >= datumPlusTage(heute, 1) && value <= datumPlusTage(heute, MAX_TAGE_VORAUS)
  if (!imRahmen || wochentag(value) === SONNTAG) throw httpError(400, DATUM_MESSAGE)
  return value
}

function validateTermin(input, heute) {
  const termin = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const datum = validateDatum(termin.datum, heute)
  if (!Object.hasOwn(ZEITFENSTER, termin.zeitfenster ?? '')) throw httpError(400, ZEITFENSTER_MESSAGE)
  const kanal = termin.kanal === undefined || termin.kanal === null || termin.kanal === '' ? null : termin.kanal
  if (kanal !== null && !Object.hasOwn(KANAL, kanal)) throw httpError(400, KANAL_MESSAGE)
  return Object.freeze({ datum, zeitfenster: termin.zeitfenster, kanal })
}

// Liste aus dem Body -> saubere, eingefrorene Vorschläge. now nur für Tests.
function validateTermine(value, { now = Date.now() } = {}) {
  if (!Array.isArray(value) || value.length < MIN_TERMINE || value.length > MAX_TERMINE) throw httpError(400, TERMINE_MESSAGE)
  const heute = heuteBerlin(now)
  const termine = value.map((termin) => validateTermin(termin, heute))
  const schluessel = new Set(termine.map((termin) => `${termin.datum}|${termin.zeitfenster}`))
  if (schluessel.size !== termine.length) throw httpError(400, DOPPELT_MESSAGE)
  return Object.freeze(termine)
}

// "Dienstag, 13.10.2026, Vormittag (9–12 Uhr), Telefon" - für die Admin-Benachrichtigung und die Bestätigung.
function formatTermin(termin) {
  const [jahr, monat, tag] = termin.datum.split('-')
  const teile = [`${WOCHENTAGE[wochentag(termin.datum)]}, ${tag}.${monat}.${jahr}`, ZEITFENSTER[termin.zeitfenster]]
  if (termin.kanal) teile.push(KANAL[termin.kanal])
  return teile.join(', ')
}

module.exports = {
  MIN_TERMINE,
  MAX_TERMINE,
  MAX_TAGE_VORAUS,
  ZEITFENSTER,
  KANAL,
  TERMINE_MESSAGE,
  DATUM_MESSAGE,
  heuteBerlin,
  datumPlusTage,
  validateTermine,
  formatTermin
}
