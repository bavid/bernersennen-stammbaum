'use strict'

// Tage für Demo-Erinnerungen, die zum Tag des Auffrischens passen (B+ Familienalbum: „Heute vor einem Jahr“ auf Start,
// seed/demo-household.js `relativ`). Gerechnet in Europe/Berlin - wie der Browser der Familien (client lib/dates.js
// todayIso nimmt die Uhr des Geräts), nicht in der Zeitzone des Servers. Reine Funktionen ohne Datenbank.

const ZONE = 'Europe/Berlin'
const DAY_MS = 24 * 60 * 60 * 1000

const pad = (n) => String(n).padStart(2, '0')

// Heute in Europe/Berlin als { year, month (1-12), day }.
function berlinToday(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(now)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)])
  )
  return { year: parts.year, month: parts.month, day: parts.day }
}

const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate()

// Der Tag `days` Tage nach heute (Berlin), `years` Jahre früher - JJJJ-MM-TT. Einen 29. Februar gibt es nicht in jedem
// Jahr: dann der 28. (an dem Tag zeigt „Heute vor …“ diese Erinnerung nicht - die übrigen Tage decken das ab).
function relativeDemoDate({ days = 0, years = 0 } = {}, now = new Date()) {
  const today = berlinToday(now)
  const shifted = new Date(Date.UTC(today.year, today.month - 1, today.day) + days * DAY_MS)
  const year = shifted.getUTCFullYear() - years
  const month = shifted.getUTCMonth() + 1
  const day = Math.min(shifted.getUTCDate(), daysInMonth(year, month))
  return `${year}-${pad(month)}-${pad(day)}`
}

module.exports = { berlinToday, relativeDemoDate }
