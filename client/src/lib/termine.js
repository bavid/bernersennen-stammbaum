// Reine Hilfen für den Kalender der Partner (Phase V4a): Übersicht im Partner-Bereich (PartnerTermineEditor), Portal
// (PortalTermine) und "Nächster Termin" auf der Karte in Entdecken (PartnerDiscoverCard). Regeln und Meldungen spiegeln
// server/lib/partnerTermine.js validateTermin, die Serien server/lib/terminSerien.js. Daten sind Ortszeit als Text
// ('JJJJ-MM-TT', 'HH:MM') - gerechnet wird nur mit dem Kalenderdatum (UTC-Datum ohne Uhrzeit).
import { MONTHS } from './dates.js'

export const MAX_TERMINE = 50
export const MAX_TITEL_LENGTH = 80
export const MAX_TEXT_LENGTH = 500
export const MAX_ORT_LENGTH = 120
// Portal: zuerst die nächsten drei Monate, "Mehr anzeigen" bis zu zwölf (so weit liefert der Server).
export const PORTAL_MONATE = 3

export const TERMINE_HINT =
  'Termine erscheinen sofort auf eurem Portal und als „Nächster Termin“ in Entdecken – ohne Prüfung durch uns. Bitte nur reinen Text, ohne Links.'
export const LIMIT_HINT = `Höchstens ${MAX_TERMINE} Termine – eine Serie zählt als einer. Bitte ältere löschen, um neue anzulegen.`
export const PLAIN_TEXT_MESSAGE = 'Termine dürfen nur reinen Text enthalten (kein HTML, keine Links).'

export const SERIE = Object.freeze({
  keine: 'keine',
  woechentlich: 'woechentlich',
  zweiwoechentlich: 'zweiwoechentlich',
  monatlichWochentag: 'monatlich_wochentag',
  monatlichTag: 'monatlich_tag'
})

const WEEKDAYS_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
const WEEKDAYS_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
// Wie der Server (server/lib/partnerTermine.js PLAIN_TEXT_RE): HTML und alles, was nach einem Link aussieht.
const PLAIN_TEXT_RE = /[<>]|:\/\/|www\.|mailto:|\b[\w-]+\.(?:de|com|org|net|info|eu|at|ch|io|shop|app)\b/i
const DAYS_PER_WEEK = 7

function parts(iso) {
  const match = typeof iso === 'string' ? ISO_DATE_RE.exec(iso) : null
  if (!match) return null
  const [year, month, day] = match.slice(1).map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return { year, month, day, weekday: date.getUTCDay() }
}

export function isIsoDate(value) {
  return parts(value) !== null
}

const pad = (n) => String(n).padStart(2, '0')

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

// Monate addieren, auf das Monatsende geklemmt (31.10. + 4 Monate = 28.02.).
export function addMonths(iso, months) {
  const p = parts(iso)
  if (!p) return ''
  const index = p.year * 12 + (p.month - 1) + months
  const year = Math.floor(index / 12)
  const month = (index % 12) + 1
  return `${year}-${pad(month)}-${pad(Math.min(p.day, daysInMonth(year, month)))}`
}

// Wie der Server (lib/terminSerien.js maxSerieBis): eine Serie läuft höchstens ein Jahr ab dem ersten Termin.
export function maxSerieBis(datum) {
  return addMonths(datum, 12)
}

// "Sa, 10.10."
export function formatTagKurz(iso) {
  const p = parts(iso)
  return p ? `${WEEKDAYS_SHORT[p.weekday]}, ${p.day}.${p.month}.` : ''
}

// "Samstag, 10. Oktober"
export function formatTagLang(iso) {
  const p = parts(iso)
  return p ? `${WEEKDAYS_LONG[p.weekday]}, ${p.day}. ${MONTHS[p.month - 1]}` : ''
}

export function formatUhrzeit(uhrzeit, ende) {
  return ende ? `${uhrzeit}–${ende} Uhr` : `${uhrzeit} Uhr`
}

// "Sa, 12.10., 10:00 · Welpenspielstunde" - die Zeile auf der Partner-Karte in Entdecken.
export function naechsterTerminText(termin) {
  if (!termin || !parts(termin.datum)) return ''
  return `${formatTagKurz(termin.datum)}, ${termin.uhrzeit} · ${termin.titel}`
}

// Die Regel einer Serie in Worten - aus dem ersten Termin abgeleitet wie auf dem Server.
export function serieLabel(serie, datum) {
  const p = parts(datum)
  const weekday = p ? WEEKDAYS_LONG[p.weekday] : null
  switch (serie) {
    case SERIE.keine:
      return 'Einmalig'
    case SERIE.woechentlich:
      return weekday ? `Jeden ${weekday}` : 'Jede Woche'
    case SERIE.zweiwoechentlich:
      return weekday ? `Alle zwei Wochen am ${weekday}` : 'Alle zwei Wochen'
    case SERIE.monatlichWochentag:
      return weekday ? `Jeden ${Math.ceil(p.day / DAYS_PER_WEEK)}. ${weekday} im Monat` : 'Jeden n. Wochentag im Monat'
    case SERIE.monatlichTag:
      return p ? `Jeden Monat am ${p.day}.` : 'Jeden Monat am selben Tag'
    default:
      return ''
  }
}

// Monatliche Serien am 29. bis 31. bzw. am 5. Wochentag fallen in Monaten ohne diesen Tag aus - das sagt das Formular.
export function serieSkipsMonths(serie, datum) {
  const p = parts(datum)
  if (!p) return false
  if (serie === SERIE.monatlichTag) return p.day > 28
  if (serie === SERIE.monatlichWochentag) return Math.ceil(p.day / DAYS_PER_WEEK) === 5
  return false
}

export function serieOptions(datum) {
  return Object.values(SERIE).map((value) => ({ value, label: serieLabel(value, datum) }))
}

// Einzeltermine je Monat: [{ key: 'JJJJ-MM', label: 'Oktober 2026', items }], in der Reihenfolge der Liste.
export function groupByMonth(items) {
  const groups = []
  for (const item of items) {
    const key = item.datum.slice(0, 7)
    const last = groups.at(-1)
    if (last?.key === key) last.items.push(item)
    else groups.push({ key, label: `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`, items: [item] })
  }
  return groups
}

// Was in die nächsten months Monate fällt (einschließlich des Tages genau months Monate später) - und der Rest.
export function splitByHorizon(items, today, months) {
  const horizon = addMonths(today, months)
  return { sichtbar: items.filter((item) => item.datum <= horizon), spaeter: items.filter((item) => item.datum > horizon) }
}

export function vorkommenKey(item) {
  return `${item.terminId}-${item.datum}`
}

// --- Formular ------------------------------------------------------------------------------------

export function initialTerminForm(termin) {
  return {
    titel: termin?.titel || '',
    text: termin?.text || '',
    ort: termin?.ort || '',
    datum: termin?.datum || '',
    uhrzeit: termin?.uhrzeit || '',
    ende: termin?.ende || '',
    serie: termin?.serie || SERIE.keine,
    serieBis: termin?.serieBis || ''
  }
}

export function toTerminPayload(form) {
  const isSerie = form.serie !== SERIE.keine
  return {
    titel: form.titel.trim(),
    text: form.text.trim() || null,
    ort: form.ort.trim() || null,
    datum: form.datum,
    uhrzeit: form.uhrzeit,
    ende: form.ende || null,
    serie: form.serie,
    serieBis: isSerie ? form.serieBis || null : null
  }
}

function textErrors(form) {
  const errors = {}
  if (!form.titel.trim()) errors.titel = 'Der Titel ist Pflicht'
  for (const key of ['titel', 'text', 'ort']) {
    if (!errors[key] && PLAIN_TEXT_RE.test(form[key])) errors[key] = PLAIN_TEXT_MESSAGE
  }
  return errors
}

function dateErrors(form, { today, existingDatum }) {
  const errors = {}
  if (!isIsoDate(form.datum)) errors.datum = 'Bitte ein gültiges Datum angeben (JJJJ-MM-TT).'
  else if (form.datum < today && form.datum !== existingDatum) errors.datum = 'Der Termin liegt in der Vergangenheit.'
  else if (form.datum > maxSerieBis(today)) errors.datum = 'Termine höchstens ein Jahr im Voraus.'
  if (!TIME_RE.test(form.uhrzeit)) errors.uhrzeit = 'Bitte eine Uhrzeit angeben (HH:MM).'
  else if (form.ende && form.ende <= form.uhrzeit) errors.ende = 'Das Ende muss nach dem Beginn liegen.'
  if (form.serie !== SERIE.keine && form.serieBis && !errors.datum) {
    if (form.serieBis < form.datum) errors.serieBis = 'Die Serie darf nicht vor dem ersten Termin enden.'
    else if (form.serieBis > maxSerieBis(form.datum)) errors.serieBis = 'Eine Serie läuft höchstens ein Jahr.'
  }
  return errors
}

// Was der Server sicher ablehnen würde, gleich am Feld - gleicher Wortlaut. existingDatum: beim Bearbeiten darf ein
// schon vergangener erster Termin einer laufenden Serie stehen bleiben.
export function terminClientErrors(form, { today, existingDatum = null }) {
  return { ...textErrors(form), ...dateErrors(form, { today, existingDatum }) }
}

const FIELD_BY_MESSAGE = [
  [/^Der Titel /, 'titel'],
  [/^Der Text /, 'text'],
  [/^Der Ort /, 'ort'],
  [/^Das Ende /, 'ende'],
  [/Uhrzeit angeben/, 'uhrzeit'],
  [/Serie (darf|läuft)/, 'serieBis'],
  [/Wiederholungen/, 'serie'],
  [/(gültiges Datum|Vergangenheit|im Voraus)/, 'datum']
]

// Server-Meldung -> Formularfeld; alles andere (Limit, Demo, reiner Text ohne Feldangabe) steht oben im Formular.
export function terminErrorField(message) {
  if (typeof message !== 'string') return null
  return FIELD_BY_MESSAGE.find(([pattern]) => pattern.test(message))?.[1] ?? null
}
