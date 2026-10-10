// Verlauf je Beitrag (V-Fehler 3, server/lib/promotionFreigabe.js VERLAUF_AKTION) - beim Partner (PartnerPostRow)
// und im Admin (AdminApprovalVerlauf) mit denselben Wörtern (FreigabeVerlauf).
import { t } from './i18n/index.js'

export const VERLAUF_LABELS = Object.freeze({
  eingereicht: 'Eingereicht',
  geaendert: 'Geändert',
  freigegeben: 'Freigegeben',
  abgelehnt: 'Abgelehnt',
  zurueckgezogen: 'Zurückgezogen'
})

// Welche Freigabe ein Eintrag hinterlässt - geaendert lässt sie, wie sie war.
const STATE_AFTER = Object.freeze({
  eingereicht: 'eingereicht',
  freigegeben: 'freigegeben',
  abgelehnt: 'abgelehnt',
  zurueckgezogen: 'zurueckgezogen'
})
const TONE_OF_STATE = Object.freeze({ freigegeben: 'ok', abgelehnt: 'danger', zurueckgezogen: 'muted' })

function labelOf(aktion, index, state) {
  if (aktion === 'eingereicht' && index > 0) return t('Erneut eingereicht')
  // Eine Änderung nach der Freigabe kann nur ein vertrauenswürdiger Partner machen - sie blieb online.
  if (aktion === 'geaendert' && state === 'freigegeben') return t('Geändert – blieb online')
  return VERLAUF_LABELS[aktion] ? t(VERLAUF_LABELS[aktion]) : aktion
}

// Einträge (älteste zuerst) mit Beschriftung und Ton (neutral, ok, danger, muted) für die Zeitleiste.
export function describeVerlauf(verlauf) {
  if (!Array.isArray(verlauf)) return []
  let state = null
  return verlauf.map((event, index) => {
    const label = labelOf(event.aktion, index, state)
    state = STATE_AFTER[event.aktion] ?? state
    return { ...event, label, tone: TONE_OF_STATE[state] || 'neutral' }
  })
}

// Der jüngste Eintrag (für die zugeklappte Zeitleiste) oder null.
export function latestVerlauf(verlauf) {
  return describeVerlauf(verlauf).at(-1) ?? null
}

// SQLite-Zeitstempel (UTC, "2026-09-26 11:22:33") als ISO für <time dateTime>.
export function verlaufDateTime(createdAt) {
  return typeof createdAt === 'string' ? `${createdAt.replace(' ', 'T')}Z` : undefined
}
