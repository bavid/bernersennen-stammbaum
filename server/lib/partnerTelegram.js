'use strict'

// Phase V4b: Telegram-Hinweise für Partner - die Verbindung eines Partners mit seinem Telegram-Chat (Tabellen
// partner_telegram und partner_telegram_codes, db.js). Ablauf: der Partner holt sich einen Einmal-Code (createLinkCode,
// 128 bit Zufall, 15 Minuten gültig, gespeichert nur als HMAC), öffnet https://t.me/<bot>?start=<code> und tippt in
// Telegram auf "Starten". Der gemeinsame Update-Leser (lib/telegramUpdates.js) reicht "/start <code>" an consumeUpdate
// weiter - der Bot fragt dann zurück ("Hinweise für … aktivieren?" mit Ja/Nein-Knöpfen). Erst "Ja" verbindet
// (security-review V4b: niemand bekommt Hinweise, der nicht selbst zugestimmt hat): die Chat-ID wird VERSCHLÜSSELT
// gespeichert (lib/codes.js encryptSecret, AAD je Partner), dazu ihr HMAC für "/stop", der Code ist verbraucht.
// "/stop" trennt jeden Partner, der mit diesem Chat verbunden ist. Die Chat-ID verlässt den Server nur Richtung
// api.telegram.org - nie in einer Antwort, nie im Log.

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
const STOP_RE = /^\/stop(?:@[A-Za-z0-9_]{1,64})?\s*$/
// Antwort auf die Knöpfe der Rückfrage: "ja:<code>" bzw. "nein:<code>" (callback_data, höchstens 64 Byte).
const CALLBACK_RE = /^(ja|nein):([A-Za-z0-9_-]{16,64})$/
const GETRENNT = Object.freeze({ blockiert: 'blockiert' })
const HINWEIS_COLUMNS = Object.freeze({ nachricht: 'hinweis_nachricht', freigabe: 'hinweis_freigabe' })
const HINWEIS_NAMES = Object.keys(HINWEIS_COLUMNS)
const APP_NAME = 'Familie auf Pfoten'
const EXPIRED_REPLY = 'Dieser Link ist abgelaufen oder wurde schon benutzt – bitte im Partner-Bereich einen neuen erzeugen.'
const DECLINED_REPLY = 'Alles klar – es wurde nichts verbunden.'
const STOPPED_REPLY = 'Erledigt – hier kommen keine Hinweise mehr. Wieder verbinden geht jederzeit im Partner-Bereich.'
const YES_LABEL = 'Ja, Hinweise aktivieren'
const NO_LABEL = 'Nein'

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

const chatAad = (partnerId) => `partner_telegram_chat:${partnerId}`
// Eigene Domänen im HMAC - ein Link-Code ist nie zugleich ein gültiger Gutschein-Hash (lib/codes.js hashCode).
const codeHashOf = (code) => hashCode(`telegram-link:${code}`)
const chatHashOf = (chatId) => hashCode(`telegram-chat:${chatId}`)

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
  `INSERT INTO partner_telegram (partner_id, chat_cipher, chat_hash, hinweis_nachricht, hinweis_freigabe, verbunden_at, getrennt_grund, updated_at)
   VALUES (@partnerId, @cipher, @chatHash, 1, 1, datetime('now'), NULL, datetime('now'))
   ON CONFLICT(partner_id) DO UPDATE SET chat_cipher = excluded.chat_cipher, chat_hash = excluded.chat_hash, hinweis_nachricht = 1,
     hinweis_freigabe = 1, verbunden_at = excluded.verbunden_at, getrennt_grund = NULL, updated_at = excluded.updated_at`
)
const deleteConnectionStmt = db.prepare('DELETE FROM partner_telegram WHERE partner_id = ?')
const deleteByChatStmt = db.prepare('DELETE FROM partner_telegram WHERE chat_hash = ?')
const linkedChatStmt = db.prepare('SELECT 1 FROM partner_telegram WHERE chat_hash = ? AND chat_cipher IS NOT NULL LIMIT 1')
const markBlockedStmt = db.prepare(
  "UPDATE partner_telegram SET chat_cipher = NULL, chat_hash = NULL, getrennt_grund = ?, updated_at = datetime('now') WHERE partner_id = ? AND chat_cipher IS NOT NULL"
)

// --- Status --------------------------------------------------------------------------------------

// Die Chat-ID aus einer Zeile - oder null (nicht verbunden, oder der Geheimtext ist nicht mehr lesbar, z. B. nach einem
// geänderten CODE_PEPPER: dann zählt der Partner als nicht verbunden und kann neu verbinden). Ohne Rückfall auf Werte
// ohne AAD - Chat-IDs gab es nie ohne.
function decryptChat(row) {
  if (!row?.chat_cipher) return null
  try {
    const chatId = decryptSecret(row.chat_cipher, chatAad(row.partner_id), { allowLegacy: false })
    return NUMERIC_CHAT_ID_RE.test(chatId) ? chatId : null
  } catch {
    return null
  }
}

// Für den Partner-Bereich: nie die Chat-ID, nur ob verbunden, warum getrennt und die Schalter.
// eingerichtet: hat der Admin einen Bot-Token hinterlegt (lib/telegramConfig.js)?
function connectionStatus(partnerId, { eingerichtet }) {
  const row = findRowStmt.get(partnerId)
  const verbunden = decryptChat(row) !== null
  return {
    eingerichtet: Boolean(eingerichtet),
    verbunden,
    getrennt: !verbunden && row?.getrennt_grund === GETRENNT.blockiert ? GETRENNT.blockiert : null,
    hinweise: { nachricht: verbunden && Boolean(row.hinweis_nachricht), freigabe: verbunden && Boolean(row.hinweis_freigabe) }
  }
}

// Chat-ID für den Versand - oder null, wenn nicht verbunden oder (hinweis angegeben) dieser Schalter aus ist.
function chatIdFor(partnerId, { hinweis } = {}) {
  const row = findRowStmt.get(partnerId)
  if (hinweis && row && !row[HINWEIS_COLUMNS[hinweis]]) return null
  return decryptChat(row)
}

function hasOpenLinkCode(partnerId) {
  return Boolean(openCodeStmt.get(partnerId))
}

// Ist dieser Chat mit einem Partner verbunden? Für "Chat finden" im Admin (solche Chats erscheinen dort nicht).
function isLinkedChat(chatId) {
  return NUMERIC_CHAT_ID_RE.test(String(chatId)) && Boolean(linkedChatStmt.get(chatHashOf(String(chatId))))
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

// Der Partner hinter einem gültigen (offenen, nicht abgelaufenen) Code - kein Demo-Partner - oder null. Verbraucht nichts.
function partnerForCode(code) {
  const row = CODE_RE.test(code) ? findCodeStmt.get(codeHashOf(code)) : null
  const partner = row ? findPartnerStmt.get(row.partner_id) : null
  return partner && !partner.is_demo ? { row, partner } : null
}

// "Ja": Code verbrauchen und verbinden - in EINER Transaktion, ein Code wirkt so höchstens einmal.
const connectWithCode = db.transaction((code, chatId) => {
  const found = partnerForCode(code)
  if (!found || !markUsedStmt.run(found.row.id).changes) return null
  upsertConnectionStmt.run({ partnerId: found.partner.id, cipher: encryptSecret(chatId, chatAad(found.partner.id)), chatHash: chatHashOf(chatId) })
  deleteCodesOfStmt.run(found.partner.id)
  return found.partner
})

// "Nein": der Code ist verbraucht, nichts wird verbunden.
function declineCode(code) {
  const found = partnerForCode(code)
  if (found) markUsedStmt.run(found.row.id)
}

const send = (chatId, text, replyMarkup) => ({ method: 'sendMessage', chatId, text, ...(replyMarkup ? { replyMarkup } : {}) })

function askConsent(chatId, code, partner) {
  const name = detailValue(partner.name)
  return send(chatId, `Möchtest du hier Hinweise von ${APP_NAME} für „${name}“ bekommen? Zum Beispiel, wenn eine neue Nachricht über „Schreib uns“ da ist.`, {
    inline_keyboard: [[{ text: YES_LABEL, callback_data: `ja:${code}` }, { text: NO_LABEL, callback_data: `nein:${code}` }]]
  })
}

function connectedReply(partner) {
  return `Verbunden: ${APP_NAME} schickt dir hier Hinweise für ${detailValue(partner.name)}. Mit /stop beendest du das jederzeit.`
}

function privateChatId(chat, fromId) {
  if (chat?.type !== 'private') return null
  const chatId = String(chat.id)
  if (!NUMERIC_CHAT_ID_RE.test(chatId)) return null
  // Bei Knöpfen: wer getippt hat, muss genau dieser private Chat sein.
  return fromId === undefined || String(fromId) === chatId ? chatId : null
}

function consumeMessage(message) {
  if (typeof message?.text !== 'string') return { consumed: false }
  const start = START_RE.exec(message.text)
  const stop = !start && STOP_RE.test(message.text)
  if (!start && !stop) return { consumed: false }
  const chatId = privateChatId(message.chat)
  if (!chatId) return { consumed: false }
  if (stop) {
    deleteByChatStmt.run(chatHashOf(chatId))
    return { consumed: true, actions: [send(chatId, STOPPED_REPLY)] }
  }
  const found = partnerForCode(start[1])
  return { consumed: true, actions: [found ? askConsent(chatId, start[1], found.partner) : send(chatId, EXPIRED_REPLY)] }
}

function consumeCallback(query) {
  const match = typeof query?.data === 'string' ? CALLBACK_RE.exec(query.data) : null
  if (!match) return { consumed: false }
  const answer = typeof query.id === 'string' && query.id ? [{ method: 'answerCallbackQuery', callbackQueryId: query.id }] : []
  const chatId = privateChatId(query.message?.chat, query.from?.id)
  if (!chatId) return { consumed: true, actions: answer }
  if (match[1] === 'nein') {
    declineCode(match[2])
    return { consumed: true, actions: [...answer, send(chatId, DECLINED_REPLY)] }
  }
  const partner = connectWithCode(match[2], chatId)
  return { consumed: true, actions: [...answer, send(chatId, partner ? connectedReply(partner) : EXPIRED_REPLY)] }
}

// Für lib/telegramUpdates.js: gehört dieses Update den Partner-Verbindungen ("/start <code>", "/stop" oder ein Knopf der
// Rückfrage, jeweils aus einem privaten Chat)? Dann consumed: true (nie in die Chat-Liste des Admins) und actions: was der
// Bot darauf schickt ({ method: 'sendMessage', chatId, text, replyMarkup? } bzw. { method: 'answerCallbackQuery', … }).
function consumeUpdate(update) {
  if (update?.callback_query) return consumeCallback(update.callback_query)
  if (update?.message) return consumeMessage(update.message)
  return { consumed: false }
}

// --- Einstellungen und Trennen -------------------------------------------------------------------

// { nachricht?, freigabe? } - nur echte Booleans, nur solange verbunden (sonst 409).
function updateHinweise(partnerId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw httpError(400, 'Bitte die Schalter als Objekt senden.')
  const unknown = Object.keys(body).find((name) => !HINWEIS_NAMES.includes(name))
  if (unknown !== undefined) throw httpError(400, `Unbekannte Einstellung: ${unknown}`)
  const notBoolean = Object.keys(body).find((name) => typeof body[name] !== 'boolean')
  if (notBoolean !== undefined) throw httpError(400, `„${notBoolean}“ muss true oder false sein`)
  if (decryptChat(findRowStmt.get(partnerId)) === null) throw httpError(409, 'Telegram ist nicht verbunden.')
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
  DECLINED_REPLY,
  STOPPED_REPLY,
  connectionStatus,
  chatIdFor,
  hasOpenLinkCode,
  isLinkedChat,
  createLinkCode,
  consumeUpdate,
  updateHinweise,
  disconnect,
  markBlocked
}
