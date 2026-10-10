// Reine Hilfen für den Kalender der Partner (Phase V4a): Übersicht im Partner-Bereich (PartnerTermineEditor), Portal
// (PortalTermine) und "Nächster Termin" auf der Karte in Entdecken (PartnerDiscoverCard). Regeln und Meldungen spiegeln
// server/lib/partnerTermine.js validateTermin, die Serien server/lib/terminSerien.js. Daten sind Ortszeit als Text
// ('JJJJ-MM-TT', 'HH:MM') - gerechnet wird nur mit dem Kalenderdatum (UTC-Datum ohne Uhrzeit).
import { monthNames } from './dates.js'
import { getLang, t } from './i18n/index.js'

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
const WEEKDAYS_LONG_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const WEEKDAYS_SHORT_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const ORDINALS_EN = ['1st', '2nd', '3rd', '4th', '5th']
const isEn = () => getLang() === 'en'
const weekdayLong = (index) => (isEn() ? WEEKDAYS_LONG_EN : WEEKDAYS_LONG)[index]
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
  if (!p) return ''
  if (isEn()) return `${WEEKDAYS_SHORT_EN[p.weekday]}, ${p.day} ${monthNames()[p.month - 1].slice(0, 3)}`
  return `${WEEKDAYS_SHORT[p.weekday]}, ${p.day}.${p.month}.`
}

// "Samstag, 10. Oktober"
export function formatTagLang(iso) {
  const p = parts(iso)
  if (!p) return ''
  if (isEn()) return `${weekdayLong(p.weekday)}, ${p.day} ${monthNames()[p.month - 1]}`
  return `${WEEKDAYS_LONG[p.weekday]}, ${p.day}. ${monthNames()[p.month - 1]}`
}

export function formatUhrzeit(uhrzeit, ende) {
  return ende ? t('{start}–{end} Uhr', { start: uhrzeit, end: ende }) : t('{time} Uhr', { time: uhrzeit })
}

// "Sa, 12.10., 10:00 · Welpenspielstunde" - die Zeile auf der Partner-Karte in Entdecken.
export function naechsterTerminText(termin) {
  if (!termin || !parts(termin.datum)) return ''
  return `${formatTagKurz(termin.datum)}, ${termin.uhrzeit} · ${termin.titel}`
}

// Die Regel einer Serie in Worten - aus dem ersten Termin abgeleitet wie auf dem Server.
export function serieLabel(serie, datum) {
  const p = parts(datum)
  const weekday = p ? weekdayLong(p.weekday) : null
  const nth = p ? Math.ceil(p.day / DAYS_PER_WEEK) : 0
  switch (serie) {
    case SERIE.keine:
      return t('Einmalig')
    case SERIE.woechentlich:
      return weekday ? t('Jeden {weekday}', { weekday }) : t('Jede Woche')
    case SERIE.zweiwoechentlich:
      return weekday ? t('Alle zwei Wochen am {weekday}', { weekday }) : t('Alle zwei Wochen')
    case SERIE.monatlichWochentag:
      return weekday ? t('Jeden {n}. {weekday} im Monat', { n: nth, nth: ORDINALS_EN[nth - 1], weekday }) : t('Jeden n. Wochentag im Monat')
    case SERIE.monatlichTag:
      return p ? t('Jeden Monat am {n}.', { n: p.day, nth: ordinalEn(p.day) }) : t('Jeden Monat am selben Tag')
    default:
      return ''
  }
}

// Englische Ordnungszahl: 1st, 2nd, 3rd, 4th … 11th, 12th, 13th, 21st, 22nd, 23rd, 31st.
function ordinalEn(n) {
  const teen = n % 100 >= 11 && n % 100 <= 13
  const suffix = teen ? 'th' : { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'
  return `${n}${suffix}`
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
    else groups.push({ key, label: `${monthNames()[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`, items: [item] })
  }
  return groups
}

// Audit V7a: die Übersicht im Partner-Bereich zeigt jede Serie einmal - { serien: [{ terminId, items, naechster, abgesagt }],
// einzeln } aus den Vorkommen (Reihenfolge der Liste). naechster: das erste stattfindende Vorkommen (fallen alle aus, das
// erste), abgesagt: wie viele Tage der Serie ausfallen. einzeln: die Vorkommen einmaliger Termine.
export function splitSerien(items) {
  const byTermin = new Map()
  const einzeln = []
  for (const item of items) {
    if (item.serie === SERIE.keine) {
      einzeln.push(item)
      continue
    }
    if (!byTermin.has(item.terminId)) byTermin.set(item.terminId, [])
    byTermin.get(item.terminId).push(item)
  }
  const serien = [...byTermin].map(([terminId, list]) => ({
    terminId,
    items: list,
    naechster: list.find((item) => !item.abgesagt) || list[0],
    abgesagt: list.filter((item) => item.abgesagt).length
  }))
  return { serien, einzeln }
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
  if (!form.titel.trim()) errors.titel = t('Der Titel ist Pflicht')
  for (const key of ['titel', 'text', 'ort']) {
    if (!errors[key] && PLAIN_TEXT_RE.test(form[key])) errors[key] = t(PLAIN_TEXT_MESSAGE)
  }
  return errors
}

function dateErrors(form, { today, existingDatum }) {
  const errors = {}
  if (!isIsoDate(form.datum)) errors.datum = t('Bitte ein gültiges Datum angeben (JJJJ-MM-TT).')
  else if (form.datum < today && form.datum !== existingDatum) errors.datum = t('Der Termin liegt in der Vergangenheit.')
  else if (form.datum > maxSerieBis(today)) errors.datum = t('Termine höchstens ein Jahr im Voraus.')
  if (!TIME_RE.test(form.uhrzeit)) errors.uhrzeit = t('Bitte eine Uhrzeit angeben (HH:MM).')
  else if (form.ende && form.ende <= form.uhrzeit) errors.ende = t('Das Ende muss nach dem Beginn liegen.')
  if (form.serie !== SERIE.keine && form.serieBis && !errors.datum) {
    if (form.serieBis < form.datum) errors.serieBis = t('Die Serie darf nicht vor dem ersten Termin enden.')
    else if (form.serieBis > maxSerieBis(form.datum)) errors.serieBis = t('Eine Serie läuft höchstens ein Jahr.')
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
