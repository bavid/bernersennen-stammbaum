// Reine Hilfen für die Karte "Benachrichtigungen (Telegram)" im Admin (AdminNotify, Phase N) - spiegeln
// server/lib/notifySettings.js (Schalter) und die Antworten von server/routes/adminNotify.js.

// Je Ereignis ein Schalter (Reihenfolge wie im Server), dazu "Details mitsenden".
export const EVENT_SWITCHES = Object.freeze([
  { key: 'gutschein_anfrage', label: 'Anfrage nach einem Einladungscode' },
  { key: 'partner_anfrage', label: 'Partner-Anfrage' },
  { key: 'registrierung', label: 'Neue Registrierung' },
  { key: 'feedback', label: 'Feedback' },
  { key: 'beitrag', label: 'Eingereichter Beitrag' },
  // Phase G Task 6: Warnungen des Reiters „Server“ (Speicher, Platte, Last).
  { key: 'server_warnung', label: 'Server-Warnungen' }
])
export const DETAILS_KEY = 'details'

export const QUELLE_LABELS = Object.freeze({ admin: 'Admin', umgebung: 'Server-Umgebung' })

// Chat-Arten aus getUpdates (Telegram: private, group, supergroup, channel).
const CHAT_TYP_LABELS = Object.freeze({ private: 'privat', group: 'Gruppe', supergroup: 'Gruppe', channel: 'Kanal' })

export function chatLabel(chat) {
  const typ = chat?.typ ? CHAT_TYP_LABELS[chat.typ] || chat.typ : null
  return typ ? `${chat.titel} (${typ})` : chat?.titel || ''
}

export const TELEGRAM_UNREACHABLE_MESSAGE = 'Telegram ist gerade nicht erreichbar.'
const GENERIC_STATUS_RE = /^(Fehler|Error) \d+$/

// Meldung eines fehlgeschlagenen Aufrufs: die (deutsche) Meldung des Servers - bei 502 ohne eigene Meldung (z. B.
// vom Proxy) der feste Satz "Telegram ist gerade nicht erreichbar."
export function notifyErrorMessage(err) {
  const message = typeof err?.message === 'string' ? err.message : ''
  if (err?.status === 502 && (!message || GENERIC_STATUS_RE.test(message))) return TELEGRAM_UNREACHABLE_MESSAGE
  return message || TELEGRAM_UNREACHABLE_MESSAGE
}

// "Telegram entfernen" nur, wenn im Admin etwas eingetragen ist - Werte aus der Server-Umgebung (quelle 'umgebung')
// lassen sich hier nicht löschen. Ohne Einrichtung (quelle null) stammen Hinweis und Chat-ID immer aus dem Admin:
// die Umgebung zählt nur mit beiden Werten (server/lib/telegramConfig.js).
export function canRemoveTelegram(settings) {
  if (!settings || settings.quelle === 'umgebung') return false
  return Boolean(settings.tokenHinweis || settings.chatId)
}
