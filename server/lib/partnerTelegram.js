'use strict'

// Phase V4b: Telegram-Hinweise für Partner - die Verbindung eines Partners mit seinem Telegram-Chat (Tabellen
// partner_telegram und partner_telegram_codes, db.js). Ablauf: der Partner holt sich einen Einmal-Code (createLinkCode,
// >= 128 bit Zufall, 15 Minuten gültig, gespeichert nur als HMAC), öffnet https://t.me/<bot>?start=<code> und tippt in
// Telegram auf "Starten". Die Nachricht "/start <code>" liest der gemeinsame Update-Leser (lib/telegramUpdates.js) und
// reicht sie an consumeLinkUpdate weiter: passt der Code, wird die Chat-ID VERSCHLÜSSELT gespeichert (lib/codes.js
// encryptSecret, AAD je Partner - ein Geheimtext passt nie zu einem anderen Partner), der Code ist verbraucht.
// Die Chat-ID verlässt den Server nur Richtung api.telegram.org - nie in einer Antwort, nie im Log.

const crypto = require('node:crypto')
const db = require('../db')
const { encryptSecret, decryptSecret, hashCode } = require('./codes')
const { NUMERIC_CHAT_ID_RE } = require('./telegram')
const { detailValue } = require('./notify')

const CODE_BYTES = 16
const CODE_VALID_MINUTES = 15
const CODE_RE = /^[A-Za-z0-9_-]{16,64}$/
// "/start <code>" (auch "/start@botname <code>"), genau ein Wort danach - Telegram schickt den Parameter des Links so.
const START_RE = /^\/start(?:@[A-Za-z0-9_]{1,64})?\s+(\S{1,64})\s*$/
const GETRENNT = Object.freeze({ blockiert: 'blockiert' })
const HINWEIS_COLUMNS = Object.freeze({ nachricht: 'hinweis_nachricht', freigabe: 'hinweis_freigabe' })
const HINWEIS_NAMES = Object.keys(HINWEIS_COLUMNS)
const APP_NAME = 'Familie auf Pfoten'
const EXPIRED_REPLY = 'Dieser Link ist abgelaufen oder wurde schon benutzt – bitte im Partner-Bereich einen neuen erzeugen.'

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

const chatAad = (partnerId) => `partner_telegram_chat:${partnerId}`
// Eigene Domäne im HMAC - ein Link-Code ist nie zugleich ein gültiger Gutschein-Hash (lib/codes.js hashCode).
const codeHashOf = (code) => hashCode(`telegram-link:${code}`)

// --- Abfragen ------------------------------------------------------------------------------------

const findRowStmt = db.prepare('SELECT * FROM partner_telegram WHERE partner_id = ?')
const findPartnerStmt = db.prepare('SELECT id, name, is_demo FROM partners WHERE id = ?')
const deleteCodesOfStmt = db.prepare('DELETE FROM partner_telegram_codes WHERE partner_id = ?')
const purgeCodesStmt = db.prepare("DELETE FROM partner_telegram_codes WHERE expires_at < datetime('now', '-1 day')")
const insertCodeStmt = db.prepare(
  `INSERT INTO partner_telegram_codes (partner_id, code_hash, expires_at) VALUES (?, ?, datetime('now', '+${CODE_VALID_MINUTES} minutes'))`
)
const openCodeStmt = db.prepare(
  "SELECT 1 FROM partner_telegram_codes WHERE partner_id = ? AND used_at IS NULL AND expires_at > datetime('now') LIMIT 1"
)
const findCodeStmt = db.prepare("SELECT * FROM partner_telegram_codes WHERE code_hash = ? AND used_at IS NULL AND expires_at > datetime('now')")
const markUsedStmt = db.prepare("UPDATE partner_telegram_codes SET used_at = datetime('now') WHERE id = ? AND used_at IS NULL")
const upsertConnectionStmt = db.prepare(
  `INSERT INTO partner_telegram (partner_id, chat_cipher, hinweis_nachricht, hinweis_freigabe, verbunden_at, getrennt_grund, updated_at)
   VALUES (@partnerId, @cipher, 1, 1, datetime('now'), NULL, datetime('now'))
   ON CONFLICT(partner_id) DO UPDATE SET chat_cipher = excluded.chat_cipher, hinweis_nachricht = 1, hinweis_freigabe = 1,
     verbunden_at = excluded.verbunden_at, getrennt_grund = NULL, updated_at = excluded.updated_at`
)
const deleteConnectionStmt = db.prepare('DELETE FROM partner_telegram WHERE partner_id = ?')
const markBlockedStmt = db.prepare(
  "UPDATE partner_telegram SET chat_cipher = NULL, getrennt_grund = ?, updated_at = datetime('now') WHERE partner_id = ? AND chat_cipher IS NOT NULL"
)

// --- Status --------------------------------------------------------------------------------------

function isConnected(row) {
  return Boolean(row?.chat_cipher)
}

// Für den Partner-Bereich: nie die Chat-ID, nur ob verbunden, warum getrennt und die Schalter.
// eingerichtet: hat der Admin einen Bot-Token hinterlegt (lib/telegramConfig.js)?
function connectionStatus(partnerId, { eingerichtet }) {
  const row = findRowStmt.get(partnerId)
  const verbunden = isConnected(row)
  return {
    eingerichtet: Boolean(eingerichtet),
    verbunden,
    getrennt: !verbunden && row?.getrennt_grund === GETRENNT.blockiert ? GETRENNT.blockiert : null,
    hinweise: { nachricht: verbunden && Boolean(row.hinweis_nachricht), freigabe: verbunden && Boolean(row.hinweis_freigabe) }
  }
}

// Chat-ID für den Versand - oder null, wenn nicht verbunden oder (hinweis angegeben) dieser Schalter aus ist. Ein nicht
// mehr lesbarer Geheimtext (z. B. nach geändertem CODE_PEPPER) zählt als nicht verbunden.
function chatIdFor(partnerId, { hinweis } = {}) {
  const row = findRowStmt.get(partnerId)
  if (!isConnected(row)) return null
  if (hinweis && !row[HINWEIS_COLUMNS[hinweis]]) return null
  try {
    const chatId = decryptSecret(row.chat_cipher, chatAad(partnerId))
    return NUMERIC_CHAT_ID_RE.test(chatId) ? chatId : null
  } catch {
    return null
  }
}

function hasOpenLinkCode(partnerId) {
  return Boolean(openCodeStmt.get(partnerId))
}

// --- Verbinden -----------------------------------------------------------------------------------

// Ein neuer Einmal-Code - ältere Codes dieses Partners verfallen damit. Gibt den Code im Klartext zurück (nur für den
// Link in der Antwort), gespeichert wird nur der HMAC.
const createLinkCode = db.transaction((partnerId) => {
  const code = crypto.randomBytes(CODE_BYTES).toString('base64url')
  purgeCodesStmt.run()
  deleteCodesOfStmt.run(partnerId)
  insertCodeStmt.run(partnerId, codeHashOf(code))
  return code
})

const connectWithCode = db.transaction((code, chatId) => {
  const row = findCodeStmt.get(codeHashOf(code))
  if (!row || !markUsedStmt.run(row.id).changes) return null
  const partner = findPartnerStmt.get(row.partner_id)
  if (!partner || partner.is_demo) return null
  upsertConnectionStmt.run({ partnerId: partner.id, cipher: encryptSecret(chatId, chatAad(partner.id)) })
  deleteCodesOfStmt.run(partner.id)
  return partner
})

function connectedReply(partner) {
  return `Verbunden: ${APP_NAME} schickt dir hier Hinweise für ${detailValue(partner.name)}.`
}

// Für lib/telegramUpdates.js: ist dieses Update ein "/start <code>" aus einem privaten Chat? Dann gehört es den
// Partner-Verbindungen (nie in die Chat-Liste des Admins) - consumed: true, und reply ist die Antwort an genau diesen Chat:
// "Verbunden …" oder der Hinweis auf einen abgelaufenen/benutzten Link. Alles andere: consumed: false.
function consumeLinkUpdate(update) {
  const message = update?.message
  if (!message || typeof message.text !== 'string' || message.chat?.type !== 'private') return { consumed: false }
  const match = START_RE.exec(message.text)
  if (!match) return { consumed: false }
  const chatId = String(message.chat.id)
  if (!NUMERIC_CHAT_ID_RE.test(chatId)) return { consumed: true }
  const partner = CODE_RE.test(match[1]) ? connectWithCode(match[1], chatId) : null
  return { consumed: true, reply: { chatId, text: partner ? connectedReply(partner) : EXPIRED_REPLY } }
}

// --- Einstellungen und Trennen -------------------------------------------------------------------

// { nachricht?, freigabe? } - nur echte Booleans, nur solange verbunden (sonst 409).
function updateHinweise(partnerId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw httpError(400, 'Bitte die Schalter als Objekt senden.')
  const unknown = Object.keys(body).find((name) => !HINWEIS_NAMES.includes(name))
  if (unknown !== undefined) throw httpError(400, `Unbekannte Einstellung: ${unknown}`)
  const notBoolean = Object.keys(body).find((name) => typeof body[name] !== 'boolean')
  if (notBoolean !== undefined) throw httpError(400, `„${notBoolean}“ muss true oder false sein`)
  if (!isConnected(findRowStmt.get(partnerId))) throw httpError(409, 'Telegram ist nicht verbunden.')
  const names = Object.keys(body)
  if (names.length) {
    db.prepare(`UPDATE partner_telegram SET ${names.map((name) => `${HINWEIS_COLUMNS[name]} = ?`).join(', ')}, updated_at = datetime('now') WHERE partner_id = ?`).run(
      ...names.map((name) => (body[name] ? 1 : 0)),
      partnerId
    )
  }
}

// Trennen: Chat-ID und offene Codes weg.
const disconnect = db.transaction((partnerId) => {
  deleteConnectionStmt.run(partnerId)
  deleteCodesOfStmt.run(partnerId)
})

// Telegram meldet 403 (Bot blockiert): die Chat-ID ist nutzlos - löschen, den Grund für die Anzeige merken.
function markBlocked(partnerId) {
  markBlockedStmt.run(GETRENNT.blockiert, partnerId)
}

module.exports = {
  CODE_VALID_MINUTES,
  GETRENNT,
  HINWEIS_NAMES,
  EXPIRED_REPLY,
  connectionStatus,
  chatIdFor,
  hasOpenLinkCode,
  createLinkCode,
  consumeLinkUpdate,
  updateHinweise,
  disconnect,
  markBlocked
}
