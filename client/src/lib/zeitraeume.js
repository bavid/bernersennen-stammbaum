// Termine einer Anzeige (Phase V4a, server/lib/promotionZeitraeume.js): bis zu zwölf Tage oder Zeiträume [{ von, bis }]
// (bis null = ein Tag). Anzeige als "Termine: 1.2., 1.3., 5.–10.5." - nur, was heute oder später noch läuft; das Jahr
// steht nur dabei, wenn es nicht das laufende ist.
import { isIsoDate } from './termine.js'
import { t } from './i18n/index.js'

export const MAX_ZEITRAEUME = 12

function dayMonth(iso) {
  const [, month, day] = iso.split('-').map(Number)
  return `${day}.${month}.`
}

function short(iso, currentYear) {
  const year = Number(iso.slice(0, 4))
  return `${dayMonth(iso)}${year === currentYear ? '' : year}`
}

// Ein Tag "1.2.", ein Zeitraum im selben Monat "5.–10.5.", sonst "28.2.–3.3." - ein nötiges Jahr steht im selben Jahr
// nur einmal am Ende ("31.1.–4.2.2027"), über den Jahreswechsel an beiden Seiten, wo es nicht das laufende ist.
function formatOne({ von, bis }, currentYear) {
  if (!bis || bis === von) return short(von, currentYear)
  const end = short(bis, currentYear)
  if (von.slice(0, 7) === bis.slice(0, 7)) return `${Number(von.slice(8, 10))}.–${end}`
  if (von.slice(0, 4) === bis.slice(0, 4)) return `${dayMonth(von)}–${end}`
  return `${short(von, currentYear)}–${end}`
}

function validList(list) {
  return Array.isArray(list) ? list.filter((entry) => entry && isIsoDate(entry.von) && (!entry.bis || isIsoDate(entry.bis))) : []
}

// "1.11., 5.–10.12., 28.12.–3.1.2027" - includePast: auch vergangene (Admin, eigene Liste).
export function formatZeitraeume(list, today, { includePast = false } = {}) {
  const currentYear = Number(today.slice(0, 4))
  return validList(list)
    .filter((entry) => includePast || (entry.bis || entry.von) >= today)
    .map((entry) => formatOne(entry, currentYear))
    .join(', ')
}

// Die Zeile auf einer Anzeige: "Termin: 20.10." bzw. "Termine: …", leer ohne kommende Termine.
export function zeitraeumeText(list, today) {
  const upcoming = validList(list).filter((entry) => (entry.bis || entry.von) >= today)
  if (!upcoming.length) return ''
  const text = formatZeitraeume(upcoming, today)
  return upcoming.length === 1 ? t('Termin: {list}', { list: text }) : t('Termine: {list}', { list: text })
}

// --- Formular (PostZeitraeumeField) ---------------------------------------------------------------

export function zeitraeumeFormRows(post) {
  return validList(post?.zeitraeume).map(({ von, bis }) => ({ von, bis: bis || '' }))
}

export function toZeitraeumePayload(rows) {
  return rows.filter((row) => row.von || row.bis).map((row) => ({ von: row.von, bis: row.bis || null }))
}

// Welche Formularzeile eine Meldung "Termin n: …" (englisch "Date n: …") meint (n zählt nur ausgefüllte Zeilen, wie beim Senden) - sonst -1.
export function zeitraeumeErrorRow(rows, message) {
  const match = typeof message === 'string' ? /^(?:Termin|Date) (\d+):/.exec(message) : null
  if (!match) return -1
  let filled = 0
  return rows.findIndex((row) => (row.von || row.bis ? (filled += 1) === Number(match[1]) : false))
}

// Wie der Server (validateZeitraeume) - die erste passende Meldung, sonst null.
export function zeitraeumeClientError(rows) {
  const filled = rows.filter((row) => row.von || row.bis)
  if (filled.length > MAX_ZEITRAEUME) return t('Höchstens {n} Termine je Beitrag', { n: MAX_ZEITRAEUME })
  for (const [index, row] of filled.entries()) {
    const n = index + 1
    if (!isIsoDate(row.von) || (row.bis && !isIsoDate(row.bis))) return t('Termin {n}: bitte ein gültiges Datum angeben (JJJJ-MM-TT)', { n })
    if (row.bis && row.bis < row.von) return t('Termin {n}: das Ende darf nicht vor dem Beginn liegen', { n })
  }
  return null
}
