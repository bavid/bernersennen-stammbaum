'use strict'

// Digitaler Bilderrahmen: kurzlebige, signierte Foto-Adressen für ein Rahmen-Gerät (lib/rahmenGeraete.js). Ein <img>
// kann keinen Header mitschicken - also trägt die Adresse selbst den Nachweis: /rahmen-foto/<datei>?g=<gerät>&exp=<unix>&sig=…
// sig ist ein HMAC über Datei, Gerät und Ablauf mit einem eigenen, aus CODE_PEPPER abgeleiteten Schlüssel (Domänen-
// Trennung wie lib/codes.js deriveKey: eine Foto-Signatur taugt nie als Token-Hash und umgekehrt). Die Prüfung hier ist nur
// die Form und die Signatur - ob das Gerät noch lebt und das Foto noch dazugehört, prüft routes/rahmen.js danach.

const crypto = require('node:crypto')
const { codePepper } = require('../config')
const { FILENAME_RE } = require('./uploadAccess')

// Gültig 60 bis 120 Minuten: auf die volle Stunde aufgerundet, damit dieselbe Adresse beim Nachladen der Liste (das Gerät
// fragt alle 10 Minuten) eine Stunde lang gleich bleibt und der Browser das Foto aus seinem Speicher nehmen kann. Ein
// Widerruf wirkt trotzdem sofort - jede Auslieferung prüft das Gerät (routes/rahmen.js).
const MIN_VALIDITY_SECONDS = 60 * 60
const ROUND_SECONDS = 60 * 60
const MAX_VALIDITY_SECONDS = MIN_VALIDITY_SECONDS + ROUND_SECONDS

const DEVICE_ID_RE = /^[1-9]\d{0,9}$/
const EXP_RE = /^\d{10}$/
const SIG_RE = /^[A-Za-z0-9_-]{43}$/

const signKey = crypto.createHash('sha256').update(`${codePepper}:rahmen-foto`).digest()

function nowSeconds() {
  return Math.floor(Date.now() / 1000)
}

function signatureFor(filename, deviceId, exp) {
  return crypto.createHmac('sha256', signKey).update(`${filename}\n${deviceId}\n${exp}`).digest('base64url')
}

// Ablaufzeit (Unix-Sekunden) für Adressen, die jetzt ausgegeben werden.
function expiryFor(now = nowSeconds()) {
  return Math.ceil((now + MIN_VALIDITY_SECONDS) / ROUND_SECONDS) * ROUND_SECONDS
}

function signedFotoUrl(filename, deviceId, exp) {
  const query = new URLSearchParams({ g: String(deviceId), exp: String(exp), sig: signatureFor(filename, deviceId, exp) })
  return `/rahmen-foto/${filename}?${query.toString()}`
}

// { filename, deviceId } oder null - für jede Form-, Ablauf- oder Signaturabweichung. Strenger Dateiname (wie
// lib/uploadAccess.js): kein "/", kein "..", kein "%", also auch kein Weg aus dem Upload-Ordner heraus.
function verifyFotoRequest({ filename, g, exp, sig }, now = nowSeconds()) {
  if (typeof filename !== 'string' || !FILENAME_RE.test(filename)) return null
  if (typeof g !== 'string' || !DEVICE_ID_RE.test(g)) return null
  if (typeof exp !== 'string' || !EXP_RE.test(exp)) return null
  if (typeof sig !== 'string' || !SIG_RE.test(sig)) return null
  const expiry = Number(exp)
  if (expiry <= now || expiry > now + MAX_VALIDITY_SECONDS) return null
  const expected = Buffer.from(signatureFor(filename, Number(g), expiry))
  const given = Buffer.from(sig)
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null
  return { filename, deviceId: Number(g), exp: expiry }
}

module.exports = { expiryFor, signedFotoUrl, verifyFotoRequest, signatureFor, nowSeconds, MAX_VALIDITY_SECONDS }
