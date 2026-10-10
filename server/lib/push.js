'use strict'

// Benachrichtigungen aufs Handy (Web Push, Einstellungen › App): die Abos je Zuhause (push_abos) und der Versand zu
// genau den Ereignissen, die auch die Hinweis-Glocke zählt (routes/meineHinweise.js zahlenFor) - neuer Gruß, neue
// „Mit dabei“-Anfrage, neuer Gast. Der Text ist je Ereignis fest und nennt NIE Namen, Titel oder Inhalte (TEXTE): der
// Push-Dienst des Browser-Herstellers (Google, Apple, Mozilla) überbringt ihn zwar Ende-zu-Ende verschlüsselt (RFC 8291),
// die Glocke in der App zeigt die Einzelheiten aber ohnehin erst nach dem Anmelden. Schlüssel: VAPID (.env
// VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY, erzeugt mit `node scripts/vapid.js`) - der private Schlüssel verlässt den Server
// nie, der öffentliche geht an den Client (GET /api/push/key). Ohne Schlüssel ist alles aus (isEnabled).
// Versand asynchron (setImmediate), die auslösende Anfrage wartet nie; 404/410 vom Push-Dienst löscht das Abo (das
// Gerät hat es gekündigt), andere Fehler loggen EINE Zeile ohne Endpunkt oder Schlüssel. Demo-Zuhause lösen nie etwas
// aus. Die Tabelle legt dieses Modul selbst an (wie lib/gruesse.js); ON DELETE CASCADE: Abos gehen mit dem Zuhause.

const webpush = require('web-push')
const db = require('../db')
const config = require('../config')

db.exec(`
  CREATE TABLE IF NOT EXISTS push_abos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    keys_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_ok_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_push_abos_family ON push_abos(family_id);
`)

const EREIGNIS = Object.freeze({
  gruss: 'gruss',
  mitDabei: 'mit_dabei',
  gast: 'gast',
  kontakt: 'wwh_kontakt',
  kontaktZusage: 'wwh_kontakt_zusage'
})

// Feste Texte ohne personenbezogene Daten - die App öffnet dann die Startseite mit der Glocke.
const TEXTE = Object.freeze({
  [EREIGNIS.gruss]: Object.freeze({ titel: 'Neuer Gruß', text: 'Jemand hat eine eurer Erinnerungen gegrüßt.', url: '/start' }),
  [EREIGNIS.mitDabei]: Object.freeze({
    titel: 'Neue „Mit dabei“-Anfrage',
    text: 'Ein befreundetes Zuhause hat eines eurer Tiere in einer Erinnerung markiert.',
    url: '/start'
  }),
  [EREIGNIS.gast]: Object.freeze({ titel: 'Neuer Gast', text: 'Jemand ist jetzt bei euch zu Besuch.', url: '/start' }),
  // „Wir waren hier“ (lib/wwhKontakt.js): Kontaktwunsch über einen gemeinsamen Ort und seine Zusage.
  [EREIGNIS.kontakt]: Object.freeze({
    titel: 'Neuer Kontaktwunsch',
    text: 'Eine Familie von einem gemeinsamen Ort möchte euch kennenlernen.',
    // öffnet auf Start gleich die Glocke (client HinweiseProvider, ?hinweise=offen) - dort steht der Wunsch mit Ort
    url: '/start?hinweise=offen'
  }),
  [EREIGNIS.kontaktZusage]: Object.freeze({
    titel: 'Kontaktwunsch angenommen',
    text: 'Ihr seid jetzt zu Besuch und seht die Erinnerungen der anderen Familie.',
    url: '/start'
  })
})

const MAX_ENDPOINT_LENGTH = 2048
const MAX_KEY_LENGTH = 512
// Mehr Geräte je Zuhause braucht niemand - und niemand füllt uns die Tabelle.
const MAX_ABOS_PER_HOME = 10
const TTL_SECONDS = 24 * 60 * 60
const BASE64URL = /^[A-Za-z0-9_-]+=*$/
// Nur die Push-Dienste der Browser-Hersteller (Chrome/Android/Edge-Chromium über FCM, Firefox, Safari/iOS, Windows):
// web-push schickt jede Nachricht per POST an den Endpunkt des Abos - ohne diese Liste ließe sich der Server mit einem
// selbst gebauten "Abo" Anfragen an beliebige Adressen schicken lassen (SSRF, security-review PWA).
const PUSH_HOSTS = Object.freeze(['fcm.googleapis.com', 'android.googleapis.com', 'web.push.apple.com'])
const PUSH_HOST_SUFFIXES = Object.freeze(['.push.services.mozilla.com', '.notify.windows.com', '.push.apple.com'])

function isPushServiceHost(hostname) {
  return PUSH_HOSTS.includes(hostname) || PUSH_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
}

const countStmt = db.prepare('SELECT COUNT(*) AS c FROM push_abos WHERE family_id = ?')
const findByEndpointStmt = db.prepare('SELECT id, family_id FROM push_abos WHERE endpoint = ?')
const upsertStmt = db.prepare(
  `INSERT INTO push_abos (family_id, endpoint, keys_json) VALUES (@familyId, @endpoint, @keysJson)
   ON CONFLICT(endpoint) DO UPDATE SET family_id = excluded.family_id, keys_json = excluded.keys_json, created_at = datetime('now')`
)
const deleteStmt = db.prepare('DELETE FROM push_abos WHERE family_id = ? AND endpoint = ?')
const deleteByIdStmt = db.prepare('DELETE FROM push_abos WHERE id = ?')
const listStmt = db.prepare('SELECT id, endpoint, keys_json FROM push_abos WHERE family_id = ? ORDER BY id')
const okStmt = db.prepare("UPDATE push_abos SET last_ok_at = datetime('now') WHERE id = ?")
const homeStmt = db.prepare('SELECT is_demo, art FROM families WHERE id = ?')

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

function isEnabled() {
  return Boolean(config.vapid.publicKey && config.vapid.privateKey)
}

function publicKey() {
  return isEnabled() ? config.vapid.publicKey : null
}

function cleanKey(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_KEY_LENGTH && BASE64URL.test(value) ? value : null
}

// PushSubscription.toJSON() des Browsers: { endpoint, keys: { p256dh, auth } } - nur https-Endpunkte, begrenzte Längen.
function cleanSubscription(input) {
  if (!input || typeof input !== 'object') return null
  const { endpoint, keys } = input
  if (typeof endpoint !== 'string' || endpoint.length > MAX_ENDPOINT_LENGTH) return null
  try {
    const url = new URL(endpoint)
    if (url.protocol !== 'https:' || url.port !== '' || url.username || url.password || !isPushServiceHost(url.hostname)) return null
  } catch {
    return null
  }
  const p256dh = cleanKey(keys?.p256dh)
  const auth = cleanKey(keys?.auth)
  if (!p256dh || !auth) return null
  return { endpoint, keys: { p256dh, auth } }
}

// Abo eines Geräts für das Zuhause familyId speichern (derselbe Endpunkt noch einmal: aktualisieren).
function saveAbo(familyId, input) {
  const subscription = cleanSubscription(input)
  if (!subscription) throw httpError(400, 'Dieses Abo ist unvollständig oder ungültig')
  const existing = findByEndpointStmt.get(subscription.endpoint)
  if (!existing && countStmt.get(familyId).c >= MAX_ABOS_PER_HOME) {
    throw httpError(409, `Höchstens ${MAX_ABOS_PER_HOME} Geräte je Zuhause – schaltet die Benachrichtigungen auf einem anderen Gerät aus.`)
  }
  upsertStmt.run({ familyId, endpoint: subscription.endpoint, keysJson: JSON.stringify(subscription.keys) })
  return { endpoint: subscription.endpoint }
}

function deleteAbo(familyId, endpoint) {
  if (typeof endpoint !== 'string' || endpoint.length > MAX_ENDPOINT_LENGTH) return false
  return deleteStmt.run(familyId, endpoint).changes > 0
}

function countAbos(familyId) {
  return countStmt.get(familyId).c
}

function payloadFor(ereignis) {
  const text = TEXTE[ereignis]
  if (!text) throw new Error(`Unbekanntes Push-Ereignis: ${ereignis}`)
  return { ...text, ereignis }
}

function defaultSender(subscription, payload) {
  return webpush.sendNotification(subscription, payload, {
    TTL: TTL_SECONDS,
    urgency: 'normal',
    vapidDetails: { subject: config.vapid.subject, publicKey: config.vapid.publicKey, privateKey: config.vapid.privateKey }
  })
}

let sender = defaultSender

// Tests ersetzen den Versand (keine echten Anfragen an Push-Dienste).
function setSenderForTests(fn) {
  sender = fn || defaultSender
}

// Verschickt ein Ereignis an alle Geräte des Zuhauses - wartet auf jeden Versuch; 404/410 löscht das Abo.
async function deliver(homeId, ereignis) {
  const payload = JSON.stringify(payloadFor(ereignis))
  let sent = 0
  for (const abo of listStmt.all(homeId)) {
    const subscription = { endpoint: abo.endpoint, keys: JSON.parse(abo.keys_json) }
    try {
      await sender(subscription, payload)
      okStmt.run(abo.id)
      sent += 1
    } catch (err) {
      const status = err?.statusCode
      if (status === 404 || status === 410) deleteByIdStmt.run(abo.id)
      else console.warn(`Push-Benachrichtigung fehlgeschlagen (${status || err?.code || 'Fehler'})`)
    }
  }
  return sent
}

// Aus den Routen: nie warten, nur für echte Zuhause, nichts ohne Schlüssel.
function notifyHome(homeId, ereignis) {
  if (!isEnabled() || !Number.isInteger(homeId)) return false
  // Nur Zuhause - wie die Glocke (routes/meineHinweise.js); Demo-Zuhause nie.
  const home = homeStmt.get(homeId)
  if (!home || home.is_demo || home.art !== 'zuhause') return false
  setImmediate(() => {
    deliver(homeId, ereignis).catch((err) => console.warn(`Push-Benachrichtigung fehlgeschlagen (${err?.code || 'Fehler'})`))
  })
  return true
}

module.exports = {
  EREIGNIS,
  TEXTE,
  MAX_ABOS_PER_HOME,
  isEnabled,
  publicKey,
  cleanSubscription,
  saveAbo,
  deleteAbo,
  countAbos,
  payloadFor,
  deliver,
  notifyHome,
  setSenderForTests
}
