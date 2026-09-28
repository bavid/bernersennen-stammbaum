'use strict'

// Empfehlungen/Anzeigen im Reiter "Entdecken" (Phase 3 Task 1) - Admin pflegt sie über
// routes/adminMarketing.js. Nie Züchter: assertNoBreeder prüft Titel, Text und "Empfehlung von" wie
// lib/partners.js es für Partner-Texte tut (docs/superpowers/plans/2026-09-29-phase-3-entdecken.md).

const { stripUnsafeChars, sanitizeExternalUrl } = require('./partners')
const { assertNoBreeder } = require('./breederGuard')
const { isIsoDate, cleanId } = require('./validate')

const MAX_TITEL_LENGTH = 120
const MAX_TEXT_LENGTH = 600
const MAX_EMPFOHLEN_VON_LENGTH = 120
const MAX_URL_LENGTH = 300

const BEREICH_VALUES = ['futter', 'hundeschule', 'begleiter', 'unterstuetzen']
const KENNZEICHNUNG_VALUES = ['Anzeige', 'Empfehlung', 'Partner']
const TIERART_VALUES = ['hund', 'katze', 'anderes']

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

// Steuer-/Bidi-Zeichen raus (stripUnsafeChars aus lib/partners.js), dann trimmen - wie bei Partner-Texten.
function cleanTextInput(value) {
  return typeof value === 'string' ? stripUnsafeChars(value).trim() : ''
}

function cleanRequiredText(value, maxLength, label) {
  const trimmed = cleanTextInput(value)
  if (!trimmed) throw httpError(400, `${label} ist Pflicht`)
  if (trimmed.length > maxLength) throw httpError(400, `${label} darf höchstens ${maxLength} Zeichen haben`)
  return trimmed
}

// undefined/null/'' -> kein Wunsch (null), sonst geprüft und getrimmt.
function cleanOptionalText(value, maxLength, label) {
  if (value === undefined || value === null || value === '') return null
  const trimmed = cleanTextInput(value)
  if (!trimmed) return null
  if (trimmed.length > maxLength) throw httpError(400, `${label} darf höchstens ${maxLength} Zeichen haben`)
  return trimmed
}

function validateBereich(value) {
  if (!BEREICH_VALUES.includes(value)) throw httpError(400, `Bereich muss einer von ${BEREICH_VALUES.join(', ')} sein`)
  return value
}

function validateKennzeichnung(value) {
  if (!KENNZEICHNUNG_VALUES.includes(value)) {
    throw httpError(400, `Kennzeichnung muss einer von ${KENNZEICHNUNG_VALUES.join(', ')} sein`)
  }
  return value
}

function validateTierart(value) {
  if (value === undefined || value === null || value === '') return null
  if (!TIERART_VALUES.includes(value)) throw httpError(400, `Tierart muss einer von ${TIERART_VALUES.join(', ')} sein`)
  return value
}

// http(s), normalisiert (sanitizeExternalUrl aus lib/partners.js liefert new URL().href oder null) -
// anders als validateUrl in partners.js wirft diese Variante bei ungültigem Wert, statt ihn stillschweigend
// zu verwerfen (eine externe, unsichere Quelle gibt es hier nicht).
function validateUrl(value, label, maxLength = MAX_URL_LENGTH) {
  if (value === undefined || value === null || value === '') return null
  const trimmed = cleanTextInput(value)
  if (!trimmed) return null
  const href = sanitizeExternalUrl(trimmed, maxLength)
  if (!href) throw httpError(400, `${label}: ungültige Adresse`)
  return href
}

function validateDate(value, label) {
  if (value === undefined || value === null || value === '') return null
  if (!isIsoDate(value)) throw httpError(400, `${label}: ungültiges Datum (JJJJ-MM-TT)`)
  return value
}

// db optional (z. B. für isolierte Aufrufe ohne Datenbank) - ist es gesetzt, muss partner_id auf einen
// bestehenden Partner zeigen.
function validatePartnerId(value, db) {
  if (value === undefined || value === null || value === '') return null
  const id = cleanId(value)
  if (!id || Number.isNaN(id)) throw httpError(400, 'Diesen Partner gibt es nicht')
  if (db && !db.prepare('SELECT 1 FROM partners WHERE id = ?').get(id)) {
    throw httpError(400, 'Diesen Partner gibt es nicht')
  }
  return id
}

// Validiert und normalisiert die Eingabe für POST/PUT /api/admin/promotions. is_demo/bild_file gehören
// bewusst nicht dazu: is_demo setzt (wie bei Partnern, siehe lib/demoPack.js) nur der Demo-Pack-Aufbau
// selbst, bild_file nur POST /api/admin/promotions/:id/image (siehe routes/adminMarketing.js).
function validatePromotion(input = {}, { db } = {}) {
  const bereich = validateBereich(input.bereich)
  const kennzeichnung = validateKennzeichnung(input.kennzeichnung)
  const titel = cleanRequiredText(input.titel, MAX_TITEL_LENGTH, 'Der Titel')
  const text = cleanOptionalText(input.text, MAX_TEXT_LENGTH, 'Der Text')
  const empfohlenVon = cleanOptionalText(input.empfohlenVon, MAX_EMPFOHLEN_VON_LENGTH, '„Empfehlung von“')

  if (kennzeichnung === 'Empfehlung' && !empfohlenVon) {
    throw httpError(400, 'Bei einer Empfehlung ist „Empfehlung von“ Pflicht')
  }

  const url = validateUrl(input.url, 'Der Link')
  const start = validateDate(input.start, 'Der Start')
  const ende = validateDate(input.ende, 'Das Ende')
  if (start && ende && ende < start) throw httpError(400, 'Das Ende darf nicht vor dem Start liegen')

  const tierart = validateTierart(input.tierart)
  const partnerId = validatePartnerId(input.partnerId, db)
  const aktiv = input.aktiv === undefined || input.aktiv === null ? true : Boolean(input.aktiv)
  const sort = Number.isInteger(input.sort) ? input.sort : 0

  // Rechtliches (Roadmap-Entscheidung 9): "Empfehlung von …" gilt nur ohne Gegenleistung - Züchter
  // rutschen hier nie durch, egal ob im Titel, im Text oder im "empfohlen von"-Feld.
  assertNoBreeder({ titel, text, empfohlen_von: empfohlenVon })

  return {
    partner_id: partnerId,
    bereich,
    kennzeichnung,
    empfohlen_von: empfohlenVon,
    titel,
    text,
    url,
    tierart,
    aktiv: aktiv ? 1 : 0,
    start,
    ende,
    sort
  }
}

module.exports = {
  validatePromotion,
  cleanTextInput,
  cleanRequiredText,
  cleanOptionalText,
  validateUrl,
  validateDate,
  BEREICH_VALUES,
  KENNZEICHNUNG_VALUES,
  TIERART_VALUES,
  MAX_TITEL_LENGTH,
  MAX_TEXT_LENGTH,
  MAX_EMPFOHLEN_VON_LENGTH,
  MAX_URL_LENGTH
}
