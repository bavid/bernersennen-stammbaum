const express = require('express')
const config = require('../config')
const { requireAdmin } = require('../middleware/admin')
const { noStore } = require('../lib/noStoreResponse')
const { AKTION, logAdminAction } = require('../lib/adminLog')
const { readNotifySettings, updateNotifySettings } = require('../lib/notifySettings')
const { telegramStatus, effectiveTelegram, validateTelegramInput, validateOptionalToken, saveTelegram } = require('../lib/telegramConfig')
const { telegramClient, isRejectedByTelegram, extractChats } = require('../lib/telegram')
const { sendTestMessage } = require('../lib/notify')

// Phase N Task 2: Telegram-Benachrichtigungen im Admin - Zugangsdaten (Bot-Token verschlüsselt, Chat-ID), Schalter
// je Ereignis und eine Testnachricht (lib/telegramConfig.js, lib/notifySettings.js, lib/notify.js). Eingehängt unter
// /api/admin in app.js, GENAU wie routes/admin.js: derselbe 404-ohne-Passwort-Hash-Gate und requireAdmin auf jeder
// Route. Alle Antworten no-store. Der Bot-Token verlässt den Server nie Richtung Client - höchstens seine letzten 4
// Zeichen (tokenHinweis); das Admin-Protokoll vermerkt nur, DASS etwas eingerichtet oder entfernt wurde.
const router = express.Router()

const TELEGRAM_ZIEL = 'telegram'
const TOKEN_REJECTED = 'Der Bot-Token wurde von Telegram nicht akzeptiert.'
const UNREACHABLE = 'Telegram ist gerade nicht erreichbar – bitte später noch einmal versuchen.'
const WEBHOOK_ACTIVE = 'Für diesen Bot ist ein Webhook eingerichtet – dann liefert Telegram keine Chats. Bitte die Chat-ID von Hand eintragen.'
const TELEGRAM_CONFLICT = 409

router.use((req, res, next) => {
  if (!config.adminPasswordHash) return res.status(404).json({ error: 'Nicht gefunden' })
  next()
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

// Ein Fehler des Telegram-Clients -> Antwort für den Admin: "Nein" von Telegram 400, sonst 502 (nie der Token).
function telegramFailure(err) {
  if (err?.upstreamStatus === TELEGRAM_CONFLICT) return httpError(409, WEBHOOK_ACTIVE)
  return isRejectedByTelegram(err) ? httpError(400, TOKEN_REJECTED) : httpError(502, UNREACHABLE)
}

// { eingerichtet, quelle ('admin' | 'umgebung' | null), tokenHinweis ('…abcd' | null), chatId, einstellungen }
function statusResponse() {
  return { ...telegramStatus(), einstellungen: readNotifySettings() }
}

router.get('/notify-settings', noStore, requireAdmin, (req, res) => {
  res.json(statusResponse())
})

// PUT /api/admin/notify-settings { gutschein_anfrage?, partner_anfrage?, registrierung?, feedback?, beitrag?, details? }
// - nur Booleans (lib/notifySettings.js). Antwort wie GET.
router.put('/notify-settings', noStore, requireAdmin, (req, res, next) => {
  try {
    updateNotifySettings(req.body)
    res.json(statusResponse())
  } catch (err) {
    sendError(res, next, err)
  }
})

// PUT /api/admin/notify-settings/telegram { token?, chatId? } - fehlend = unverändert, '' oder null = löschen. Ein neuer
// Token wird vorher bei Telegram geprüft (getMe, 5 s) - lehnt Telegram ab, 400 und nichts gespeichert. Antwort wie GET.
router.put('/notify-settings/telegram', noStore, requireAdmin, async (req, res, next) => {
  try {
    const input = validateTelegramInput(req.body)
    if (input.token) {
      try {
        await telegramClient().getMe({ token: input.token })
      } catch (err) {
        throw telegramFailure(err)
      }
    }
    const { gesetzt, geloescht } = saveTelegram(input)
    if (geloescht) logAdminAction(AKTION.telegramEntfernt, TELEGRAM_ZIEL)
    if (gesetzt) logAdminAction(AKTION.telegramEingerichtet, TELEGRAM_ZIEL)
    res.json(statusResponse())
  } catch (err) {
    sendError(res, next, err)
  }
})

// POST /api/admin/notify-settings/chat-finden { token? } -> [{ id, titel, typ }]: die Chats, die dem Bot zuletzt
// geschrieben haben (getUpdates) - der Admin schreibt seinem Bot "/start" und wählt dann seinen Chat. Mit dem
// mitgeschickten Token, sonst dem wirksamen (Admin oder Umgebung). Speichert nichts.
router.post('/notify-settings/chat-finden', noStore, requireAdmin, async (req, res, next) => {
  try {
    const token = validateOptionalToken(req.body?.token) || effectiveTelegram().token
    if (!token) throw httpError(409, 'Zuerst den Bot-Token speichern.')
    let updates
    try {
      updates = await telegramClient().getUpdates({ token })
    } catch (err) {
      throw telegramFailure(err)
    }
    res.json(extractChats(updates))
  } catch (err) {
    sendError(res, next, err)
  }
})

// POST /api/admin/notify-test - einmal, abgewartet: { ok: true }, 409 ohne Einrichtung, 502 wenn nichts ankam.
router.post('/notify-test', noStore, requireAdmin, async (req, res, next) => {
  try {
    if (!(await sendTestMessage())) {
      return res.status(502).json({ error: 'Die Testnachricht ist nicht angekommen – bitte Bot-Token und Chat-ID prüfen.' })
    }
    res.json({ ok: true })
  } catch (err) {
    sendError(res, next, err)
  }
})

module.exports = router
