'use strict'

// Phase N Task 2: Telegram-Bot-API - sendMessage (Benachrichtigungen), getMe (Token prüfen, bevor er gespeichert
// wird) und getUpdates (Chat finden, nachdem der Admin seinem Bot "/start" geschrieben hat). Einziger Weg ist der
// SSRF-geschützte Client lib/http.js: nur https, Host-Allowlist genau api.telegram.org, Port 443, keine
// Weiterleitungen, Zeitlimit, gedeckelte Antwortgröße. Der Token steht im Pfad der URL - er landet nie in einer
// Fehlermeldung oder im Log (lib/http.js nennt die URL nie). Texte gehen als reiner Text ohne parse_mode raus:
// nichts aus Nutzereingaben kann Markdown/HTML einschleusen.
// Tests tauschen den ganzen Client aus (setTelegramClientForTests) und gehen nie ins Netz.

const { safeFetchJson } = require('./http')
const { stripUnsafeChars } = require('./partners')
const { isValidToken, CHAT_ID_RE } = require('./telegramFormat')

const TELEGRAM_HOST = 'api.telegram.org'
const SEND_TIMEOUT_MS = 8000
const CHECK_TIMEOUT_MS = 5000
const MAX_RESPONSE_BYTES = 1_000_000
const UPDATES_LIMIT = 100
const MAX_CHATS = 20
const MAX_TITLE_LENGTH = 100
const NUMERIC_CHAT_ID_RE = /^-?\d{1,20}$/

function telegramError(status, message, extra = {}) {
  return Object.assign(new Error(message), { status }, extra)
}

// "Telegram sagt nein" (falscher Token, unbekannter Chat, ok: false) - im Unterschied zu "nicht erreichbar"
// (Zeitüberschreitung, Verbindung, 5xx) und "zu viele Anfragen" (429, später noch einmal).
function isRejectedByTelegram(err) {
  if (err?.rejected === true) return true
  const upstream = err?.upstreamStatus
  return Number.isInteger(upstream) && upstream >= 400 && upstream < 500 && upstream !== 429
}

// Ruft eine Methode der Bot-API auf und liefert result. Ein Token im falschen Format wird gar nicht erst verschickt.
function createTelegramClient({ fetchJson = safeFetchJson } = {}) {
  async function callApi(token, method, payload, timeoutMs) {
    if (!isValidToken(token)) throw telegramError(400, 'Der Bot-Token hat nicht das erwartete Format.', { rejected: true })
    const data = await fetchJson(`https://${TELEGRAM_HOST}/bot${token}/${method}`, {
      method: 'POST',
      body: JSON.stringify(payload),
      allowHosts: [TELEGRAM_HOST],
      timeoutMs,
      maxBytes: MAX_RESPONSE_BYTES
    })
    if (!data || data.ok !== true) throw telegramError(502, 'Telegram hat die Anfrage nicht angenommen.', { rejected: true })
    return data.result
  }

  return {
    // disable_web_page_preview ist bei Telegram inzwischen veraltet, wird aber weiter verstanden;
    // link_preview_options ist der neue Weg - beide zusammen schaden nicht.
    sendMessage: ({ token, chatId, text }) =>
      callApi(
        token,
        'sendMessage',
        { chat_id: chatId, text, disable_web_page_preview: true, link_preview_options: { is_disabled: true } },
        SEND_TIMEOUT_MS
      ),
    getMe: async ({ token }) => {
      const me = await callApi(token, 'getMe', {}, CHECK_TIMEOUT_MS)
      if (!me || me.is_bot !== true) throw telegramError(502, 'Das ist kein Bot-Token.', { rejected: true })
      return me
    },
    // Phase V4b: offset bestätigt alle älteren Updates (lib/telegramUpdates.js liest sie für Admin und Partner gemeinsam).
    getUpdates: ({ token, offset }) =>
      callApi(token, 'getUpdates', { limit: UPDATES_LIMIT, timeout: 0, ...(Number.isSafeInteger(offset) ? { offset } : {}) }, CHECK_TIMEOUT_MS)
  }
}

const defaultClient = createTelegramClient()
let activeClient = defaultClient

function telegramClient() {
  return activeClient
}

// Nur für Tests: ersetzt den Client. Nicht angegebene Methoden werfen, statt doch ins Netz zu gehen.
function setTelegramClientForTests(fake) {
  const notFaked = async () => {
    throw telegramError(502, 'Im Test nicht vorgesehen')
  }
  const previous = activeClient
  activeClient = { sendMessage: notFaked, getMe: notFaked, getUpdates: notFaked, ...fake }
  return () => {
    activeClient = previous
  }
}

// --- Chats aus getUpdates ------------------------------------------------------------------------

const UPDATE_KINDS = ['message', 'edited_message', 'channel_post', 'edited_channel_post', 'my_chat_member', 'chat_member', 'chat_join_request']

function cleanTitle(value) {
  if (typeof value !== 'string') return ''
  return stripUnsafeChars(value).trim().slice(0, MAX_TITLE_LENGTH)
}

function chatOfUpdate(update) {
  if (!update || typeof update !== 'object') return null
  for (const kind of UPDATE_KINDS) {
    const chat = update[kind]?.chat
    if (chat && typeof chat === 'object') return chat
  }
  const callbackChat = update.callback_query?.message?.chat
  return callbackChat && typeof callbackChat === 'object' ? callbackChat : null
}

// Privat: Vor- und Nachname, dazu @username; Gruppe/Kanal: Titel. Reiner Text, gekürzt.
function chatTitle(chat) {
  const username = cleanTitle(chat.username)
  if (chat.type === 'private') {
    const name = [cleanTitle(chat.first_name), cleanTitle(chat.last_name)].filter(Boolean).join(' ')
    const withUser = [name, username ? `@${username}` : ''].filter(Boolean).join(' ')
    return (withUser || 'Privater Chat').slice(0, MAX_TITLE_LENGTH)
  }
  return cleanTitle(chat.title) || (username ? `@${username}` : 'Chat')
}

// Verschiedene Chats aus einer getUpdates-Antwort, neueste zuerst, höchstens MAX_CHATS: [{ id, titel, typ }].
// id als Text (so schickt der Admin sie zurück), nur numerische IDs.
function extractChats(updates) {
  if (!Array.isArray(updates)) return []
  const seen = new Set()
  const chats = []
  for (const update of [...updates].reverse()) {
    const chat = chatOfUpdate(update)
    const id = chat && (typeof chat.id === 'number' || typeof chat.id === 'string') ? String(chat.id) : ''
    if (!NUMERIC_CHAT_ID_RE.test(id) || !CHAT_ID_RE.test(id) || seen.has(id)) continue
    seen.add(id)
    chats.push({ id, titel: chatTitle(chat), typ: typeof chat.type === 'string' ? cleanTitle(chat.type) : null })
    if (chats.length >= MAX_CHATS) break
  }
  return chats
}

module.exports = {
  NUMERIC_CHAT_ID_RE,
  TELEGRAM_HOST,
  SEND_TIMEOUT_MS,
  CHECK_TIMEOUT_MS,
  createTelegramClient,
  telegramClient,
  setTelegramClientForTests,
  isRejectedByTelegram,
  extractChats
}
