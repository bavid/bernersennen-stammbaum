const express = require('express')
const rateLimit = require('express-rate-limit')
const { denyDemoWrites } = require('../../middleware/auth')
const { noStore } = require('../../lib/noStoreResponse')
const { telegramClient, isRejectedByTelegram } = require('../../lib/telegram')
const { effectiveBotFor, validateOwnBotInput, cleanBotUsername, saveOwnBot, removeOwnBot } = require('../../lib/partnerTelegramBots')
const { connectionStatus } = require('../../lib/partnerTelegram')

// Eigener Telegram-Bot eines Partners (/api/partner-area/telegram/bot, lib/partnerTelegramBots.js): PUT { token } prüft
// den Token erst bei Telegram (getMe, 5 s - lehnt Telegram ab, 400 und nichts gespeichert; nicht erreichbar 502) und
// speichert ihn dann verschlüsselt; DELETE entfernt ihn (danach gilt wieder der Team-Bot oder nichts). Jede Antwort ist
// der Telegram-Status wie GET /api/partner-area/telegram - nie der Token, nur quelle und Bot-Name. Läuft hinter
// middleware/partnerArea.js requirePartnerArea (req.partner ist gesetzt); Demo-Sitzungen und (über app.js) die
// Admin-Ansicht lesen nur. Höchstens SAVE_LIMIT Speicherversuche je Stunde und Partner - jeder Versuch fragt Telegram.

const router = express.Router()

const ONE_HOUR = 60 * 60 * 1000
const SAVE_LIMIT = 10
const TOKEN_REJECTED = 'Telegram hat diesen Token nicht angenommen – bitte den Token aus BotFather noch einmal kopieren.'
const UNREACHABLE = 'Telegram ist gerade nicht erreichbar – bitte gleich noch einmal versuchen.'

const saveLimiter = rateLimit({
  windowMs: ONE_HOUR,
  limit: SAVE_LIMIT,
  keyGenerator: (req) => `partner-bot-${req.partner.id}`,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Zu viele Versuche in kurzer Zeit – bitte später noch einmal.' }
})

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

function sendError(res, next, err) {
  if (err.status) return res.status(err.status).json({ error: err.message })
  next(err)
}

function sendStatus(res, partnerId) {
  res.json(connectionStatus(partnerId, { bot: effectiveBotFor(partnerId) }))
}

// Fragt Telegram nach dem Bot hinter dem Token - der Name kommt zurück, ein Fehler nie mit dem Token.
async function checkedBotUsername(token) {
  let me
  try {
    me = await telegramClient().getMe({ token })
  } catch (err) {
    throw isRejectedByTelegram(err) ? httpError(400, TOKEN_REJECTED) : httpError(502, UNREACHABLE)
  }
  const username = cleanBotUsername(me?.username)
  if (!username) throw httpError(502, UNREACHABLE)
  return username
}

router.use(noStore)

// { token } -> Status. Ein Wechsel des Bots beendet eine bestehende Verbindung (getrennt: 'bot-gewechselt').
router.put('/', denyDemoWrites, saveLimiter, async (req, res, next) => {
  try {
    const token = validateOwnBotInput(req.body)
    const username = await checkedBotUsername(token)
    saveOwnBot(req.partner.id, { token, username })
    sendStatus(res, req.partner.id)
  } catch (err) {
    sendError(res, next, err)
  }
})

router.delete('/', denyDemoWrites, (req, res) => {
  removeOwnBot(req.partner.id)
  sendStatus(res, req.partner.id)
})

module.exports = router
