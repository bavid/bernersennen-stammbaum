'use strict'

// Phase N Task 2: Telegram-Benachrichtigungen für den Admin. notify(ereignis, daten) prüft Schalter
// (lib/notifySettings.js), Zugangsdaten (lib/telegramConfig.js) und Demo, baut den Text und verschickt ihn
// asynchron - die auslösende Anfrage wartet nie darauf (setImmediate, das Versprechen wird von der Route nicht
// abgewartet). Höchstens MAX_ATTEMPTS Versuche mit Pause; ein endgültiger Fehler wird als EINE Zeile ohne Inhalt
// geloggt ("Telegram-Benachrichtigung fehlgeschlagen (<Status oder Fehlercode>)") - nie Text, Token oder Chat-ID.
//
// Datenschutz: Telegram ist ein externer Dienst. Standard sind Texte OHNE personenbezogene Daten ("Neue
// Gutschein-Anfrage – im Admin ansehen"); erst der Schalter "Details mitsenden" (details) nimmt Name/E-Mail,
// Bereichs- bzw. Partnername, Beitragstitel oder den Anfang einer Nachricht mit. Reiner Text ohne parse_mode; Details
// werden entschärft (eine Zeile je Angabe, "https://" -> "https[:]//", "@" -> "(at)"), damit Nutzereingaben weder
// Zeilen vortäuschen noch anklickbare Links oder Erwähnungen ergeben.
// Demo-Inhalte (Demo-Sitzungen, Demo-Bereiche, Demo-Partner) lösen nie etwas aus (daten.demo). Eine Anfrage aus einer
// Demo-Sitzung ist dagegen eine echte Anfrage eines Besuchers und meldet sich wie jede andere (routes/anfragen.js).
//
// Obergrenze je Server-Prozess, in zwei Töpfen (security-review Phase N): Anfragen (ohne Login auslösbar) höchstens
// CAP_ANFRAGEN_PER_WINDOW, alles andere (Registrierung, Feedback, Beitrag) höchstens CAP_PER_WINDOW Nachrichten in
// einer gleitenden Stunde - eine Flut anonymer Anfragen verdrängt so nie die übrigen Hinweise. Je Topf wird die
// nächste Nachricht durch EINE Warnung ersetzt, danach fällt in diesem Topf eine Stunde lang alles weg; das Ende der
// Pause loggt EINE Zeile mit der Anzahl der nicht gemeldeten Ereignisse (ohne Inhalt). Die Testnachricht zählt nie mit.

const { readNotifySettings } = require('./notifySettings')
const { telegramCredentials } = require('./telegramConfig')
const { telegramClient, isRejectedByTelegram } = require('./telegram')
const { stripUnsafeChars } = require('./partners')

const EREIGNIS = Object.freeze({
  gutscheinAnfrage: 'gutschein_anfrage',
  partnerAnfrage: 'partner_anfrage',
  registrierung: 'registrierung',
  feedback: 'feedback',
  beitrag: 'beitrag'
})
const EREIGNIS_VALUES = Object.values(EREIGNIS)

const MAX_ATTEMPTS = 3
const RETRY_DELAYS_MS = Object.freeze([1000, 3000])
const DETAIL_MAX_LENGTH = 200
const PAW = '🐾'
const TEST_TEXT = `${PAW} Testnachricht von Familie auf Pfoten – die Benachrichtigungen kommen an.`
const FAILURE_LOG = 'Telegram-Benachrichtigung fehlgeschlagen'
// Nur Fehlercodes wie ECONNRESET/ETIMEDOUT landen im Log - alles andere als "unbekannt".
const SAFE_CODE_RE = /^[A-Z][A-Z0-9_]{1,39}$/
const CAP_PER_WINDOW = 20
const CAP_ANFRAGEN_PER_WINDOW = 10
const CAP_WINDOW_MS = 60 * 60 * 1000
const CAP_WARNING_TEXT = '⚠️ Viele neue Ereignisse – weitere Benachrichtigungen pausieren für diese Stunde. Details im Admin.'
const CAP_ANFRAGEN_WARNING_TEXT = '⚠️ Viele neue Anfragen – weitere Hinweise zu Anfragen pausieren für diese Stunde. Details im Admin.'
const CAP = Object.freeze({ send: 'send', warn: 'warn', drop: 'drop' })
const CAP_BUCKETS = Object.freeze({
  anfragen: Object.freeze({ limit: CAP_ANFRAGEN_PER_WINDOW, warning: CAP_ANFRAGEN_WARNING_TEXT, label: 'Anfragen' }),
  allgemein: Object.freeze({ limit: CAP_PER_WINDOW, warning: CAP_WARNING_TEXT, label: 'übrige Ereignisse' })
})
const ANFRAGEN_EREIGNISSE = Object.freeze([EREIGNIS.gutscheinAnfrage, EREIGNIS.partnerAnfrage])

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

// --- Texte ---------------------------------------------------------------------------------------

const HEADLINES = Object.freeze({
  [EREIGNIS.gutscheinAnfrage]: () => `${PAW} Neue Gutschein-Anfrage – im Admin unter „Anfragen“ ansehen.`,
  [EREIGNIS.partnerAnfrage]: () => `${PAW} Neue Anfrage für einen Partner-Zugang – im Admin unter „Anfragen“ ansehen.`,
  [EREIGNIS.registrierung]: (daten) =>
    daten.art === 'partner'
      ? `${PAW} Ein Partner-Zugang wurde eingelöst – ein neuer Partner richtet sich ein.`
      : `${PAW} Neue Registrierung – mit einem Gutschein ist ein neuer Bereich entstanden.`,
  [EREIGNIS.feedback]: (daten) =>
    daten.typ === 'problem'
      ? `${PAW} Neue Problemmeldung über „Schreib dem Admin“ – im Admin unter den Nachrichten ansehen.`
      : `${PAW} Neues Feedback über „Schreib dem Admin“ – im Admin unter den Nachrichten ansehen.`,
  // V-Fehler 3: ein vertrauenswürdiger Partner hat einen freigegebenen Beitrag geändert - schon online, nur zur Kenntnis.
  [EREIGNIS.beitrag]: (daten) =>
    daten.vertrauenswuerdig
      ? `${PAW} Ein Partner hat einen freigegebenen Beitrag geändert (vertrauenswürdig) – die Änderung ist schon online.`
      : `${PAW} Ein Partner hat einen Beitrag eingereicht – bitte im Admin prüfen und freigeben.`
})

// Nur mit "Details mitsenden": [Beschriftung, Wert] - leere Werte fallen weg.
const DETAILS = Object.freeze({
  [EREIGNIS.gutscheinAnfrage]: (daten) => [['Name', daten.name], ['E-Mail', daten.email]],
  [EREIGNIS.partnerAnfrage]: (daten) => [['Firma', daten.firma], ['Art', daten.partnerTyp], ['Name', daten.name], ['E-Mail', daten.email]],
  [EREIGNIS.registrierung]: (daten) => [[daten.art === 'partner' ? 'Partner' : 'Bereich', daten.name]],
  [EREIGNIS.feedback]: (daten) => [['Nachricht', daten.text]],
  [EREIGNIS.beitrag]: (daten) => [['Partner', daten.partnerName], ['Titel', daten.titel]]
})

// Nutzereingaben entschärfen: jeder Leerraum (auch Zeilenumbrüche) wird ein Leerzeichen - keine vorgetäuschten
// "Beschriftung: Wert"-Zeilen; "://" -> "[:]//" und "@" -> "(at)" - keine anklickbaren Links, Mails oder Erwähnungen.
function neutralize(text) {
  return text.replace(/\s+/g, ' ').replace(/:\/\//g, '[:]//').replace(/@/g, '(at)')
}

// Reiner, entschärfter Text ohne Steuer-/Bidi-Zeichen, höchstens DETAIL_MAX_LENGTH Zeichen (danach "…"). Gezählt wird
// in Unicode-Zeichen statt UTF-16-Einheiten - sonst könnte der Schnitt ein Emoji zerreißen (ein halbes Ersatzzeichen
// ist kein gültiger Text, Telegram lehnt die Nachricht womöglich ab).
function detailValue(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return ''
  const chars = Array.from(neutralize(stripUnsafeChars(String(value), { allowNewline: true })).trim())
  return chars.length > DETAIL_MAX_LENGTH ? `${chars.slice(0, DETAIL_MAX_LENGTH).join('')}…` : chars.join('')
}

function buildText(ereignis, daten = {}, { details = false } = {}) {
  const headline = HEADLINES[ereignis](daten)
  if (!details) return headline
  const lines = DETAILS[ereignis](daten)
    .map(([label, value]) => [label, detailValue(value)])
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}: ${value}`)
  return [headline, ...lines].join('\n')
}

// --- Versand -------------------------------------------------------------------------------------

const DEFAULT_RUNTIME = Object.freeze({
  sender: (message) => telegramClient().sendMessage(message),
  retryDelaysMs: RETRY_DELAYS_MS,
  logger: console,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now()
})
const EMPTY_CAP_STATE = Object.freeze({ sent: Object.freeze([]), pausedUntil: null, dropped: 0 })
const EMPTY_CAP_STATES = Object.freeze({ anfragen: EMPTY_CAP_STATE, allgemein: EMPTY_CAP_STATE })
let runtime = DEFAULT_RUNTIME
let capStates = EMPTY_CAP_STATES
const inFlight = new Set()

// Nur für Tests: sender, retryDelaysMs, logger, sleep, now (Uhr) und telegram (Zugangsdaten, null = nicht
// eingerichtet) austauschen - setzt auch die Obergrenzen zurück. Gibt restore() zurück.
function setNotifyRuntimeForTests(overrides) {
  runtime = { ...DEFAULT_RUNTIME, ...overrides }
  capStates = EMPTY_CAP_STATES
  return () => {
    runtime = DEFAULT_RUNTIME
    capStates = EMPTY_CAP_STATES
  }
}

function bucketOf(ereignis) {
  return ANFRAGEN_EREIGNISSE.includes(ereignis) ? 'anfragen' : 'allgemein'
}

// Nächster Zustand eines Topfs und die Entscheidung: 'send' (zählt mit), 'warn' (die Warnung statt dieses
// Ereignisses, Pause beginnt) oder 'drop'. Nach der Pause EINE Logzeile mit der Anzahl der weggefallenen Ereignisse.
function nextCapState(state, bucket, now) {
  let current = state
  if (current.pausedUntil !== null) {
    if (now < current.pausedUntil) return { decision: CAP.drop, state: { ...current, dropped: current.dropped + 1 } }
    runtime.logger.warn(`Telegram-Benachrichtigungen pausiert (${bucket.label}) – nicht gemeldete Ereignisse: ${current.dropped}`)
    current = { ...current, pausedUntil: null, dropped: 0 }
  }
  const recent = current.sent.filter((sentAt) => sentAt > now - CAP_WINDOW_MS)
  if (recent.length < bucket.limit) return { decision: CAP.send, state: { ...current, sent: [...recent, now] } }
  return { decision: CAP.warn, state: { sent: recent, pausedUntil: now + CAP_WINDOW_MS, dropped: 1 } }
}

function admitToCap(ereignis, now) {
  const name = bucketOf(ereignis)
  const { decision, state } = nextCapState(capStates[name], CAP_BUCKETS[name], now)
  capStates = { ...capStates, [name]: state }
  return { decision, warning: CAP_BUCKETS[name].warning }
}

function currentCredentials() {
  if (Object.hasOwn(runtime, 'telegram')) return runtime.telegram
  return telegramCredentials({ logger: runtime.logger })
}

function failureReason(err) {
  if (Number.isInteger(err?.upstreamStatus)) return String(err.upstreamStatus)
  if (Number.isInteger(err?.status)) return String(err.status)
  if (typeof err?.code === 'string' && SAFE_CODE_RE.test(err.code)) return err.code
  return 'unbekannt'
}

// true = angekommen, false = aufgegeben (geloggt). Wirft nie. Ein "Nein" von Telegram (falscher Token, unbekannter
// Chat) wird nicht wiederholt - Zeitüberschreitung, Verbindungsfehler, 5xx und 429 schon.
async function deliver(credentials, text, maxAttempts) {
  const { sender, retryDelaysMs, logger, sleep } = runtime
  for (let attempt = 1; ; attempt += 1) {
    try {
      await sender({ token: credentials.botToken, chatId: credentials.chatId, text })
      return true
    } catch (err) {
      if (attempt >= maxAttempts || isRejectedByTelegram(err)) {
        logger.warn(`${FAILURE_LOG} (${failureReason(err)})`)
        return false
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

// Löst die Benachrichtigung aus, wenn der Schalter an ist, Telegram eingerichtet ist, es keine Demo ist und die
// Obergrenze nicht pausiert (an der Grenze geht stattdessen die Warnung raus). Gibt das Versprechen des Versands
// zurück (true/false) oder null, wenn nichts verschickt wird - Routen warten nie darauf.
// Wirft nie: die auslösende Aktion ist schon erledigt und darf nicht an einer Benachrichtigung scheitern.
function notify(ereignis, daten = {}) {
  try {
    if (!EREIGNIS_VALUES.includes(ereignis)) {
      runtime.logger.warn('Unbekanntes Benachrichtigungs-Ereignis – nichts verschickt.')
      return null
    }
    if (daten?.demo) return null
    const credentials = currentCredentials()
    if (!credentials) return null
    const settings = readNotifySettings()
    if (!settings[ereignis]) return null
    const { decision, warning } = admitToCap(ereignis, runtime.now())
    if (decision === CAP.drop) return null
    const text = decision === CAP.warn ? warning : buildText(ereignis, daten ?? {}, { details: settings.details })
    const delivery = new Promise((resolve) => setImmediate(resolve)).then(() => deliver(credentials, text, MAX_ATTEMPTS))
    return track(delivery)
  } catch (err) {
    runtime.logger.warn(`${FAILURE_LOG} (${failureReason(err)})`)
    return null
  }
}

// POST /api/admin/notify-test: einmal, ohne Wiederholung, abgewartet, an der Obergrenze vorbei. true/false; 409, wenn
// nicht eingerichtet.
async function sendTestMessage() {
  const credentials = currentCredentials()
  if (!credentials) throw httpError(409, 'Telegram ist nicht eingerichtet.')
  return deliver(credentials, TEST_TEXT, 1)
}

// Nur für Tests: wartet, bis alle ausgelösten Benachrichtigungen durch sind.
async function flushNotificationsForTests() {
  while (inFlight.size) await Promise.allSettled([...inFlight])
}

module.exports = {
  EREIGNIS,
  MAX_ATTEMPTS,
  RETRY_DELAYS_MS,
  CAP_PER_WINDOW,
  CAP_ANFRAGEN_PER_WINDOW,
  CAP_WINDOW_MS,
  CAP_WARNING_TEXT,
  CAP_ANFRAGEN_WARNING_TEXT,
  buildText,
  notify,
  sendTestMessage,
  setNotifyRuntimeForTests,
  flushNotificationsForTests
}
