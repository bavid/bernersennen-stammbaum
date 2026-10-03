'use strict'

// Phase G Task 6: Telegram-Warnungen des Admin-Reiters „Server“, geprüft nach jeder stündlichen Messung
// (lib/serverMetrics.js runHourly). Schwellen wie die Ampel (lib/serverThresholds.js, ab „erhöht“):
// - Speicherplatz warnt sofort (neueste Messung);
// - Arbeitsspeicher und Last nur „dauerhaft“: die letzten SUSTAINED_SAMPLES stündlichen Messungen liegen alle darüber.
// Die betrachteten Messungen müssen frisch sein (MAX_AGE_MS) - nach einer Pause des Servers zählen alte nicht mit.
// Höchstens eine Warnung je Messwert und Berliner Tag: das Datum der letzten steht in settings (server_warnung_am_<metrik>),
// vermerkt nach dem Versand oder einem endgültigen „Nein“ von Telegram - nach einem vorübergehenden Fehler versucht es die
// nächste Messung noch einmal. Eigener Schalter „Server-Warnungen“ (lib/notifySettings.js server_warnung, Standard an).
// Versand über den Admin-Bot (lib/telegramConfig.js, lib/telegram.js), reiner Text ohne Pfade, Hostnamen oder Inhalte.
// Prod und Vorschau messen denselben Server - die Vorschau kennzeichnet ihre Warnungen.

const db = require('../db')
const config = require('../config')
const { readNotifySettings } = require('./notifySettings')
const { telegramCredentials, telegramStatus } = require('./telegramConfig')
const { telegramClient, isRejectedByTelegram } = require('./telegram')
const { berlinNow } = require('./terminSerien')
const { THRESHOLDS, AMPEL, ampel } = require('./serverThresholds')

const SWITCH = 'server_warnung'
const SETTING_PREFIX = 'server_warnung_am_'
const SUSTAINED_SAMPLES = 3
const MAX_AGE_MS = 4 * 60 * 60 * 1000
const SAFE_CODE_RE = /^[A-Z][A-Z0-9_]{1,39}$/
const FAILURE_LOG = 'Server-Warnung per Telegram fehlgeschlagen'

const METRIKEN = Object.freeze({
  speicher: Object.freeze({ sustained: true, value: (row) => row.mem_used_pct }),
  platte: Object.freeze({ sustained: false, value: (row) => row.disk_used_pct }),
  last: Object.freeze({ sustained: true, value: (row, cores) => (Number.isFinite(row.load1) && cores > 0 ? row.load1 / cores : null) })
})

const ENV_LABELS = Object.freeze({ staging: 'Vorschau', dev: 'lokal' })
const STUFE_LABELS = Object.freeze({ [AMPEL.erhoeht]: 'erhöht', [AMPEL.kritisch]: 'kritisch' })
const percentFormat = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 })
const loadFormat = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 })

const readStmt = db.prepare('SELECT value FROM settings WHERE key = ?')
const upsertStmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')

// Überschrittene Messwerte aus den neuesten Messungen (neueste zuerst): [{ metrik, stufe, wert }] - wert ist der neueste
// Wert (Last je Kern), stufe 'erhoeht' oder 'kritisch' nach ihm.
function exceededMetrics({ samples, cores, now }) {
  return Object.entries(METRIKEN).flatMap(([metrik, { sustained, value }]) => {
    const rows = samples.slice(0, sustained ? SUSTAINED_SAMPLES : 1)
    if (rows.length < (sustained ? SUSTAINED_SAMPLES : 1)) return []
    if (rows.some((row) => !(now - Date.parse(row.at) <= MAX_AGE_MS))) return []
    const values = rows.map((row) => value(row, cores))
    const limits = THRESHOLDS[metrik]
    if (!values.every((v) => Number.isFinite(v) && v > limits.gelb)) return []
    return [{ metrik, stufe: ampel(values[0], limits), wert: values[0] }]
  })
}

function warningText({ metrik, stufe, wert }, { cores, newest, appEnv }) {
  const label = [ENV_LABELS[appEnv], STUFE_LABELS[stufe]].filter(Boolean).join(', ')
  const head = `⚠️ Server-Warnung (${label}):`
  const tail = 'Details im Admin unter „Server“.'
  const sustained = 'bei den letzten drei stündlichen Messungen über'
  if (metrik === 'speicher') {
    return `${head} Der Arbeitsspeicher ist zu ${percentFormat.format(wert)} % belegt – ${sustained} ${THRESHOLDS.speicher.gelb} %. ${tail}`
  }
  if (metrik === 'platte') {
    return `${head} Der Speicherplatz ist zu ${percentFormat.format(wert)} % belegt (Warnschwelle ${THRESHOLDS.platte.gelb} %). ${tail}`
  }
  const kerne = cores === 1 ? '1 Kern' : `${cores} Kerne`
  return `${head} Die Last liegt bei ${loadFormat.format(newest.load1)} (${kerne}) – ${sustained} ${loadFormat.format(THRESHOLDS.last.gelb * cores)}. ${tail}`
}

function failureReason(err) {
  if (Number.isInteger(err?.upstreamStatus)) return String(err.upstreamStatus)
  if (Number.isInteger(err?.status)) return String(err.status)
  if (typeof err?.code === 'string' && SAFE_CODE_RE.test(err.code)) return err.code
  return 'unbekannt'
}

// Über den Admin-Bot: false, solange Telegram nicht eingerichtet ist (dann nichts verschickt, nichts vermerkt).
async function sendViaAdminBot(text) {
  const credentials = telegramCredentials()
  if (!credentials) return false
  await telegramClient().sendMessage({ token: credentials.botToken, chatId: credentials.chatId, text })
  return true
}

// send/isEnabled/appEnv/logger nur für Tests austauschbar.
function createServerWarnings({
  send = sendViaAdminBot,
  isEnabled = () => readNotifySettings()[SWITCH],
  appEnv = config.appEnv,
  logger = console
} = {}) {
  // 'gesendet' | 'nicht_eingerichtet' | 'abgelehnt' (endgültig) | 'spaeter' (vorübergehend)
  async function deliver(text) {
    try {
      return (await send(text)) === false ? 'nicht_eingerichtet' : 'gesendet'
    } catch (err) {
      logger.warn(`${FAILURE_LOG} (${failureReason(err)})`)
      return isRejectedByTelegram(err) ? 'abgelehnt' : 'spaeter'
    }
  }

  // Prüft die neuesten Messungen und verschickt fällige Warnungen; gibt die gewarnten Messwerte zurück.
  async function check({ samples, cores, now = Date.now() }) {
    if (!isEnabled()) return []
    const today = berlinNow(new Date(now)).datum
    const due = exceededMetrics({ samples, cores, now }).filter(({ metrik }) => readStmt.get(`${SETTING_PREFIX}${metrik}`)?.value !== today)
    const warned = []
    for (const warning of due) {
      const outcome = await deliver(warningText(warning, { cores, newest: samples[0], appEnv }))
      if (outcome === 'gesendet' || outcome === 'abgelehnt') upsertStmt.run(`${SETTING_PREFIX}${warning.metrik}`, today)
      if (outcome === 'gesendet') warned.push(warning.metrik)
    }
    return warned
  }

  // Für den Admin-Reiter: Schalter an? Telegram eingerichtet?
  function status() {
    return { aktiv: Boolean(isEnabled()), eingerichtet: telegramStatus().eingerichtet }
  }

  return { check, status }
}

let shared = null

function serverWarnings() {
  if (!shared) shared = createServerWarnings()
  return shared
}

module.exports = { exceededMetrics, createServerWarnings, serverWarnings }
