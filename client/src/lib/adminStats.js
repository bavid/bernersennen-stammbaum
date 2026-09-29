// Reine Hilfen für die Karte „Übersicht“ im Admin (Phase 5 Task 3: AdminStats und ihre Teile) - spiegeln die
// Antwort von GET /api/admin/stats (server/lib/adminStats.js). Kein DOM, damit Summen, Balkenanteile und die
// Sparkline-Geometrie einzeln prüfbar sind. Zahlen immer de-DE ("1.234").

const NUMBER_FORMAT = new Intl.NumberFormat('de-DE')

export const KLICK_TAGE_KURZ = 7
export const PARTNER_RANKING_LIMIT = 5

// Zeichenfläche der Sparkline (viewBox): pad hält Platz für den Endpunkt samt 2px-Ring.
export const SPARKLINE = { width: 600, height: 64, pad: 6 }

export const SEGMENTE = [
  { key: 'eingeloest', label: 'Eingelöst' },
  { key: 'offen', label: 'Offen' },
  { key: 'widerrufen', label: 'Zurückgezogen' }
]

const toNumber = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0)
const round = (value) => Math.round(value * 100) / 100

export function formatNumber(value) {
  return NUMBER_FORMAT.format(toNumber(value))
}

// "1 Kette" / "3 Ketten"
export function plural(count, singular, pluralForm) {
  const n = toNumber(count)
  return `${formatNumber(n)} ${n === 1 ? singular : pluralForm}`
}

export function sum(rows, key) {
  return (rows ?? []).reduce((total, row) => total + toNumber(row?.[key]), 0)
}

// Kennzahl: eingelöste Gutscheine über alle Zwecke.
export function eingeloesteGesamt(zweck) {
  return sum(zweck, 'eingeloest')
}

// Kennzahl: Klicks der letzten n Tage - die Tagesreihe kommt aufsteigend, heute zuletzt.
export function klicksLetzteTage(tage, n = KLICK_TAGE_KURZ) {
  return sum((tage ?? []).slice(-n), 'anzahl')
}

// Segmente des gestapelten Balkens eines Stapels: Anteil in Prozent (eine Nachkommastelle). Leere Segmente
// fallen weg, sonst zählten die Lücken zwischen ihnen mit; ohne Gutscheine gibt es keine Segmente.
export function stackedSegments(row) {
  const values = SEGMENTE.map((segment) => ({ ...segment, value: toNumber(row?.[segment.key]) }))
  const total = values.reduce((acc, segment) => acc + segment.value, 0)
  if (total <= 0) return []
  return values
    .filter((segment) => segment.value > 0)
    .map((segment) => ({ ...segment, percent: Math.round((segment.value / total) * 1000) / 10 }))
}

// Balkenlänge relativ zum größten Wert (0-100).
export function barPercent(value, max) {
  const v = toNumber(value)
  const m = toNumber(max)
  if (v <= 0 || m <= 0) return 0
  return Math.min(100, Math.round((v / m) * 1000) / 10)
}

// Partner-Ranking: nur Partner mit neuen Bereichen, absteigend (der Server sortiert schon - hier zur
// Sicherheit noch einmal), höchstens limit.
export function topPartner(partner, limit = PARTNER_RANKING_LIMIT) {
  return (partner ?? [])
    .filter((row) => toNumber(row.neueBereiche) > 0)
    .sort((a, b) => toNumber(b.neueBereiche) - toNumber(a.neueBereiche) || String(a.name).localeCompare(String(b.name), 'de'))
    .slice(0, limit)
}

// „3 Ketten, tiefste 2 Stufen“
export function mundpropagandaText({ ketten = 0, maxTiefe = 0 } = {}) {
  if (toNumber(ketten) <= 0) return 'Noch keine Weitergaben'
  return `${plural(ketten, 'Kette', 'Ketten')}, tiefste ${plural(maxTiefe, 'Stufe', 'Stufen')}`
}

// "29.09." aus "2026-09-29"
export function formatTagKurz(tag) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(typeof tag === 'string' ? tag : '')
  return match ? `${match[3]}.${match[2]}.` : ''
}

// Punkte der Sparkline: x gleichmäßig über die Breite, y am Höchstwert skaliert, Grundlinie unten. Ohne
// Klicks (Höchstwert 0) liegt die Linie auf der Grundlinie; ein einzelner Tag sitzt mittig.
export function sparklinePoints(tage, size = SPARKLINE) {
  const values = (tage ?? []).map((row) => toNumber(row?.anzahl))
  if (values.length === 0) return []
  const max = Math.max(0, ...values)
  const innerWidth = size.width - 2 * size.pad
  const innerHeight = size.height - 2 * size.pad
  const step = values.length > 1 ? innerWidth / (values.length - 1) : 0
  return values.map((value, index) => ({
    x: round(size.pad + (values.length > 1 ? index * step : innerWidth / 2)),
    y: round(size.pad + innerHeight - (max > 0 ? (value / max) * innerHeight : 0))
  }))
}

export function sparklinePath(points) {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' ')
}

// Linie, Fläche bis zur Grundlinie (für die zarte Tönung) und der letzte Punkt (Endmarke).
export function sparklineGeometry(tage, size = SPARKLINE) {
  const points = sparklinePoints(tage, size)
  const baselineY = size.height - size.pad
  const line = sparklinePath(points)
  const first = points[0]
  const last = points[points.length - 1] ?? null
  const area = points.length ? `${line} L${last.x},${baselineY} L${first.x},${baselineY} Z` : ''
  return { points, line, area, baselineY, last }
}

// Textalternative (aria-label) der Sparkline: Summen und Höchstwert mit Datum.
export function sparklineSummary(tage) {
  const rows = tage ?? []
  if (rows.length === 0) return 'Klicks: noch keine Daten'
  const gesamt = sum(rows, 'anzahl')
  const kurz = klicksLetzteTage(rows)
  const peak = rows.reduce((best, row) => (toNumber(row.anzahl) > toNumber(best.anzahl) ? row : best), rows[0])
  const base = `Klicks der letzten ${rows.length} Tage: ${formatNumber(gesamt)} insgesamt, ${formatNumber(kurz)} in den letzten ${KLICK_TAGE_KURZ} Tagen`
  if (gesamt <= 0) return `${base}.`
  // Das Datum endet selbst mit einem Punkt ("10.09.") - kein zweiter dahinter.
  return `${base}, Höchstwert ${formatNumber(peak.anzahl)} am ${formatTagKurz(peak.tag)}`
}
