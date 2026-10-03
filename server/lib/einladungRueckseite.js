'use strict'

// Einladungskarten: die Rückseite gestaltet Familie auf Pfoten, nicht der Partner - Titel, ein kurzer Text, bis zu drei
// Schritte ("So geht's") und die gezeigte Adresse. Gepflegt im Admin (Reiter "Einstellungen", routes/adminEinladungskarte.js),
// gelesen von jedem Partner mit seiner Gestaltung (routes/partnerArea/visitenkarte.js) - ein Wert für alle Karten, als JSON
// unter dem Schlüssel einladung_rueckseite in der Tabelle settings (routes/adminMarketing.js kennt ihn bewusst nicht).
// Reiner Text (Steuer-, Bidi- und unsichtbare Zeichen raus, kein HTML) - der Client zeigt ihn nur als Text. adresse ''
// heißt "automatisch": der Client zeigt dann die Adresse, auf die auch der QR-Code zeigt (PUBLIC_URL bzw. der Ursprung der
// Seite, plus /v). Der QR-Code selbst zeigt immer auf diese echte Adresse - die gezeigte ist nur Text.

const db = require('../db')
const { stripUnsafeChars } = require('./partners')

const SETTING_KEY = 'einladung_rueckseite'
const VORGABEN = Object.freeze({
  titel: 'Eure Tierchronik – geschenkt',
  text: 'Familie auf Pfoten hält fest, was eure Tiere erleben – für euch und eure Familie. Ohne Tracking, ohne Datenhandel.',
  schritte: Object.freeze(['QR-Code scannen oder Adresse öffnen', 'Code eingeben', 'Tiere anlegen und loslegen']),
  adresse: ''
})
const LIMITS = Object.freeze({ titel: 60, text: 240, schritt: 60, schritte: 3, adresse: 60 })
const FIELDS = Object.freeze(['titel', 'text', 'schritte', 'adresse'])
// Leere Schritt-Felder des Formulars zählen nicht - mehr Einträge als das nimmt aber niemand an.
const MAX_STEP_ENTRIES = 6
// Obergrenze vor dem Säubern (Nummer vor dem Schritt, Schema vor der Adresse) - geprüft wird danach mit LIMITS.
const MAX_RAW_LENGTH = 200

const HTML_RE = /[<>]/
// Wie lib/visitenkarteDesign.js: unsichtbare Zeichen, die stripUnsafeChars nicht kennt - auf Papier nur zum Täuschen gut.
const INVISIBLE_RE = /[\u200B\u200E\u200F\u2060\u061C\uFEFF\u2028\u2029]/g
// "1. ", "2) " vor einem Schritt - die Karte nummeriert selbst.
const STEP_NUMBER_RE = /^\d+\s*[.)]\s*/
const SCHEME_RE = /^https?:\/\//i
// Host mit Punkt und Buchstaben-Endung (kein localhost, keine IP), optional Port und Pfad aus einfachen Zeichen - keine
// Abfrage, keine Raute, kein Leerzeichen.
const ADRESSE_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(:\d{1,5})?(\/[a-z0-9._~-]+)*$/i

const ADRESSE_MESSAGE = 'Die Adresse bitte ohne Leerzeichen angeben, z. B. familie-auf-pfoten.de/v.'

// Ein unbekannter Schlüssel kommt gekürzt in die Fehlermeldung.
const MAX_KEY_ECHO = 40

function httpError(status, message, feld) {
  const err = new Error(message)
  err.status = status
  if (feld) err.feld = feld
  return err
}

// Eine Zeile reiner Text: gesäubert, Leerraum zusammengezogen, höchstens max Zeichen.
function cleanLine(value, { feld, label, max }) {
  if (typeof value !== 'string') throw httpError(400, `${label} muss Text sein.`, feld)
  const text = stripUnsafeChars(value, { allowNewline: true }).replace(INVISIBLE_RE, '').replace(/\s+/g, ' ').trim()
  if (HTML_RE.test(text)) throw httpError(400, `${label}: bitte nur reinen Text (kein HTML).`, feld)
  if (text.length > max) throw httpError(400, `${label} darf höchstens ${max} Zeichen haben.`, feld)
  return text
}

function required(value, options) {
  const text = cleanLine(value, options)
  if (!text) throw httpError(400, `Bitte gib einen ${options.label.replace(/^Der /, '')} an.`, options.feld)
  return text
}

function validateSchritte(value) {
  if (!Array.isArray(value)) throw httpError(400, 'Die Schritte bitte als Liste senden.', 'schritte')
  if (value.length > MAX_STEP_ENTRIES) throw httpError(400, 'Höchstens drei Schritte.', 'schritte')
  const schritte = value.map((step, index) => {
    const feld = `schritt${index + 1}`
    const label = `Schritt ${index + 1}`
    const text = cleanLine(step, { feld, label, max: MAX_RAW_LENGTH }).replace(STEP_NUMBER_RE, '')
    if (text.length > LIMITS.schritt) throw httpError(400, `${label} darf höchstens ${LIMITS.schritt} Zeichen haben.`, feld)
    return text
  })
  const filled = schritte.filter(Boolean)
  if (filled.length > LIMITS.schritte) throw httpError(400, 'Höchstens drei Schritte.', 'schritte')
  return filled
}

function validateAdresse(value) {
  const text = cleanLine(value, { feld: 'adresse', label: 'Die Adresse', max: MAX_RAW_LENGTH }).replace(SCHEME_RE, '').replace(/\/+$/, '')
  if (!text) return ''
  if (text.length > LIMITS.adresse) throw httpError(400, `Die Adresse darf höchstens ${LIMITS.adresse} Zeichen haben.`, 'adresse')
  if (!ADRESSE_RE.test(text)) throw httpError(400, ADRESSE_MESSAGE, 'adresse')
  const [host, ...path] = text.split('/')
  return [host.toLowerCase(), ...path].join('/')
}

// Die ganze Rückseite auf einmal (PUT ersetzt sie): jedes Feld muss da sein, unbekannte Felder -> 400.
function validateRueckseite(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw httpError(400, 'Bitte die Rückseite als Objekt senden.')
  const unknown = Object.keys(body).find((key) => !FIELDS.includes(key))
  if (unknown !== undefined) throw httpError(400, `Unbekannte Einstellung: ${unknown.slice(0, MAX_KEY_ECHO)}`)
  const missing = FIELDS.find((key) => !Object.hasOwn(body, key))
  if (missing !== undefined) throw httpError(400, `Es fehlt: ${missing}`)
  return {
    titel: required(body.titel, { feld: 'titel', label: 'Der Titel', max: LIMITS.titel }),
    text: required(body.text, { feld: 'text', label: 'Der Text', max: LIMITS.text }),
    schritte: validateSchritte(body.schritte),
    adresse: validateAdresse(body.adresse)
  }
}

function vorgaben() {
  return { ...VORGABEN, schritte: [...VORGABEN.schritte] }
}

const readStmt = db.prepare('SELECT value FROM settings WHERE key = ?')
const upsertStmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')

// Die geltende Rückseite - ohne Eintrag die Vorgaben; ein kaputter Eintrag (geprüft wie beim Speichern) ebenso, mit
// einer Warnung ohne Inhalt.
function readRueckseite() {
  const row = readStmt.get(SETTING_KEY)
  if (!row) return vorgaben()
  try {
    return validateRueckseite(JSON.parse(row.value))
  } catch {
    console.warn('[admin] Einladungskarte – Rückseite: gespeicherter Wert ungültig, nehme die Vorgaben')
    return vorgaben()
  }
}

// Prüft und speichert; changed: ob sich etwas geändert hat (nur dann ein Eintrag im Admin-Protokoll).
function saveRueckseite(body) {
  const clean = validateRueckseite(body)
  const changed = !readStmt.get(SETTING_KEY) || JSON.stringify(clean) !== JSON.stringify(readRueckseite())
  if (changed) upsertStmt.run(SETTING_KEY, JSON.stringify(clean))
  return { rueckseite: clean, changed }
}

module.exports = { SETTING_KEY, VORGABEN, LIMITS, validateRueckseite, readRueckseite, saveRueckseite, vorgaben }
