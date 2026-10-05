const crypto = require('node:crypto')
const express = require('express')
const rateLimit = require('express-rate-limit')
const { denyDemoWrites } = require('../../middleware/auth')
const { noStore } = require('../../lib/noStoreResponse')
const { effectiveBotFor } = require('../../lib/partnerTelegramBots')
const { telegramClient } = require('../../lib/telegram')
const { pollUpdates } = require('../../lib/telegramUpdates')
const { connectionStatus, hasOpenLinkCode, createLinkCode, updateHinweise, disconnect, CODE_VALID_MINUTES } = require('../../lib/partnerTelegram')
const { sendPartnerTestMessage, DELIVERY } = require('../../lib/partnerNotify')

// Phase V4b: Telegram-Hinweise im Partner-Bereich (/api/partner-area/telegram) - Verbinden über einen Einmal-Link
// (lib/partnerTelegram.js), Verbindung prüfen (Update-Leser je Bot, lib/telegramUpdates.js), Schalter je Ereignis,
// Testnachricht und Trennen. Läuft hinter middleware/partnerArea.js requirePartnerArea (req.partner ist gesetzt). Alle
// Antworten no-store; Chat-ID und Token verlassen den Server nie - nur verbunden: true/false und der Bot-Name. Demo-
// Sitzungen (und über app.js die Admin-Ansicht) lesen nur. Welcher Bot: der eigene des Partners, sonst der des Teams
// (lib/partnerTelegramBots.js effectiveBotFor; eintragen unter routes/partnerArea/telegramBot.js) - ohne beides
// eingerichtet: false, Verbinden 409.

const router = express.Router()

const ONE_HOUR = 60 * 60 * 1000
const TEN_MINUTES = 10 * 60 * 1000
const BOT_CACHE_MS = ONE_HOUR
const BOT_USERNAME_RE = /^[A-Za-z][A-Za-z0-9_]{3,31}$/
const NOT_SET_UP = 'Telegram ist noch nicht eingerichtet.'
const NOT_CONNECTED = 'Telegram ist nicht verbunden.'
const UNREACHABLE = 'Telegram ist gerade nicht erreichbar – bitte gleich noch einmal versuchen.'
const BLOCKED = 'Telegram meldet, dass der Bot blockiert ist – die Verbindung ist beendet. Ihr könnt jederzeit neu verbinden.'
const TEST_FAILED = 'Die Testnachricht ist nicht angekommen – bitte gleich noch einmal versuchen.'

function partnerLimiter(windowMs, limit, message) {
  return rateLimit({
    windowMs,
    limit,
    keyGenerator: (req) => `partner-${req.partner.id}`,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: message }
  })
}

// Neue Links: 10 je Stunde. Prüfen: der offene Dialog fragt alle ~10 s nach - 100 je 10 Minuten lassen Luft für den
// Knopf. Testnachricht: 5 je Stunde.
const linkLimiter = partnerLimiter(ONE_HOUR, 10, 'Zu viele neue Links in kurzer Zeit – bitte später noch einmal versuchen.')
const checkLimiter = partnerLimiter(TEN_MINUTES, 100, 'Zu viele Prüfungen in kurzer Zeit – bitte kurz warten.')
const testLimiter = partnerLimiter(ONE_HOUR, 5, 'Höchstens fünf Testnachrichten je Stunde – bitte später noch einmal.')

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

function sendError(res, next, err) {
  if (err.status) return res.status(err.status).json({ error: err.message })
  next(err)
}

// Der Bot, der diesem Partner schreibt (eigener, sonst Team-Bot) - oder null.
function botFor(partnerId) {
  return effectiveBotFor(partnerId)
}

function sendStatus(res, partnerId) {
  res.json(connectionStatus(partnerId, { bot: botFor(partnerId) }))
}

// Der Benutzername des Bots für den Link t.me/<bot>: beim eigenen Bot gespeichert, beim Team-Bot aus getMe (je Token
// eine Stunde im Speicher).
let botCache = { key: null, username: null, at: 0 }

async function botUsername({ token, username }) {
  if (username) return username
  const key = crypto.createHash('sha256').update(token).digest('hex')
  if (botCache.key === key && Date.now() - botCache.at < BOT_CACHE_MS) return botCache.username
  let me
  try {
    me = await telegramClient().getMe({ token })
  } catch {
    throw httpError(502, UNREACHABLE)
  }
  if (typeof me?.username !== 'string' || !BOT_USERNAME_RE.test(me.username)) throw httpError(502, UNREACHABLE)
  botCache = { key, username: me.username, at: Date.now() }
  return me.username
}

router.use(noStore)

// { eingerichtet, verbunden, getrennt: 'blockiert' | null, hinweise: { nachricht, freigabe } }
router.get('/', (req, res) => {
  sendStatus(res, req.partner.id)
})

// Ein neuer Einmal-Link (15 Minuten, ältere verfallen): { url: 'https://t.me/<bot>?start=<code>', gueltigMinuten }.
router.post('/verbinden', denyDemoWrites, linkLimiter, async (req, res, next) => {
  try {
    const bot = botFor(req.partner.id)
    if (!bot) throw httpError(409, NOT_SET_UP)
    const username = await botUsername(bot)
    const code = createLinkCode(req.partner.id)
    res.status(201).json({ url: `https://t.me/${username}?start=${code}`, gueltigMinuten: CODE_VALID_MINUTES })
  } catch (err) {
    sendError(res, next, err)
  }
})

// Verbindung prüfen: liest neue Updates des Bots dieses Partners (gedrosselt je Bot; beim Team-Bot gemeinsam mit "Chat
// finden") - aber nur, solange dieser Partner einen offenen Link hat. Antwort wie GET.
router.post('/pruefen', denyDemoWrites, checkLimiter, async (req, res, next) => {
  try {
    const bot = botFor(req.partner.id)
    if (!bot) throw httpError(409, NOT_SET_UP)
    if (hasOpenLinkCode(req.partner.id)) {
      try {
        await pollUpdates({ token: bot.token })
      } catch {
        throw httpError(502, UNREACHABLE)
      }
    }
    sendStatus(res, req.partner.id)
  } catch (err) {
    sendError(res, next, err)
  }
})

// { nachricht?, freigabe? } - nur Booleans, nur solange verbunden. Antwort wie GET.
router.put('/hinweise', denyDemoWrites, (req, res, next) => {
  try {
    updateHinweise(req.partner.id, req.body)
    sendStatus(res, req.partner.id)
  } catch (err) {
    sendError(res, next, err)
  }
})

// Testnachricht: einmal, abgewartet - { ok: true }; 409 ohne Bot/Verbindung oder wenn Telegram 403 meldet (dann ist die
// Verbindung beendet), 502 wenn nichts ankam.
router.post('/test', denyDemoWrites, testLimiter, async (req, res, next) => {
  try {
    if (!botFor(req.partner.id)) throw httpError(409, NOT_SET_UP)
    const result = await sendPartnerTestMessage(req.partner)
    if (result === null) throw httpError(409, NOT_CONNECTED)
    if (result === DELIVERY.blockiert) throw httpError(409, BLOCKED)
    if (result !== DELIVERY.ok) throw httpError(502, TEST_FAILED)
    res.json({ ok: true })
  } catch (err) {
    sendError(res, next, err)
  }
})

// Trennen: Chat-ID und offene Links weg. Antwort wie GET.
router.delete('/', denyDemoWrites, (req, res) => {
  disconnect(req.partner.id)
  sendStatus(res, req.partner.id)
})

module.exports = router
