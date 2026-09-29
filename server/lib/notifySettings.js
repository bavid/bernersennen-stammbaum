'use strict'

// Phase N Task 2: Schalter der Telegram-Benachrichtigungen (Tabelle settings, Schlüssel notify_<name>, Wert '1'/'0').
// Je Ereignis ein Schalter (lib/notify.js EREIGNIS) plus details ("Details mitsenden": Name/E-Mail, Bereichsname,
// Nachrichtenanfang - aus, dann bleiben die Nachrichten ohne personenbezogene Daten). Fehlt ein Schlüssel, gilt der
// Standard unten. Gepflegt nur vom Admin (routes/adminNotify.js); routes/adminMarketing.js kennt diese Schlüssel
// bewusst nicht.

const db = require('../db')

const SCHALTER_DEFAULTS = Object.freeze({
  gutschein_anfrage: true,
  partner_anfrage: true,
  registrierung: true,
  feedback: true,
  beitrag: false,
  details: false
})
const SCHALTER_NAMES = Object.keys(SCHALTER_DEFAULTS)
const SETTING_PREFIX = 'notify_'
const ON = '1'
const OFF = '0'

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

function settingKey(name) {
  return `${SETTING_PREFIX}${name}`
}

const readStmt = db.prepare(`SELECT key, value FROM settings WHERE key IN (${SCHALTER_NAMES.map(() => '?').join(', ')})`)
const upsertStmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')

// { gutschein_anfrage, partner_anfrage, registrierung, feedback, beitrag, details } - immer alle, als Booleans.
function readNotifySettings() {
  const stored = new Map(readStmt.all(...SCHALTER_NAMES.map(settingKey)).map((row) => [row.key, row.value]))
  return Object.fromEntries(
    SCHALTER_NAMES.map((name) => {
      const value = stored.get(settingKey(name))
      if (value === ON) return [name, true]
      if (value === OFF) return [name, false]
      return [name, SCHALTER_DEFAULTS[name]]
    })
  )
}

// Teil-Update: nur bekannte Schalter, nur echte Booleans (der String "false" wäre sonst truthy). Alles in EINER
// Transaktion - ein ungültiger Wert ändert gar nichts. Gibt die neuen Einstellungen zurück.
function updateNotifySettings(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw httpError(400, 'Bitte die Schalter als Objekt senden.')
  const unknown = Object.keys(body).filter((name) => !SCHALTER_NAMES.includes(name))
  if (unknown.length) throw httpError(400, `Unbekannte Einstellung: ${unknown.join(', ')}`)
  const notBoolean = Object.keys(body).filter((name) => typeof body[name] !== 'boolean')
  if (notBoolean.length) throw httpError(400, `„${notBoolean[0]}“ muss true oder false sein`)

  db.transaction(() => {
    for (const [name, value] of Object.entries(body)) upsertStmt.run(settingKey(name), value ? ON : OFF)
  })()
  return readNotifySettings()
}

module.exports = { SCHALTER_DEFAULTS, SCHALTER_NAMES, readNotifySettings, updateNotifySettings }
