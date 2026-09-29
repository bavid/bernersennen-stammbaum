'use strict'

// Phase N Task 2: Zugangsdaten der Telegram-Benachrichtigungen. Der Admin trägt Bot-Token und Chat-ID im Admin ein
// (routes/adminNotify.js) - gespeichert in der Tabelle settings: telegram_bot_token_cipher (AES-256-GCM, lib/codes.js
// encryptSecret, Schlüssel aus CODE_PEPPER) und telegram_chat_id (Klartext, kein Geheimnis). Rückfall: fehlt ein
// Wert im Admin, gilt der aus der Umgebung (TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID, config.js readTelegram) - je Wert,
// sofern die Umgebung überhaupt gilt (dafür braucht sie beide Werte, siehe readTelegram).
// Der Token im Klartext verlässt den Server nur Richtung api.telegram.org: nie im Log, nie in einer Antwort, nie im
// Admin-Protokoll. Nach außen gibt es höchstens die letzten 4 Zeichen (tokenHinweis).

const db = require('../db')
const config = require('../config')
const { encryptSecret, decryptSecret } = require('./codes')
const { isValidToken, isValidChatId } = require('./telegramFormat')

const TOKEN_KEY = 'telegram_bot_token_cipher'
const CHAT_ID_KEY = 'telegram_chat_id'
const HINT_LENGTH = 4
const QUELLE = Object.freeze({ admin: 'admin', umgebung: 'umgebung' })

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

const readStmt = db.prepare('SELECT key, value FROM settings WHERE key IN (?, ?)')
const upsertStmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
const deleteStmt = db.prepare('DELETE FROM settings WHERE key = ?')

// Ein nicht mehr lesbarer Geheimtext (z. B. nach einem geänderten CODE_PEPPER) zählt als "nicht gesetzt" - mit einer
// Warnung ohne Inhalt, damit der Admin weiß, dass er den Token neu eintragen muss.
function readStoredToken(cipher, logger) {
  if (!cipher) return null
  try {
    const token = decryptSecret(cipher)
    return isValidToken(token) ? token : null
  } catch {
    logger.warn('Gespeicherter Telegram-Bot-Token ist nicht lesbar – bitte im Admin neu eintragen.')
    return null
  }
}

// { token, chatId } aus dem Admin (entschlüsselt), fehlende Werte null.
function readStoredTelegram(logger = console) {
  const stored = new Map(readStmt.all(TOKEN_KEY, CHAT_ID_KEY).map((row) => [row.key, row.value]))
  const chatId = stored.get(CHAT_ID_KEY)
  return { token: readStoredToken(stored.get(TOKEN_KEY), logger), chatId: isValidChatId(chatId) ? chatId : null }
}

// Wirksame Zugangsdaten: je Wert erst der aus dem Admin, sonst der aus der (vollständigen) Umgebung. quelle: 'admin', sobald
// mindestens ein wirksamer Wert aus dem Admin kommt, sonst 'umgebung'. envTelegram nur für Tests austauschbar.
function effectiveTelegram({ envTelegram = config.telegram, logger = console } = {}) {
  const stored = readStoredTelegram(logger)
  const token = stored.token || envTelegram?.botToken || null
  const chatId = stored.chatId || envTelegram?.chatId || null
  return { token, chatId, quelle: stored.token || stored.chatId ? QUELLE.admin : QUELLE.umgebung }
}

// Zugangsdaten für den Versand - oder null, solange Token oder Chat-ID fehlen.
function telegramCredentials(options) {
  const { token, chatId } = effectiveTelegram(options)
  return token && chatId ? { botToken: token, chatId } : null
}

// Für GET /api/admin/notify-settings: nie der Token, nur seine letzten 4 Zeichen.
function telegramStatus(options) {
  const { token, chatId, quelle } = effectiveTelegram(options)
  const eingerichtet = Boolean(token && chatId)
  return {
    eingerichtet,
    quelle: eingerichtet ? quelle : null,
    tokenHinweis: token ? `…${token.slice(-HINT_LENGTH)}` : null,
    chatId
  }
}

// Eine Angabe aus PUT /api/admin/notify-settings/telegram: undefined = unverändert, null/'' = löschen, sonst getrimmt
// und im erwarteten Format.
function cleanOptionalValue(value, isValid, message) {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== 'string') throw httpError(400, message)
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!isValid(trimmed)) throw httpError(400, message)
  return trimmed
}

function validateTelegramInput(body) {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {}
  const token = cleanOptionalValue(input.token, isValidToken, 'Der Bot-Token hat nicht das erwartete Format (Zahl, Doppelpunkt, mindestens 30 Zeichen).')
  const chatId = cleanOptionalValue(input.chatId, isValidChatId, 'Die Chat-ID hat nicht das erwartete Format (Zahl oder @kanalname).')
  if (token === undefined && chatId === undefined) throw httpError(400, 'Bitte Bot-Token oder Chat-ID angeben.')
  return { token, chatId }
}

// Nur für einen einzelnen Aufruf (Chat finden): ein mitgeschickter Token muss im Format passen, sonst null.
function validateOptionalToken(value) {
  return cleanOptionalValue(value, isValidToken, 'Der Bot-Token hat nicht das erwartete Format (Zahl, Doppelpunkt, mindestens 30 Zeichen).') ?? null
}

// Speichert geprüfte Werte (validateTelegramInput; der Token ist dann schon per getMe bestätigt) in EINER
// Transaktion. Ergebnis: { gesetzt, geloescht } - ob etwas eingetragen bzw. entfernt wurde (fürs Admin-Protokoll).
function saveTelegram({ token, chatId }) {
  const changes = [
    [TOKEN_KEY, token === undefined ? undefined : token && encryptSecret(token)],
    [CHAT_ID_KEY, chatId]
  ].filter(([, value]) => value !== undefined)
  db.transaction(() => {
    for (const [key, value] of changes) {
      if (value === null) deleteStmt.run(key)
      else upsertStmt.run(key, value)
    }
  })()
  return { gesetzt: changes.some(([, value]) => value !== null), geloescht: changes.some(([, value]) => value === null) }
}

module.exports = {
  TOKEN_KEY,
  CHAT_ID_KEY,
  QUELLE,
  readStoredTelegram,
  effectiveTelegram,
  telegramCredentials,
  telegramStatus,
  validateTelegramInput,
  validateOptionalToken,
  saveTelegram
}
