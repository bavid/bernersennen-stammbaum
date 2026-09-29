'use strict'

// Phase N Task 2: erwartetes Format von Bot-Token und Chat-ID (Telegram). Ohne Abhängigkeiten, damit config.js
// (Rückfall über TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID) und lib/telegram*.js dieselbe Regel nutzen. Das Format ist
// zugleich ein Schutz: der Token steht im Pfad der Anfrage-URL (…/bot<TOKEN>/<Methode>) - ohne "/", "?", "#" oder
// "." lässt sich darüber kein anderer Pfad ansprechen.

const TOKEN_RE = /^\d{1,20}:[A-Za-z0-9_-]{30,100}$/
// Numerische Chat-ID (privat positiv, Gruppen negativ) oder ein öffentlicher Kanal-/Gruppenname (@name).
const CHAT_ID_RE = /^(-?\d{1,20}|@[A-Za-z][A-Za-z0-9_]{4,31})$/

function isValidToken(value) {
  return typeof value === 'string' && TOKEN_RE.test(value)
}

function isValidChatId(value) {
  return typeof value === 'string' && CHAT_ID_RE.test(value)
}

module.exports = { TOKEN_RE, CHAT_ID_RE, isValidToken, isValidChatId }
