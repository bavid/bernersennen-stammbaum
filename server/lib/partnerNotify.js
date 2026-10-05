'use strict'

// Phase V4b: Telegram-Hinweise an Partner - notifyPartner(partnerId, ereignis, daten) prüft Bot-Token (im Admin
// eingerichtet, lib/telegramConfig.js), Demo, Verbindung und Schalter (lib/partnerTelegram.js), baut den Text und
// verschickt ihn asynchron: die auslösende Anfrage (Kontaktformular, Freigabe) wartet nie darauf und scheitert nie daran.
// Wie lib/notify.js höchstens MAX_ATTEMPTS Versuche; ein endgültiger Fehler wird als EINE Zeile ohne Inhalt geloggt -
// nie Text, Token oder Chat-ID. Antwortet Telegram mit 403 (Bot blockiert), ist die Verbindung beendet (markBlocked).
//
// Datenschutz: die Texte enthalten keine personenbezogenen Daten - nie Name, E-Mail, Telefon oder Text einer Nachricht,
// nur DASS es etwas Neues gibt. Ein Beitragstitel ist eigener Inhalt des Partners und darf mit (entschärft wie in
// lib/notify.js detailValue: eine Zeile, keine anklickbaren Links oder Erwähnungen).
// Obergrenze je Partner, Ereignis und Server-Prozess: CAP_PER_WINDOW Hinweise in einer gleitenden Stunde; der nächste wird
// durch EINE Warnung ersetzt, danach fällt in diesem Topf eine Stunde lang alles weg. Eigene Töpfe je Ereignis
// (security-review V4b): eine Flut über das öffentliche Kontaktformular verdrängt nie den Hinweis auf eine Freigabe.
// Die Testnachricht hat ihre eigene Grenze (Route).

const db = require('../db')
const { effectiveBotFor } = require('./partnerTelegramBots')
const { telegramClient, isRejectedByTelegram } = require('./telegram')
const { detailValue, failureReason } = require('./notify')
const { chatIdFor, markBlocked } = require('./partnerTelegram')
const { absoluteUrl } = require('./publicUrl')
const config = require('../config')

const PARTNER_EREIGNIS = Object.freeze({ nachricht: 'nachricht', freigabe: 'freigabe' })
const PARTNER_EREIGNIS_VALUES = Object.values(PARTNER_EREIGNIS)
const MAX_ATTEMPTS = 3
const RETRY_DELAYS_MS = Object.freeze([1000, 3000])
const CAP_PER_WINDOW = 20
const CAP_WINDOW_MS = 60 * 60 * 1000
const BLOCKED_STATUS = 403
const PAW = '🐾'
const FAILURE_LOG = 'Telegram-Hinweis an einen Partner fehlgeschlagen'
const CAP_WARNING_TEXT = '⚠️ Viele Hinweise in kurzer Zeit – weitere pausieren für diese Stunde. Alles Neue steht im Partner-Bereich.'
const DELIVERY = Object.freeze({ ok: 'ok', blockiert: 'blockiert', fehler: 'fehler' })

// --- Texte ---------------------------------------------------------------------------------------

// Mit PUBLIC_URL ein Link in den Partner-Bereich, sonst nur der Weg dorthin in Worten.
function whereToLook(urlPath, label) {
  return config.publicUrl ? `im Partner-Bereich: ${absoluteUrl(urlPath)}` : `im Partner-Bereich unter „${label}“`
}

function buildPartnerText(ereignis, daten = {}) {
  if (ereignis === PARTNER_EREIGNIS.nachricht) return `${PAW} Neue Nachricht über „Schreib uns“ – lesen ${whereToLook('/nachrichten', 'Nachrichten')}.`
  const titel = detailValue(daten.titel) || 'ohne Titel'
  if (daten.freigegeben) return `${PAW} Dein Beitrag „${titel}“ wurde freigegeben – er ist jetzt online.`
  return `${PAW} Dein Beitrag „${titel}“ wurde abgelehnt – den Grund findest du ${whereToLook('/beitraege', 'Beiträge')}.`
}

function testText(partner) {
  return `${PAW} Testnachricht von Familie auf Pfoten – die Hinweise für ${detailValue(partner.name)} kommen hier an.`
}

// --- Versand -------------------------------------------------------------------------------------

const DEFAULT_RUNTIME = Object.freeze({
  sender: (message) => telegramClient().sendMessage(message),
  retryDelaysMs: RETRY_DELAYS_MS,
  logger: console,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now()
})
let runtime = DEFAULT_RUNTIME
let caps = new Map()
const inFlight = new Set()

// Nur für Tests: sender, retryDelaysMs, logger, sleep, now und token (null = kein Bot eingerichtet) austauschen - setzt
// auch die Obergrenzen zurück. Gibt restore() zurück.
function setPartnerNotifyRuntimeForTests(overrides) {
  runtime = { ...DEFAULT_RUNTIME, ...overrides }
  caps = new Map()
  return () => {
    runtime = DEFAULT_RUNTIME
    caps = new Map()
  }
}

// Der Token des Bots, der DIESEM Partner schreibt: sein eigener, sonst der des Teams, sonst null
// (lib/partnerTelegramBots.js effectiveBotFor). Tests setzen runtime.token (null = kein Bot).
function currentToken(partnerId) {
  if (Object.hasOwn(runtime, 'token')) return runtime.token
  return effectiveBotFor(partnerId, { logger: runtime.logger })?.token ?? null
}

// 'send', 'warn' (Warnung statt dieses Hinweises, Pause beginnt) oder 'drop' - je Partner und Ereignis.
function admitToCap(partnerId, ereignis, now) {
  const key = `${partnerId}:${ereignis}`
  const state = caps.get(key) || { sent: [], pausedUntil: null }
  if (state.pausedUntil !== null && now < state.pausedUntil) return 'drop'
  const recent = state.sent.filter((sentAt) => sentAt > now - CAP_WINDOW_MS)
  if (recent.length < CAP_PER_WINDOW) {
    caps.set(key, { sent: [...recent, now], pausedUntil: null })
    return 'send'
  }
  caps.set(key, { sent: recent, pausedUntil: now + CAP_WINDOW_MS })
  return 'warn'
}

// DELIVERY.ok | blockiert | fehler. Wirft nie. 403 beendet die Verbindung; ein anderes "Nein" von Telegram wird nicht
// wiederholt, Zeitüberschreitung, Verbindungsfehler, 5xx und 429 schon.
async function deliver(partnerId, { token, chatId, text }, maxAttempts) {
  const { sender, retryDelaysMs, logger, sleep } = runtime
  for (let attempt = 1; ; attempt += 1) {
    try {
      await sender({ token, chatId, text })
      return DELIVERY.ok
    } catch (err) {
      if (err?.upstreamStatus === BLOCKED_STATUS) {
        markBlocked(partnerId)
        logger.warn(`${FAILURE_LOG} (${BLOCKED_STATUS}, Verbindung beendet)`)
        return DELIVERY.blockiert
      }
      if (attempt >= maxAttempts || isRejectedByTelegram(err)) {
        logger.warn(`${FAILURE_LOG} (${failureReason(err)})`)
        return DELIVERY.fehler
      }
      try {
        await sleep(retryDelaysMs[Math.min(attempt - 1, retryDelaysMs.length - 1)] ?? 0)
      } catch {
        // Eine gescheiterte Pause ist kein Grund, den Versand abzubrechen.
      }
    }
  }
}

function track(promise) {
  inFlight.add(promise)
  const forget = () => inFlight.delete(promise)
  promise.then(forget, forget)
  return promise
}

const findPartnerStmt = db.prepare('SELECT id, name, is_demo FROM partners WHERE id = ?')

// Löst den Hinweis aus, wenn ein Bot eingerichtet ist, der Partner kein Demo-Partner ist, verbunden ist, den Schalter an
// hat und die Obergrenze nicht pausiert. Gibt das Versprechen des Versands zurück oder null - Routen warten nie darauf.
// Wirft nie: die auslösende Aktion ist schon erledigt.
function notifyPartner(partnerId, ereignis, daten = {}) {
  try {
    if (!PARTNER_EREIGNIS_VALUES.includes(ereignis)) {
      runtime.logger.warn('Unbekannter Partner-Hinweis – nichts verschickt.')
      return null
    }
    const partner = Number.isInteger(partnerId) ? findPartnerStmt.get(partnerId) : null
    if (!partner || partner.is_demo) return null
    const token = currentToken(partner.id)
    if (!token) return null
    const chatId = chatIdFor(partner.id, { hinweis: ereignis })
    if (!chatId) return null
    const decision = admitToCap(partner.id, ereignis, runtime.now())
    if (decision === 'drop') return null
    const text = decision === 'warn' ? CAP_WARNING_TEXT : buildPartnerText(ereignis, daten ?? {})
    const delivery = new Promise((resolve) => setImmediate(resolve)).then(() => deliver(partner.id, { token, chatId, text }, MAX_ATTEMPTS))
    return track(delivery)
  } catch (err) {
    runtime.logger.warn(`${FAILURE_LOG} (${failureReason(err)})`)
    return null
  }
}

// "Testnachricht senden" im Partner-Bereich: einmal, ohne Wiederholung, abgewartet, an der Obergrenze vorbei.
// DELIVERY.*, oder null, wenn kein Bot eingerichtet bzw. nicht verbunden ist (die Route antwortet dann 409).
async function sendPartnerTestMessage(partner) {
  const token = currentToken(partner.id)
  const chatId = token ? chatIdFor(partner.id) : null
  if (!chatId) return null
  return deliver(partner.id, { token, chatId, text: testText(partner) }, 1)
}

// Nur für Tests: wartet, bis alle ausgelösten Hinweise durch sind.
async function flushPartnerNotificationsForTests() {
  while (inFlight.size) await Promise.allSettled([...inFlight])
}

module.exports = {
  PARTNER_EREIGNIS,
  DELIVERY,
  CAP_PER_WINDOW,
  CAP_WARNING_TEXT,
  buildPartnerText,
  notifyPartner,
  sendPartnerTestMessage,
  setPartnerNotifyRuntimeForTests,
  flushPartnerNotificationsForTests
}
