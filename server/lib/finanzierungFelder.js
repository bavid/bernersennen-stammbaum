'use strict'

// Gemeinsame Feldprüfungen von „So finanzieren wir uns“ - lib/finanzierung.js (Hinweis, Ziel, Quartale) und
// lib/finanzierungKosten.js (laufende Kosten) prüfen Text, Beträge und Daten gleich. Reiner Text (Steuer-/Bidi-Zeichen raus,
// kein HTML), Beträge in ganzen Cent, Daten als 'JJJJ-MM-TT'. Fehler tragen status 400 und das Feld, damit die Formulare
// sie direkt am Feld zeigen.

const { stripUnsafeChars } = require('./partners')
const { isIsoDate } = require('./validate')

// Wie lib/promotions.js MAX_CENTS: zehn Millionen Euro reichen.
const MAX_CENTS = 1e9

const HTML_RE = /[<>]/
// Wie lib/einladungRueckseite.js: unsichtbare Zeichen, die stripUnsafeChars nicht kennt.
const INVISIBLE_RE = /[\u200B\u200E\u200F\u2060\u061C\uFEFF\u2028\u2029]/g
const MAX_KEY_ECHO = 40

function httpError(status, message, feld) {
  const err = new Error(message)
  err.status = status
  if (feld) err.feld = feld
  return err
}

function assertKnownFields(body, fields) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw httpError(400, 'Bitte die Angaben als Objekt senden.')
  const unknown = Object.keys(body).find((key) => !fields.includes(key))
  if (unknown !== undefined) throw httpError(400, `Unbekanntes Feld: ${unknown.slice(0, MAX_KEY_ECHO)}`)
}

// Reiner Text: gesäubert, höchstens max Zeichen; mehrzeilig behält Zeilenumbrüche (Spendenkonto, Verwendungszweck).
// undefined/null zählen als leer. Liefert '' für leer.
function cleanText(value, { feld, label, max, multiline = false }) {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') throw httpError(400, `${label} muss Text sein.`, feld)
  const stripped = stripUnsafeChars(value, { allowNewline: multiline }).replace(INVISIBLE_RE, '')
  const text = multiline
    ? stripped
        .split('\n')
        .map((line) => line.replace(/[ \t]+/g, ' ').trim())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    : stripped.replace(/\s+/g, ' ').trim()
  if (HTML_RE.test(text)) throw httpError(400, `${label}: bitte nur reinen Text (kein HTML).`, feld)
  if (text.length > max) throw httpError(400, `${label} darf höchstens ${max} Zeichen haben.`, feld)
  return text
}

// Ganze Cent, min (Vorgabe 0) bis MAX_CENTS. required: fehlend -> Fehler, sonst null.
function cleanCents(value, { feld, label, required = false, min = 0 }) {
  if (value === undefined || value === null || value === '') {
    if (required) throw httpError(400, `${label} fehlt.`, feld)
    return null
  }
  if (!Number.isInteger(value) || value < min || value > MAX_CENTS) {
    throw httpError(400, `${label}: bitte einen Betrag in ganzen Cent zwischen ${min} und ${MAX_CENTS} senden.`, feld)
  }
  return value
}

// Ein Datum 'JJJJ-MM-TT'. required: fehlend -> Fehler, sonst null.
function cleanIsoDate(value, { feld, label, required = false }) {
  if (value === undefined || value === null || value === '') {
    if (required) throw httpError(400, `${label}: bitte ein Datum (JJJJ-MM-TT) angeben.`, feld)
    return null
  }
  if (!isIsoDate(value)) throw httpError(400, `${label}: bitte ein gültiges Datum (JJJJ-MM-TT).`, feld)
  return value
}

module.exports = { MAX_CENTS, httpError, assertKnownFields, cleanText, cleanCents, cleanIsoDate }
