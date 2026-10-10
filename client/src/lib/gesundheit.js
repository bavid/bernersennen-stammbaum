import { formatDateLong, formatDayMonth } from './dates.js'
import { t } from './i18n/index.js'

// „Gesundheit leicht“ (server/lib/gesundheit.js): Impfung, Wurmkur & Floh, Tierarzt oder Sonstiges als Art einer
// Erinnerung, mit optionalem „Nächstes Mal am“. Bewusst keine Krankenakte - nur die Art, das Datum und der freie Text.

export const GESUNDHEIT_ARTEN = Object.freeze([
  { value: 'impfung', label: 'Impfung' },
  { value: 'wurmkur_floh', label: 'Wurmkur & Floh' },
  { value: 'tierarzt', label: 'Tierarzt' },
  { value: 'sonstiges', label: 'Sonstiges' }
])
const ARTEN = GESUNDHEIT_ARTEN.map((art) => art.value)
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 86_400_000

export const GESUNDHEIT = Object.freeze({
  titel: 'Gesundheit',
  wahl: 'Gesundheit (Impfung, Wurmkur, Tierarzt)',
  art: 'Was war es?',
  naechstes: 'Nächstes Mal am',
  naechstesHinweis: 'Wir erinnern euch rechtzeitig auf der Startseite unter „Bald“.',
  privatHinweis: 'Gesundheit bleibt erst einmal bei euch (privat) – teilen könnt ihr es trotzdem.',
  leer: 'Impfung, Wurmkur oder Tierarzt einfach als Erinnerung festhalten – mit „Nächstes Mal am“ erinnern wir euch.',
  zuletzt: 'zuletzt am {date}',
  naechstesMal: 'nächstes Mal am {date}',
  fehler: 'Gesundheit lässt sich gerade nicht laden.'
})

export function artLabel(art) {
  const found = GESUNDHEIT_ARTEN.find((item) => item.value === art)
  return found ? t(found.label) : ''
}

// Formular-Werte aus einer bestehenden Erinnerung (entry.gesundheit vom Server) - ohne Angabe ausgeschaltet.
export function initialGesundheit(entry) {
  const value = entry?.gesundheit
  if (!value || !ARTEN.includes(value.art)) return { aktiv: false, art: 'impfung', naechstesAm: '' }
  return { aktiv: true, art: value.art, naechstesAm: value.naechstesAm || '' }
}

// Teil des Bodys für POST/PUT /api/timeline: neue Erinnerung ohne Gesundheit -> nichts; eine bestehende, die keine (mehr)
// ist -> null (entfernt die Angabe auf dem Server).
export function gesundheitPayload(state, hadGesundheit = false) {
  if (state?.aktiv) {
    return { gesundheit: { art: state.art, naechstesAm: ISO_DATE.test(state.naechstesAm) ? state.naechstesAm : null } }
  }
  return hadGesundheit ? { gesundheit: null } : {}
}

function daysUntil(iso, heute) {
  if (!ISO_DATE.test(iso || '') || !ISO_DATE.test(heute || '')) return null
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${heute}T00:00:00Z`)) / DAY_MS)
}

// „Bald“ auf Start: „Heute: Impfung bei Nele“, „Morgen: …“, „In 5 Tagen (20. Oktober): …“.
export function baldText(item, heute) {
  const was = t('{art} bei {name}', { art: artLabel(item.art), name: item.dogName })
  const tage = daysUntil(item.naechstesAm, heute)
  if (tage === 0) return t('Heute: {was}', { was })
  if (tage === 1) return t('Morgen: {was}', { was })
  return t('Am {date}: {was}', { date: formatDayMonth(item.naechstesAm), was })
}

// Eine Zeile im Reiter „Infos“: „zuletzt am 5. September 2026 · nächstes Mal am 20. Oktober 2026“.
export function infoZeile(item) {
  const zuletzt = t(GESUNDHEIT.zuletzt, { date: formatDateLong(item.datum) })
  return item.naechstesAm ? `${zuletzt} · ${t(GESUNDHEIT.naechstesMal, { date: formatDateLong(item.naechstesAm) })}` : zuletzt
}
