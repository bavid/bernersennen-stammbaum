import { formatDateLong } from './dates.js'

// Globale Hinweise (Phase N Task 5, server/lib/hinweise.js): Band oben auf allen Seiten (HinweisBand) und der Reiter
// "Hinweise" im Admin (AdminHinweise). Zeiten: gespeichert als ISO in UTC, eingegeben und angezeigt in Europe/Berlin -
// unabhängig von der Zeitzone des Geräts, auf dem der Admin gerade sitzt.

export const STUFE = Object.freeze({ info: 'info', wartung: 'wartung', wichtig: 'wichtig' })
export const STUFE_OPTIONS = Object.freeze([
  { value: STUFE.info, label: 'Info – ruhig' },
  { value: STUFE.wartung, label: 'Wartung – Warnfarbe' },
  { value: STUFE.wichtig, label: 'Wichtig – Akzent' }
])
export const STATUS_LABELS = Object.freeze({ geplant: 'Geplant', aktiv: 'Aktiv', abgelaufen: 'Abgelaufen', aus: 'Aus' })
export const MAX_TITEL_LENGTH = 80
export const MAX_TEXT_LENGTH = 1000
// Beim Seitenwechsel höchstens so oft neu laden (useHinweise) - beim Laden der Seite immer.
export const REFRESH_MS = 5 * 60 * 1000

export const DISMISSED_KEY = 'chronik.hinweiseAusgeblendet'
// Die letzte Antwort von GET /api/hinweise (Audit V7a): beim nächsten Laden der Seite steht das Band sofort da, statt
// erst nach der Anfrage alles nach unten zu schieben. Nur diese Browser-Sitzung, nur öffentliche Hinweise.
export const CACHE_KEY = 'chronik.hinweiseZuletzt'
// Mehr weggeklickte Ids merken wir uns nicht - die ältesten fallen heraus (öffentlich sind höchstens fünf).
export const MAX_DISMISSED = 50

const BERLIN = 'Europe/Berlin'
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_RE = /^(\d{2}):(\d{2})$/
const MINUTE_MS = 60 * 1000

const pad = (n) => String(n).padStart(2, '0')

// hourCycle h23: Mitternacht ist 00, nie 24.
const berlinFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: BERLIN,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit'
})

function berlinParts(ms) {
  const parts = Object.fromEntries(berlinFormatter.formatToParts(new Date(ms)).map((part) => [part.type, part.value]))
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), hour: Number(parts.hour), minute: Number(parts.minute) }
}

// Versatz Berlin - UTC (in ms) zum Zeitpunkt ms: +1 h im Winter, +2 h im Sommer.
function berlinOffset(ms) {
  const p = berlinParts(ms)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(ms / MINUTE_MS) * MINUTE_MS
}

// 'JJJJ-MM-TT' + 'HH:MM' in Berliner Zeit -> ISO in UTC, ungültig -> null. Erst mit dem Versatz an der Wandzeit
// raten, dann mit dem Versatz am geratenen Zeitpunkt nachrechnen - so stimmt es auch an den Tagen der Zeitumstellung.
export function berlinToUtcIso(date, time) {
  const d = DATE_RE.exec(date || '')
  const t = TIME_RE.exec(time || '')
  if (!d || !t) return null
  const [year, month, day] = d.slice(1).map(Number)
  const [hour, minute] = t.slice(1).map(Number)
  if (hour > 23 || minute > 59) return null
  const wall = Date.UTC(year, month - 1, day, hour, minute)
  if (new Date(wall).getUTCDate() !== day || new Date(wall).getUTCMonth() !== month - 1) return null
  const guess = wall - berlinOffset(wall)
  return new Date(wall - berlinOffset(guess)).toISOString()
}

// ISO (UTC) -> { date: 'JJJJ-MM-TT', time: 'HH:MM' } in Berliner Zeit, ungültig -> null.
export function utcIsoToBerlin(iso) {
  const ms = typeof iso === 'string' ? Date.parse(iso) : NaN
  if (Number.isNaN(ms)) return null
  const p = berlinParts(ms)
  return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, time: `${pad(p.hour)}:${pad(p.minute)}` }
}

// "5. Oktober 2026, 22:00 Uhr"
export function formatBerlin(iso) {
  const berlin = utcIsoToBerlin(iso)
  return berlin ? `${formatDateLong(berlin.date)}, ${berlin.time} Uhr` : ''
}

// "ab 5. Oktober 2026, 22:00 Uhr · ohne Ende", "5. Oktober 2026, 20:00 – 22:30 Uhr" (ein Tag) bzw.
// "5. Oktober 2026, 22:00 Uhr – 6. Oktober 2026, 01:30 Uhr"
export function formatZeitraum({ start, ende }) {
  if (!ende) return `ab ${formatBerlin(start)} · ohne Ende`
  const von = utcIsoToBerlin(start)
  const bis = utcIsoToBerlin(ende)
  if (von && bis && von.date === bis.date) return `${formatDateLong(von.date)}, ${von.time} – ${bis.time} Uhr`
  return `${formatBerlin(start)} – ${formatBerlin(ende)}`
}

// --- Formular im Admin -----------------------------------------------------------------------------

export function initialHinweisForm(hinweis, now = new Date()) {
  const start = utcIsoToBerlin(hinweis ? hinweis.start : now.toISOString())
  const ende = hinweis?.ende ? utcIsoToBerlin(hinweis.ende) : null
  return {
    titel: hinweis?.titel || '',
    text: hinweis?.text || '',
    stufe: hinweis?.stufe || STUFE.info,
    startDate: start?.date || '',
    startTime: start?.time || '',
    endeDate: ende?.date || '',
    endeTime: ende?.time || '',
    aktiv: hinweis ? Boolean(hinweis.aktiv) : true
  }
}

function endeIso(form) {
  return form.endeDate || form.endeTime ? berlinToUtcIso(form.endeDate, form.endeTime) : null
}

// Prüfung vor dem Absenden - dieselben Regeln wie der Server (server/lib/hinweise.js), soweit sie hier sichtbar sind.
// { feld: Meldung }, leer = alles gut.
export function hinweisClientErrors(form) {
  const errors = {}
  if (!form.titel.trim()) errors.titel = 'Bitte gib einen Titel an.'
  const start = berlinToUtcIso(form.startDate, form.startTime)
  if (!start) errors.start = 'Bitte Datum und Uhrzeit des Beginns angeben.'
  const hasEnde = Boolean(form.endeDate || form.endeTime)
  const ende = endeIso(form)
  if (hasEnde && !ende) errors.ende = 'Bitte zum Ende auch eine Uhrzeit angeben – oder beides leer lassen.'
  else if (start && ende && ende <= start) errors.ende = 'Das Ende muss nach dem Beginn liegen.'
  return errors
}

export function toHinweisPayload(form) {
  return {
    titel: form.titel.trim(),
    text: form.text.trim() || null,
    stufe: form.stufe,
    start: berlinToUtcIso(form.startDate, form.startTime),
    ende: endeIso(form),
    aktiv: form.aktiv
  }
}

// --- Weggeklickt (nur diese Browser-Sitzung) -------------------------------------------------------

// sessionStorage kann fehlen oder werfen (privates Fenster, gesperrte Website-Daten) - dann gilt: nichts weggeklickt,
// und Wegklicken wirkt nur, bis die Seite neu geladen wird.
export function readDismissed() {
  try {
    const parsed = JSON.parse(globalThis.sessionStorage.getItem(DISMISSED_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.filter((id) => Number.isInteger(id)) : []
  } catch {
    return []
  }
}

export function writeDismissed(ids) {
  try {
    globalThis.sessionStorage.setItem(DISMISSED_KEY, JSON.stringify(ids))
  } catch {
    // Merken ist optional (siehe readDismissed).
  }
}

export function addDismissed(ids, id) {
  if (ids.includes(id)) return ids
  return [...ids, id].slice(-MAX_DISMISSED)
}

export function visibleHinweise(list, dismissed) {
  return (list || []).filter((hinweis) => !dismissed.includes(hinweis.id))
}

// --- Zuletzt geladen (nur diese Browser-Sitzung) ---------------------------------------------------

const STUFE_VALUES = Object.values(STUFE)

// Nur, was das Band wirklich zeigt - und nur in der erwarteten Form (der Speicher ist für die Seite fremde Eingabe).
function isCachedHinweis(item) {
  return (
    Boolean(item) &&
    Number.isInteger(item.id) &&
    typeof item.titel === 'string' &&
    item.titel.length <= MAX_TITEL_LENGTH &&
    (item.text === null || item.text === undefined || (typeof item.text === 'string' && item.text.length <= MAX_TEXT_LENGTH)) &&
    STUFE_VALUES.includes(item.stufe)
  )
}

// null: nichts gemerkt (oder unbrauchbar) - dann wartet das Band wie bisher auf die Antwort.
export function readCachedHinweise() {
  try {
    const parsed = JSON.parse(globalThis.sessionStorage.getItem(CACHE_KEY) || 'null')
    if (!Array.isArray(parsed)) return null
    return parsed.filter(isCachedHinweis).map(({ id, titel, text, stufe }) => ({ id, titel, text: text ?? null, stufe }))
  } catch {
    return null
  }
}

export function writeCachedHinweise(list) {
  try {
    const clean = (list || []).filter(isCachedHinweis).map(({ id, titel, text, stufe }) => ({ id, titel, text: text ?? null, stufe }))
    globalThis.sessionStorage.setItem(CACHE_KEY, JSON.stringify(clean))
  } catch {
    // Merken ist optional (siehe readDismissed).
  }
}
