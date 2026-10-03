'use strict'

// Phase V4b: EIN Leser für die Updates des Bots (getUpdates) - für "Chat finden" im Admin (routes/adminNotify.js) und die
// Verbindung der Partner (lib/partnerTelegram.js). Telegram liefert jedes Update nur so lange, bis ein späterer Aufruf es
// per offset bestätigt; zwei unabhängige Leser würden sich die Updates also gegenseitig wegnehmen. Darum liest nur dieser
// Leser, mit dem offset in settings (telegram_updates_offset, je Bot), und verteilt jedes Update: "/start <code>", "/stop"
// und die Knöpfe der Rückfrage aus einem privaten Chat an die Partner-Verbindungen (lib/partnerTelegram.js consumeUpdate,
// nie in die Liste des Admins), alles andere in die Liste der zuletzt gesehenen Chats für den Admin (nur im Speicher,
// höchstens 20, 24 Stunden - wie lange Telegram Updates aufhebt; Chats, die mit einem Partner verbunden sind, nie).
// security-review V4b: je Abfrage bis zu MAX_ROUNDS kleine Stapel (lib/telegram.js UPDATES_LIMIT) - eine Flut von
// Nachrichten verdrängt einen echten "/start <code>" so nicht für lange.
//
// Abgefragt wird nur auf Anfrage (kein Webhook, kein Dauer-Polling): "Chat finden", "Verbindung prüfen" und das
// Nachfragen des offenen Verbinden-Dialogs. Höchstens EIN getUpdates je THROTTLE_MS für alle zusammen; gleichzeitige
// Anfragen warten auf denselben Aufruf. Antworten an Partner ("Verbunden …") gehen danach asynchron raus - ein Fehler
// dabei wird als Zeile ohne Chat-ID geloggt.

const db = require('../db')
const { telegramClient, extractChats, UPDATES_LIMIT } = require('./telegram')
const { consumeUpdate, isLinkedChat } = require('./partnerTelegram')
const { failureReason } = require('./notify')

const OFFSET_KEY = 'telegram_updates_offset'
const THROTTLE_MS = 3000
const RECENT_TTL_MS = 24 * 60 * 60 * 1000
const MAX_RECENT = 20
const MAX_ACTIONS_PER_BATCH = 25
const MAX_ROUNDS = 4
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

// Antworten und Knopf-Bestätigungen des Bots (lib/partnerTelegram.js consumeUpdate) - asynchron, gedeckelt je Stapel.
function runActions(token, actions) {
  for (const action of actions.slice(0, MAX_ACTIONS_PER_BATCH)) {
    const call =
      action.method === 'answerCallbackQuery'
        ? () => telegramClient().answerCallbackQuery({ token, callbackQueryId: action.callbackQueryId })
        : () => telegramClient().sendMessage({ token, chatId: action.chatId, text: action.text, replyMarkup: action.replyMarkup })
    const promise = Promise.resolve()
      .then(call)
      .catch((err) => runtime.logger.warn(`${REPLY_FAILURE_LOG} (${failureReason(err)})`))
    pendingReplies.add(promise)
    promise.finally(() => pendingReplies.delete(promise))
  }
}

// Verteilt einen Stapel: jedes Update einzeln (ein Fehler bei einem hält die übrigen nicht auf), dann der neue offset.
// Gibt den neuen offset zurück (oder null, wenn der Stapel keine update_id trug).
function processBatch(bot, token, updates, now) {
  const forAdmin = []
  const actions = []
  let maxId = null
  for (const update of updates) {
    if (Number.isSafeInteger(update?.update_id)) maxId = maxId === null ? update.update_id : Math.max(maxId, update.update_id)
    try {
      const { consumed, actions: own = [] } = consumeUpdate(update)
      actions.push(...own)
      if (!consumed) forAdmin.push(update)
    } catch (err) {
      runtime.logger.warn(`Telegram-Update nicht verarbeitet (${failureReason(err)})`)
    }
  }
  rememberChats(bot, extractChats(forAdmin).filter((chat) => !isLinkedChat(chat.id)), now)
  const offset = maxId === null ? null : maxId + 1
  if (offset !== null) writeOffset(bot, offset)
  runActions(token, actions)
  return offset
}

// Bis zu MAX_ROUNDS Stapel nacheinander, solange Telegram volle Stapel liefert.
async function drain(bot, token) {
  let offset = readOffset(bot)
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const updates = await telegramClient().getUpdates({ token, ...(offset === null ? {} : { offset }) })
    const batch = Array.isArray(updates) ? updates : []
    const next = processBatch(bot, token, batch, runtime.now())
    if (next !== null) offset = next
    if (batch.length < UPDATES_LIMIT || next === null) return
  }
}

// Holt neue Updates (gedrosselt) und verteilt sie. { polled: true } nach einem Aufruf bei Telegram, { polled: false }, wenn
// die Drossel griff. Fehler von Telegram (Zeitüberschreitung, 401, 409 Webhook …) gehen an den Aufrufer.
function pollUpdates({ token }) {
  if (inFlight) return inFlight
  const now = runtime.now()
  if (now - lastPollAt < THROTTLE_MS) return Promise.resolve({ polled: false })
  lastPollAt = now
  const bot = botIdOf(token)
  // security-review V4b: finally erst NACH der Zuweisung (eigener Mikrotask) - ein synchroner Fehler in drain() ließe
  // sonst ein abgelehntes Versprechen dauerhaft in inFlight stehen.
  const run = async () => {
    await drain(bot, token)
    return { polled: true }
  }
  inFlight = run().finally(() => {
    inFlight = null
  })
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
