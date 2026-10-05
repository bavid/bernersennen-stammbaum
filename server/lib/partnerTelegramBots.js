'use strict'

// Eigener Telegram-Bot je Partner (Tabelle partner_telegram_bots - dieses Modul legt sie selbst an, db.js ist an seiner
// Dateigrenze). Der Partner holt sich bei @BotFather einen eigenen Bot und trägt den Token im Partner-Bereich ein
// (routes/partnerArea/telegramBot.js prüft ihn vorher per getMe). Gespeichert wird er verschlüsselt (lib/codes.js
// encryptSecret, AAD je Partner - ein Geheimtext lässt sich nicht einem anderen Partner unterschieben), dazu nur die
// Bot-Id (der Teil vor dem Doppelpunkt, kein Geheimnis) und der Bot-Name für die Anzeige „eingerichtet · @name“.
// Der Token verlässt den Server nur Richtung api.telegram.org: nie in einer Antwort, nie im Log.
//
// Reihenfolge beim Versand (effectiveBotFor): der eigene Bot des Partners, sonst der Bot des Teams aus dem Admin
// (lib/telegramConfig.js), sonst nichts. Wechselt der wirksame Bot eines verbundenen Partners (eigenen Bot eintragen,
// wechseln oder entfernen), ist die Chat-Verbindung nutzlos: ein anderer Bot darf diesem Menschen erst schreiben, wenn
// er ihn gestartet hat. Darum wird die Verbindung dann beendet und als "bot-gewechselt" vermerkt - der Partner
// verbindet neu (/start über den neuen Bot).

const db = require('../db')
const { encryptSecret, decryptSecret } = require('./codes')
const { effectiveTelegram } = require('./telegramConfig')
const { isValidToken } = require('./telegramFormat')

const GETRENNT_BOT_GEWECHSELT = 'bot-gewechselt'
const QUELLE = Object.freeze({ eigener: 'eigener', plattform: 'plattform' })
const BOT_USERNAME_RE = /^[A-Za-z][A-Za-z0-9_]{3,31}$/
const TOKEN_MESSAGE = 'Der Bot-Token hat nicht das erwartete Format (Zahl, Doppelpunkt, mindestens 30 Zeichen).'

db.exec(`
  CREATE TABLE IF NOT EXISTS partner_telegram_bots (
    partner_id INTEGER PRIMARY KEY,
    token_cipher TEXT NOT NULL,
    bot_id TEXT NOT NULL,
    bot_username TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`)

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

const botAad = (partnerId) => `partner_telegram_bot:${partnerId}`

// Die Bot-Id steht vor dem Doppelpunkt des Tokens (lib/telegramFormat.js) - kein Geheimnis, aber eindeutig je Bot.
function botIdOf(token) {
  return String(token).split(':')[0]
}

const findStmt = db.prepare('SELECT * FROM partner_telegram_bots WHERE partner_id = ?')
const upsertStmt = db.prepare(
  `INSERT INTO partner_telegram_bots (partner_id, token_cipher, bot_id, bot_username, created_at) VALUES (?, ?, ?, ?, datetime('now'))
   ON CONFLICT(partner_id) DO UPDATE SET token_cipher = excluded.token_cipher, bot_id = excluded.bot_id, bot_username = excluded.bot_username,
     created_at = excluded.created_at`
)
const deleteStmt = db.prepare('DELETE FROM partner_telegram_bots WHERE partner_id = ?')
// Ein Bot-Wechsel beendet eine bestehende Chat-Verbindung (Tabelle partner_telegram, lib/partnerTelegram.js) und lässt
// offene Einmal-Codes verfallen - sie gehören zum alten Bot.
const endConnectionStmt = db.prepare(
  "UPDATE partner_telegram SET chat_cipher = NULL, chat_hash = NULL, getrennt_grund = ?, updated_at = datetime('now') WHERE partner_id = ? AND chat_cipher IS NOT NULL"
)
const deleteCodesStmt = db.prepare('DELETE FROM partner_telegram_codes WHERE partner_id = ?')

// Der eigene Bot eines Partners - { token, botId, username } oder null (keiner eingetragen, oder der Geheimtext ist nicht
// mehr lesbar, z. B. nach einem geänderten CODE_PEPPER: dann zählt er als nicht eingerichtet, der Partner trägt ihn neu
// ein). Ohne Rückfall auf Werte ohne AAD - eigene Bots gab es nie ohne.
function readOwnBot(partnerId) {
  const row = findStmt.get(partnerId)
  if (!row) return null
  try {
    const token = decryptSecret(row.token_cipher, botAad(partnerId), { allowLegacy: false })
    if (!isValidToken(token) || botIdOf(token) !== row.bot_id) return null
    return { token, botId: row.bot_id, username: row.bot_username }
  } catch {
    return null
  }
}

function hasOwnBot(partnerId) {
  return readOwnBot(partnerId) !== null
}

// Der Bot des Teams aus dem Admin (lib/telegramConfig.js) - { token, botId, username: null } oder null.
function platformBot({ logger = console } = {}) {
  const token = effectiveTelegram({ logger }).token
  return token ? { token, botId: botIdOf(token), username: null } : null
}

// Reihenfolge: eigener Bot, sonst Team-Bot, sonst null. quelle sagt, welcher es ist.
function effectiveBotFor(partnerId, options) {
  const own = readOwnBot(partnerId)
  if (own) return { ...own, quelle: QUELLE.eigener }
  const platform = platformBot(options)
  return platform ? { ...platform, quelle: QUELLE.plattform } : null
}

function effectiveBotIdFor(partnerId) {
  return effectiveBotFor(partnerId)?.botId ?? null
}

// Gehört dieser Token dem Team-Bot? (lib/telegramUpdates.js: der Team-Bot behält seinen bisherigen offset-Schlüssel.)
function isPlatformBot(token) {
  const platform = platformBot()
  return Boolean(platform) && platform.botId === botIdOf(token)
}

// PUT /api/partner-area/telegram/bot: genau { token } im erwarteten Format - sonst 400. Die Prüfung bei Telegram
// (getMe) macht die Route, bevor gespeichert wird.
function validateOwnBotInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw httpError(400, 'Bitte den Bot-Token als { token } schicken.')
  const unknown = Object.keys(body).find((key) => key !== 'token')
  if (unknown !== undefined) throw httpError(400, `Dieses Feld gibt es hier nicht: ${unknown.slice(0, 40)}`)
  if (typeof body.token !== 'string') throw httpError(400, TOKEN_MESSAGE)
  const token = body.token.trim()
  if (!isValidToken(token)) throw httpError(400, TOKEN_MESSAGE)
  return token
}

// Der Bot-Name aus getMe - nur im Format von Telegram, sonst null (die Route antwortet dann 502).
function cleanBotUsername(value) {
  return typeof value === 'string' && BOT_USERNAME_RE.test(value) ? value : null
}

// Ändert sich der wirksame Bot eines Partners, endet seine Chat-Verbindung ("bot-gewechselt"). Gibt true zurück, wenn
// eine Verbindung beendet wurde.
function endConnectionIfBotChanged(partnerId, botIdBefore) {
  if (effectiveBotIdFor(partnerId) === botIdBefore) return false
  deleteCodesStmt.run(partnerId)
  return endConnectionStmt.run(GETRENNT_BOT_GEWECHSELT, partnerId).changes > 0
}

// Speichert einen geprüften Token (Format und getMe) samt Bot-Name - in EINER Transaktion mit dem Ende einer
// Verbindung, falls der Bot wechselt. Ergebnis: { verbindungBeendet }.
const saveOwnBot = db.transaction((partnerId, { token, username }) => {
  const before = effectiveBotIdFor(partnerId)
  upsertStmt.run(partnerId, encryptSecret(token, botAad(partnerId)), botIdOf(token), username)
  return { verbindungBeendet: endConnectionIfBotChanged(partnerId, before) }
})

// Entfernt den eigenen Bot - danach gilt wieder der Team-Bot (oder nichts). Ergebnis wie saveOwnBot.
const removeOwnBot = db.transaction((partnerId) => {
  const before = effectiveBotIdFor(partnerId)
  deleteStmt.run(partnerId)
  return { verbindungBeendet: endConnectionIfBotChanged(partnerId, before) }
})

// Für den Admin (routes/admin.js, Partnerliste): 1, wenn der Partner einen eigenen Bot eingetragen hat - nie der Token.
function ownBotSql(alias) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias)) throw new Error('Ungültiger Tabellen-Alias für den eigenen Bot')
  return `(SELECT COUNT(*) FROM partner_telegram_bots b WHERE b.partner_id = ${alias}.id) AS telegram_eigener_bot`
}

module.exports = {
  GETRENNT_BOT_GEWECHSELT,
  QUELLE,
  botIdOf,
  readOwnBot,
  hasOwnBot,
  effectiveBotFor,
  effectiveBotIdFor,
  isPlatformBot,
  validateOwnBotInput,
  cleanBotUsername,
  saveOwnBot,
  removeOwnBot,
  ownBotSql
}
