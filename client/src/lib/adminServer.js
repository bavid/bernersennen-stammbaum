// Reine Hilfen für den Admin-Reiter „Server“ (Phase G Task 6, AdminServer und seine Teile) - spiegeln die Antwort von
// GET /api/admin/server (server/lib/serverMetrics.js). Kein DOM, damit Formate, Zusammenfassung und die Geometrie der
// Verlaufslinien einzeln prüfbar sind. Zahlen immer de-DE, Zeiten in Europe/Berlin.

export const AMPEL_LABELS = Object.freeze({ ok: 'ok', erhoeht: 'erhöht', kritisch: 'kritisch' })

// Reihenfolge und Namen der Messwerte mit Ampel (Karten und Zusammenfassung).
export const AMPEL_METRIKEN = Object.freeze([
  { key: 'speicher', label: 'Arbeitsspeicher' },
  { key: 'platte', label: 'Speicherplatz' },
  { key: 'last', label: 'Last' }
])

// Zeichenfläche einer Verlaufslinie (viewBox); pad hält Platz für den Endpunkt samt Ring.
export const VERLAUF_SIZE = Object.freeze({ width: 600, height: 72, pad: 6 })

const DASH = '–'
const UNITS = ['B', 'KB', 'MB', 'GB', 'TB']
const oneDecimal = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 })
const noDecimal = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 })
const twoDecimals = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 })
const dateTime = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'medium', timeStyle: 'short' })
const timeOnly = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', timeStyle: 'short' })

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value)
const round = (value) => Math.round(value * 100) / 100
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`

function bytesDigits(value, unit) {
  if (unit === 0) return 0
  return value < 10 || (UNITS[unit] === 'GB' && value < 100) ? 1 : 0
}

// "3,7 GB", "56 MB", "4 KB" - Binärstufen (1024), unter 10 (GB: unter 100) mit einer Nachkommastelle. Gerundet wird vor
// dem Wechsel der Einheit - 1.048.570 Bytes sind "1 MB", nie "1.024 KB".
export function formatBytes(bytes) {
  if (!isNumber(bytes) || bytes < 0) return DASH
  let value = bytes
  let unit = 0
  const rounded = () => {
    const factor = 10 ** bytesDigits(value, unit)
    return Math.round(value * factor) / factor
  }
  while (rounded() >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  const format = bytesDigits(value, unit) ? oneDecimal : noDecimal
  return `${format.format(value)} ${UNITS[unit]}`
}

export function formatPercent(value) {
  return isNumber(value) ? `${oneDecimal.format(value)} %` : DASH
}

export function formatLoad(value) {
  return isNumber(value) ? twoDecimals.format(value) : DASH
}

// Laufzeit in Worten: höchstens zwei Stufen ("1 Tag, 4 Stunden", "3 Stunden, 12 Minuten", "5 Minuten").
export function formatDuration(seconds) {
  if (!isNumber(seconds) || seconds < 0) return DASH
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return [plural(days, 'Tag', 'Tage'), hours > 0 && plural(hours, 'Stunde', 'Stunden')].filter(Boolean).join(', ')
  if (hours > 0) return [plural(hours, 'Stunde', 'Stunden'), minutes > 0 && plural(minutes, 'Minute', 'Minuten')].filter(Boolean).join(', ')
  return minutes > 0 ? plural(minutes, 'Minute', 'Minuten') : 'unter 1 Minute'
}

export function formatDateTime(iso) {
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? dateTime.format(ms) : DASH
}

export function formatTime(iso) {
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? `${timeOnly.format(ms)} Uhr` : DASH
}

// "gerade eben", "vor 5 Minuten", "vor 6 Stunden", "vor 2 Tagen" - ohne gültige Zeit ''.
export function relativeTime(iso, now = Date.now()) {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return ''
  const minutes = Math.floor(Math.max(0, now - ms) / 60000)
  if (minutes < 1) return 'gerade eben'
  if (minutes < 60) return `vor ${plural(minutes, 'Minute', 'Minuten')}`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `vor ${plural(hours, 'Stunde', 'Stunden')}`
  const days = Math.floor(hours / 24)
  return `vor ${days === 1 ? '1 Tag' : `${days} Tagen`}`
}

// Ein Satz über alle Ampeln: { stufe (schlechteste; null, wenn nichts erhöht ist, aber etwas nicht messbar), text }. Ein
// nicht messbarer Wert wird immer genannt - eine ausgefallene Messung darf nie wie „alles grün“ aussehen.
export function ampelSummary(status) {
  const names = (stufe) => AMPEL_METRIKEN.filter(({ key }) => (status?.[key]?.ampel ?? null) === stufe).map(({ label }) => label)
  const kritisch = names('kritisch')
  const erhoeht = names('erhoeht')
  const missing = names(null)
  if (missing.length === AMPEL_METRIKEN.length) return { stufe: null, text: 'Keine Messwerte.' }
  if (!kritisch.length && !erhoeht.length && !missing.length) return { stufe: 'ok', text: 'Alles im grünen Bereich.' }
  const parts = [
    kritisch.length && `Kritisch: ${kritisch.join(', ')}.`,
    erhoeht.length && `Erhöht: ${erhoeht.join(', ')}.`,
    missing.length && `Nicht messbar: ${missing.join(', ')}.`
  ]
  const stufe = kritisch.length ? 'kritisch' : erhoeht.length ? 'erhoeht' : null
  return { stufe, text: parts.filter(Boolean).join(' ') }
}

// Die drei Verlaufslinien: feste Skala 0-100 % für Speicher und Platte, die Last bis zur Kernzahl (oder dem Höchstwert,
// falls höher). schwelle: die Warnschwelle als Linie - beim „frei“ also 100 minus der gelben Grenze.
export function verlaufSeries(verlauf, schwellen, kerne) {
  const rows = verlauf ?? []
  const pick = (key) => rows.map((row) => (isNumber(row?.[key]) ? row[key] : null))
  const lastValues = pick('last')
  const cores = isNumber(kerne) && kerne > 0 ? kerne : 1
  const lastMax = Math.max(cores, ...lastValues.filter(isNumber))
  return [
    // Audit V7a: dieselben Wörter wie die Karten darüber (Arbeitsspeicher, Speicherplatz) statt "Speicher"/"Platte"
    { key: 'speicherFrei', label: 'Arbeitsspeicher frei', values: pick('speicherFrei'), min: 0, max: 100, schwelle: 100 - schwellen.speicher.gelb, format: formatPercent },
    { key: 'platteFrei', label: 'Speicherplatz frei', values: pick('platteFrei'), min: 0, max: 100, schwelle: 100 - schwellen.platte.gelb, format: formatPercent },
    { key: 'last', label: 'Last (1 Minute)', values: lastValues, min: 0, max: lastMax, schwelle: round(schwellen.last.gelb * cores), format: formatLoad }
  ]
}

// Punkte auf fester Skala [min, max]; ein fehlender Wert unterbricht die Linie (neues M). yOf für die Schwellenlinie.
export function seriesGeometry(values, { min, max }, size = VERLAUF_SIZE) {
  const innerWidth = size.width - 2 * size.pad
  const innerHeight = size.height - 2 * size.pad
  const span = max - min || 1
  const yOf = (value) => round(size.pad + innerHeight - ((Math.min(Math.max(value, min), max) - min) / span) * innerHeight)
  const step = values.length > 1 ? innerWidth / (values.length - 1) : 0
  const xOf = (index) => round(size.pad + (values.length > 1 ? index * step : innerWidth / 2))
  let line = ''
  let last = null
  let previous = null
  values.forEach((value, index) => {
    if (!isNumber(value)) {
      previous = null
      return
    }
    const point = { x: xOf(index), y: yOf(value) }
    line += `${line ? ' ' : ''}${previous ? 'L' : 'M'}${point.x},${point.y}`
    previous = point
    last = point
  })
  return { line, last, yOf, baselineY: size.height - size.pad }
}

// Textalternative einer Linie: zuletzt, Tiefst- und Höchstwert in Worten.
export function seriesSummary(label, values, format) {
  const valid = (values ?? []).filter(isNumber)
  if (valid.length === 0) return `${label}: noch keine Messungen.`
  const count = plural(valid.length, 'Messung', 'Messungen')
  const latest = format(valid[valid.length - 1])
  if (valid.length === 1) return `${label}: zuletzt ${latest} (${count}).`
  return `${label}: zuletzt ${latest}, niedrigster Wert ${format(Math.min(...valid))}, höchster Wert ${format(Math.max(...valid))} (${count}).`
}
