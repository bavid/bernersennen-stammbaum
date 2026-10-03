'use strict'

// Phase V4b: EIN Leser für die Updates des Bots (getUpdates) - für "Chat finden" im Admin (routes/adminNotify.js) und die
// Verbindung der Partner (lib/partnerTelegram.js). Telegram liefert jedes Update nur so lange, bis ein späterer Aufruf es
// per offset bestätigt; zwei unabhängige Leser würden sich die Updates also gegenseitig wegnehmen. Darum liest nur dieser
// Leser, mit dem offset in settings (telegram_updates_offset, je Bot), und verteilt jedes Update: "/start <code>" aus
// einem privaten Chat an die Partner-Verbindungen (nie in die Liste des Admins), alles andere in die Liste der zuletzt
// gesehenen Chats für den Admin (nur im Speicher, höchstens 20, 24 Stunden - wie lange Telegram Updates aufhebt).
//
// Abgefragt wird nur auf Anfrage (kein Webhook, kein Dauer-Polling): "Chat finden", "Verbindung prüfen" und das
// Nachfragen des offenen Verbinden-Dialogs. Höchstens EIN getUpdates je THROTTLE_MS für alle zusammen; gleichzeitige
// Anfragen warten auf denselben Aufruf. Antworten an Partner ("Verbunden …") gehen danach asynchron raus - ein Fehler
// dabei wird als Zeile ohne Chat-ID geloggt.

const db = require('../db')
const { telegramClient, extractChats } = require('./telegram')
const { consumeLinkUpdate } = require('./partnerTelegram')
const { failureReason } = require('./notify')

const OFFSET_KEY = 'telegram_updates_offset'
const THROTTLE_MS = 3000
const RECENT_TTL_MS = 24 * 60 * 60 * 1000
const MAX_RECENT = 20
const MAX_REPLIES_PER_BATCH = 10
const REPLY_FAILURE_LOG = 'Telegram-Antwort an einen Partner fehlgeschlagen'

const readOffsetStmt = db.prepare('SELECT value FROM settings WHERE key = ?')
const upsertOffsetStmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')

const DEFAULT_RUNTIME = Object.freeze({ now: () => Date.now(), logger: console })
let runtime = DEFAULT_RUNTIME
let lastPollAt = Number.NEGATIVE_INFINITY
let inFlight = null
let recent = { bot: null, chats: [] }
const pendingReplies = new Set()

// Nur für Tests: Uhr und Logger austauschen; setzt Drossel und Chat-Liste zurück (der offset in settings bleibt).
function setTelegramUpdatesRuntimeForTests(overrides = {}) {
  runtime = { ...DEFAULT_RUNTIME, ...overrides }
  lastPollAt = Number.NEGATIVE_INFINITY
  recent = { bot: null, chats: [] }
  return () => {
    runtime = DEFAULT_RUNTIME
    lastPollAt = Number.NEGATIVE_INFINITY
    recent = { bot: null, chats: [] }
  }
}

// Die Bot-Id steht vor dem Doppelpunkt des Tokens (lib/telegramFormat.js) - kein Geheimnis, aber eindeutig je Bot.
function botIdOf(token) {
  return String(token).split(':')[0]
}

function readOffset(bot) {
  const value = readOffsetStmt.get(OFFSET_KEY)?.value
  if (!value) return null
  try {
    const stored = JSON.parse(value)
    return stored?.bot === bot && Number.isSafeInteger(stored.offset) ? stored.offset : null
  } catch {
    return null
  }
}

function writeOffset(bot, offset) {
  upsertOffsetStmt.run(OFFSET_KEY, JSON.stringify({ bot, offset }))
}

function rememberChats(bot, chats, now) {
  const previous = recent.bot === bot ? recent.chats : []
  const fresh = chats.map((chat) => ({ ...chat, at: now }))
  const seen = new Set()
  const merged = [...fresh, ...previous].filter((chat) => {
    if (seen.has(chat.id) || chat.at <= now - RECENT_TTL_MS) return false
    seen.add(chat.id)
    return true
  })
  recent = { bot, chats: merged.slice(0, MAX_RECENT) }
}

function sendReplies(token, replies) {
  for (const { chatId, text } of replies.slice(0, MAX_REPLIES_PER_BATCH)) {
    const promise = Promise.resolve()
      .then(() => telegramClient().sendMessage({ token, chatId, text }))
      .catch((err) => runtime.logger.warn(`${REPLY_FAILURE_LOG} (${failureReason(err)})`))
    pendingReplies.add(promise)
    promise.finally(() => pendingReplies.delete(promise))
  }
}

// Verteilt einen Stapel: jedes Update einzeln (ein Fehler bei einem hält die übrigen nicht auf), dann der neue offset.
function processBatch(bot, token, updates, now) {
  const forAdmin = []
  const replies = []
  let maxId = null
  for (const update of updates) {
    if (Number.isSafeInteger(update?.update_id)) maxId = maxId === null ? update.update_id : Math.max(maxId, update.update_id)
    try {
      const { consumed, reply } = consumeLinkUpdate(update)
      if (reply) replies.push(reply)
      if (!consumed) forAdmin.push(update)
    } catch (err) {
      runtime.logger.warn(`Telegram-Update nicht verarbeitet (${failureReason(err)})`)
    }
  }
  rememberChats(bot, extractChats(forAdmin), now)
  if (maxId !== null) writeOffset(bot, maxId + 1)
  sendReplies(token, replies)
}

// Holt neue Updates (gedrosselt) und verteilt sie. { polled: true } nach einem Aufruf bei Telegram, { polled: false }, wenn
// die Drossel griff. Fehler von Telegram (Zeitüberschreitung, 401, 409 Webhook …) gehen an den Aufrufer.
function pollUpdates({ token }) {
  if (inFlight) return inFlight
  const now = runtime.now()
  if (now - lastPollAt < THROTTLE_MS) return Promise.resolve({ polled: false })
  lastPollAt = now
  const bot = botIdOf(token)
  inFlight = (async () => {
    try {
      const offset = readOffset(bot)
      const updates = await telegramClient().getUpdates({ token, ...(offset === null ? {} : { offset }) })
      processBatch(bot, token, Array.isArray(updates) ? updates : [], runtime.now())
      return { polled: true }
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}

// Die zuletzt gesehenen Chats dieses Bots für "Chat finden": [{ id, titel, typ }], neueste zuerst.
function recentChats(token) {
  const bot = botIdOf(token)
  const cutoff = runtime.now() - RECENT_TTL_MS
  if (recent.bot !== bot) return []
  return recent.chats.filter((chat) => chat.at > cutoff).map(({ id, titel, typ }) => ({ id, titel, typ }))
}

// Nur für Tests: wartet, bis alle Antworten an Partner durch sind.
async function flushTelegramRepliesForTests() {
  while (pendingReplies.size) await Promise.allSettled([...pendingReplies])
}

module.exports = {
  OFFSET_KEY,
  THROTTLE_MS,
  pollUpdates,
  recentChats,
  setTelegramUpdatesRuntimeForTests,
  flushTelegramRepliesForTests
}
