'use strict'

// V4a: Serien der Partner-Termine (lib/partnerTermine.js) - reine Datumsrechnung, keine Datenbank. Termine speichern
// Ortszeit als Text (datum 'JJJJ-MM-TT', uhrzeit/ende 'HH:MM', gemeint ist Europe/Berlin). Gerechnet wird nur mit dem
// Kalenderdatum (UTC-Datum ohne Uhrzeit): ein Tag ist immer ein Tag, Sommer- und Winterzeit spielen keine Rolle.
//
// Eine Serie leitet ihre Regel aus dem ersten Termin (datum) ab:
// - woechentlich / zweiwoechentlich: alle 7 bzw. 14 Tage;
// - monatlich_tag: am selben Tag im Monat - Monate ohne diesen Tag (z. B. den 31.) fallen weg;
// - monatlich_wochentag: am n. Wochentag im Monat (n = der wievielte dieses Wochentags datum ist, z. B. der 2.
//   Samstag) - Monate ohne einen fünften Wochentag fallen weg.
// Eine Serie läuft bis serie_bis (einschließlich), höchstens aber ein Jahr ab dem ersten Termin (maxSerieBis).
// "Ein Jahr" heißt genau: bis EINSCHLIESSLICH desselben Kalendertags im Folgejahr - 2026-10-15 -> 2027-10-15 (eine
// monatliche Serie am 15. hat damit 13 Termine), der 29.02. -> der 28.02. Ein Tag später ist zu spät.

const SERIE = Object.freeze({
  keine: 'keine',
  woechentlich: 'woechentlich',
  zweiwoechentlich: 'zweiwoechentlich',
  monatlichTag: 'monatlich_tag',
  monatlichWochentag: 'monatlich_wochentag'
})
const SERIE_VALUES = Object.freeze(Object.values(SERIE))

const DAY_MS = 24 * 60 * 60 * 1000
const DAYS_PER_WEEK = 7
const STEP_DAYS = Object.freeze({ [SERIE.woechentlich]: DAYS_PER_WEEK, [SERIE.zweiwoechentlich]: 2 * DAYS_PER_WEEK })
const SERIE_MAX_JAHRE = 1
const BERLIN = 'Europe/Berlin'

const pad = (n, length = 2) => String(n).padStart(length, '0')

function parts(iso) {
  const [year, month, day] = iso.split('-').map(Number)
  return { year, month, day }
}

// setUTCFullYear statt Date.UTC: Date.UTC deutet Jahre unter 100 als 19xx.
function utcMs(year, month, day) {
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  return date.getTime()
}

function isoFromMs(ms) {
  const date = new Date(ms)
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

function isoOf(year, month, day) {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`
}

function addDays(iso, days) {
  const { year, month, day } = parts(iso)
  return isoFromMs(utcMs(year, month, day) + days * DAY_MS)
}

function daysInMonth(year, month) {
  return new Date(utcMs(year, month + 1, 0)).getUTCDate()
}

// Der 29. Februar wird im Zieljahr ohne Schalttag zum 28.
function addYears(iso, years) {
  const { year, month, day } = parts(iso)
  const target = year + years
  return isoOf(target, month, Math.min(day, daysInMonth(target, month)))
}

// 0 = Sonntag … 6 = Samstag (wie Date#getUTCDay).
function weekdayOf(iso) {
  const { year, month, day } = parts(iso)
  return new Date(utcMs(year, month, day)).getUTCDay()
}

// Der wievielte dieses Wochentags im Monat (1 … 5).
function nthWeekdayOf(iso) {
  return Math.ceil(parts(iso).day / DAYS_PER_WEEK)
}

// Letzter erlaubter Tag einer Serie (einschließlich) - siehe oben.
function maxSerieBis(datum) {
  return addYears(datum, SERIE_MAX_JAHRE)
}

// Letzter möglicher Termin: ein einzelner endet an seinem Tag, eine Serie an serie_bis - nie nach maxSerieBis.
function lastDate({ datum, serie, serie_bis: serieBis }) {
  if (serie === SERIE.keine) return datum
  const cap = maxSerieBis(datum)
  return serieBis && serieBis < cap ? serieBis : cap
}

function stepDates(datum, step, end) {
  const result = []
  for (let current = datum; current <= end; current = addDays(current, step)) result.push(current)
  return result
}

// Je Monat von datum bis end höchstens ein Tag: dayInMonth(year, month) liefert ihn oder null (fällt weg).
function monthlyDates(datum, end, dayInMonth) {
  const result = []
  const last = parts(end)
  for (let { year, month } = parts(datum); year < last.year || (year === last.year && month <= last.month); ) {
    const day = dayInMonth(year, month)
    if (day !== null) {
      const iso = isoOf(year, month, day)
      if (iso >= datum && iso <= end) result.push(iso)
    }
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }
  return result
}

function sameDayOfMonth(datum) {
  const { day } = parts(datum)
  return (year, month) => (day <= daysInMonth(year, month) ? day : null)
}

function sameNthWeekday(datum) {
  const weekday = weekdayOf(datum)
  const nth = nthWeekdayOf(datum)
  return (year, month) => {
    const first = new Date(utcMs(year, month, 1)).getUTCDay()
    const day = 1 + ((weekday - first + DAYS_PER_WEEK) % DAYS_PER_WEEK) + (nth - 1) * DAYS_PER_WEEK
    return day <= daysInMonth(year, month) ? day : null
  }
}

// Alle Daten eines Termins, aufsteigend - ohne Zeitfenster.
function allDates(termin) {
  const end = lastDate(termin)
  if (termin.serie === SERIE.keine) return [termin.datum]
  if (STEP_DAYS[termin.serie]) return stepDates(termin.datum, STEP_DAYS[termin.serie], end)
  if (termin.serie === SERIE.monatlichTag) return monthlyDates(termin.datum, end, sameDayOfMonth(termin.datum))
  if (termin.serie === SERIE.monatlichWochentag) return monthlyDates(termin.datum, end, sameNthWeekday(termin.datum))
  return []
}

// Die Termine im Zeitfenster [von, bis] (beides einschließlich, 'JJJJ-MM-TT'), aufsteigend: [{ datum, abgesagt }].
// absagen: abgesagte Daten dieses Termins - sie bleiben in der Liste (abgesagt: true), damit "fällt aus" sichtbar ist.
function expandTermin(termin, { von, bis, absagen = [] }) {
  const cancelled = new Set(absagen)
  return allDates(termin)
    .filter((datum) => datum >= von && datum <= bis)
    .map((datum) => ({ datum, abgesagt: cancelled.has(datum) }))
}

// Gibt es ab heute (einschließlich) noch einen Tag? Unabhängig von einem Anzeige-Zeitraum.
function hasDateFrom(termin, today) {
  return lastDate(termin) >= today && allDates(termin).some((datum) => datum >= today)
}

function isOccurrence(termin, datum) {
  return typeof datum === 'string' && allDates(termin).includes(datum)
}

// Steht ein Termin noch bevor? now = { datum, zeit } in Berliner Ortszeit (berlinNow). Ein Termin von heute zählt,
// solange sein Ende (ohne Ende: sein Beginn) noch nicht vorbei ist.
function isUpcoming({ datum, uhrzeit, ende }, now) {
  if (datum !== now.datum) return datum > now.datum
  return (ende || uhrzeit) >= now.zeit
}

const berlinFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: BERLIN,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
})

// "Jetzt" als Berliner Ortszeit: { datum: 'JJJJ-MM-TT', zeit: 'HH:MM' } - unabhängig von der Zeitzone des Servers.
function berlinNow(now = new Date()) {
  const byType = Object.fromEntries(berlinFormat.formatToParts(now).map((part) => [part.type, part.value]))
  return { datum: `${byType.year}-${byType.month}-${byType.day}`, zeit: `${byType.hour}:${byType.minute}` }
}

module.exports = {
  SERIE,
  SERIE_VALUES,
  addDays,
  addYears,
  weekdayOf,
  nthWeekdayOf,
  maxSerieBis,
  expandTermin,
  hasDateFrom,
  isOccurrence,
  isUpcoming,
  berlinNow
}
