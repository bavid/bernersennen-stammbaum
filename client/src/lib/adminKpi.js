// Reine Hilfen für die Karte „Erfolg messen“ (AdminKpi) - spiegeln GET /api/admin/stats/kpi (server/lib/adminKpi.js).
// Kein DOM, damit Prozent-Text und Ziel-Stand einzeln prüfbar sind.

export const ZEITRAEUME = [
  { key: '30', label: '30 Tage' },
  { key: '90', label: '90 Tage' },
  { key: 'alle', label: 'Alle' }
]

export const DEFAULT_ZEITRAUM = '30'

const PERCENT_FORMAT = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 })

// "66,7 %" oder "–", wenn es (noch) keine Kohorte gibt (quote null).
export function formatQuote(quote) {
  return Number.isFinite(quote) ? `${PERCENT_FORMAT.format(quote)} %` : '–'
}

// Stand gegen den Zielwert aus dem Plan: 'ok' (erreicht), 'wartet' (darunter), 'leer' (noch keine Zahl).
export function zielStand(quote, ziel) {
  if (!Number.isFinite(quote) || !Number.isFinite(ziel)) return 'leer'
  return quote >= ziel ? 'ok' : 'wartet'
}

// Summe der Einlösungen im Zeitraum über alle Kanäle.
export function eingeloestImZeitraum(kanaele) {
  return (kanaele ?? []).reduce((total, row) => total + (Number(row?.eingeloest) || 0), 0)
}
