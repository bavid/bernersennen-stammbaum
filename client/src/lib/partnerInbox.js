// Reine Hilfen für das Postfach der Partner (/nachrichten, PartnerInboxPage) - über die Antwort von
// GET /api/partner-area/messages (server/lib/partnerMessages.js ownMessage, camelCase).

export const RETENTION_HINT = 'Nachrichten werden nach 180 Tagen automatisch gelöscht.'
export const EMPTY_HINT = 'Noch keine Nachrichten. Sobald jemand über ‚Schreib uns‘ schreibt, landet es hier.'
export const NO_NAME = 'Ohne Namen'

const EXCERPT_LENGTH = 90

export function senderName(message) {
  const name = typeof message?.name === 'string' ? message.name.trim() : ''
  return name || NO_NAME
}

// Erste Zeile(n) der Nachricht für die zugeklappte Liste - Zeilenumbrüche werden zu Leerzeichen.
export function excerpt(text) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim()
  return flat.length > EXCERPT_LENGTH ? `${flat.slice(0, EXCERPT_LENGTH - 1).trimEnd()}…` : flat
}

// SQLite-Zeitstempel ("2026-09-20 10:15:00", UTC) -> Date, ungültig -> null.
function parseSqliteUtc(timestamp) {
  if (typeof timestamp !== 'string') return null
  const date = new Date(`${timestamp.trim().replace(' ', 'T')}Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

const DATE_FORMAT = new Intl.DateTimeFormat('de-DE', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
})

// "20. September 2026 um 12:15" (Ortszeit) - für <time dateTime> dazu isoDateTime.
export function formatMessageDate(timestamp) {
  const date = parseSqliteUtc(timestamp)
  return date ? DATE_FORMAT.format(date) : ''
}

export function isoDateTime(timestamp) {
  return parseSqliteUtc(timestamp)?.toISOString()
}
