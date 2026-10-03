'use strict'

// Phase V5: Gestaltung einer Visitenkarte für Partner (85 × 55 mm, Vorder- und Rückseite) - welche Vorlage, welche
// Farbe, welcher Kurztext und welche Angaben auf der Karte stehen. Reine Prüfung ohne Datenbank; gespeichert wird in
// lib/visitenkarte.js. Den Kontrast regelt der Client (client/src/lib/visitenkarte.js wählt die Schriftfarbe auf der
// Farbfläche selbst) - hier zählt nur das Format #rrggbb. Inhalte wie Name, Logo und Kontakt kommen immer frisch aus
// dem Profil; gespeichert werden nur die Schalter, ob sie auf der Karte stehen.

const { stripUnsafeChars } = require('./partners')
const { assertNoBreeder } = require('./breederGuard')

const VORLAGEN = Object.freeze(['klassisch', 'foto', 'schlicht'])
const MAX_KURZTEXT_LENGTH = 120
// Rost des Standard-Auftritts (client/src/styles/tokens.css --rust).
const DEFAULT_FARBE = '#a4431d'
const FARBE_RE = /^#[0-9a-f]{6}$/i
const FLAGS = Object.freeze(['zeigeAnsprechperson', 'zeigeWebsite', 'zeigeTelefon', 'zeigeEmail', 'mitGutschein'])
const KEYS = Object.freeze(['vorlage', 'farbe', 'kurztext', ...FLAGS])
const ELLIPSIS = '…'
// Der erste Satz endet an . ! oder ? mit Leerraum oder Textende danach.
const FIRST_SENTENCE_RE = /^(.+?[.!?])(\s|$)/s

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

function oneLine(value) {
  return typeof value === 'string' ? stripUnsafeChars(value).replace(/\s+/g, ' ').trim() : ''
}

// Höchstens max Zeichen, an einer Wortgrenze gekürzt und mit "…" markiert.
function shorten(text, max) {
  if (text.length <= max) return text
  const cut = text.slice(0, max - ELLIPSIS.length)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}${ELLIPSIS}`
}

// Vorschlag für den Kurztext: der Portal-Titel, sonst der erste Satz des Portal-Texts - beides auf eine Zeile gebracht.
function defaultKurztext(partner) {
  const titel = oneLine(partner.portal_titel)
  if (titel) return shorten(titel, MAX_KURZTEXT_LENGTH)
  const text = oneLine(partner.portal_text)
  const sentence = text.match(FIRST_SENTENCE_RE)?.[1] ?? text
  return shorten(sentence, MAX_KURZTEXT_LENGTH)
}

function defaultDesign(partner) {
  return {
    vorlage: VORLAGEN[0],
    farbe: FARBE_RE.test(partner.farbe || '') ? partner.farbe.toLowerCase() : DEFAULT_FARBE,
    kurztext: defaultKurztext(partner),
    zeigeAnsprechperson: Boolean(oneLine(partner.ansprechperson)),
    zeigeWebsite: true,
    zeigeTelefon: true,
    zeigeEmail: true,
    mitGutschein: false
  }
}

function validateVorlage(value) {
  if (!VORLAGEN.includes(value)) throw httpError(400, `Vorlage muss eine von ${VORLAGEN.join(', ')} sein`)
  return value
}

function validateFarbe(value) {
  if (typeof value !== 'string' || !FARBE_RE.test(value)) throw httpError(400, 'Die Farbe muss im Format #rrggbb angegeben werden')
  return value.toLowerCase()
}

function validateKurztext(value) {
  if (typeof value !== 'string') throw httpError(400, 'Der Kurztext muss ein Text sein')
  const text = stripUnsafeChars(value).trim()
  if (text.length > MAX_KURZTEXT_LENGTH) throw httpError(400, `Der Kurztext darf höchstens ${MAX_KURZTEXT_LENGTH} Zeichen haben`)
  assertNoBreeder({ kurztext: text })
  return text
}

function validateFlag(value, key) {
  if (typeof value !== 'boolean') throw httpError(400, `„${key}“ muss true oder false sein`)
  return value
}

// Die ganze Gestaltung auf einmal (PUT ersetzt sie): jedes Feld muss da sein, unbekannte Felder -> 400.
function validateDesign(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw httpError(400, 'Ungültige Gestaltung')
  const unknown = Object.keys(body).find((key) => !KEYS.includes(key))
  if (unknown !== undefined) throw httpError(400, `Unbekanntes Feld: ${unknown}`)
  const missing = KEYS.find((key) => !Object.hasOwn(body, key))
  if (missing !== undefined) throw httpError(400, `Es fehlt: ${missing}`)

  return {
    vorlage: validateVorlage(body.vorlage),
    farbe: validateFarbe(body.farbe),
    kurztext: validateKurztext(body.kurztext),
    ...Object.fromEntries(FLAGS.map((key) => [key, validateFlag(body[key], key)]))
  }
}

// Gespeicherte Gestaltung (JSON-Text aus partner_visitenkarte.design) - geprüft wie beim Speichern. Ist sie nicht
// (mehr) gültig, gilt die Vorgabe aus dem Profil, statt die Seite scheitern zu lassen.
function storedDesign(json, partner) {
  if (!json) return defaultDesign(partner)
  try {
    return validateDesign(JSON.parse(json))
  } catch {
    console.warn(`[partner-area] Visitenkarte von Partner ${partner.id ?? '?'}: gespeicherte Gestaltung ungültig, nehme die Vorgabe`)
    return defaultDesign(partner)
  }
}

module.exports = {
  VORLAGEN,
  MAX_KURZTEXT_LENGTH,
  DEFAULT_FARBE,
  defaultDesign,
  defaultKurztext,
  validateDesign,
  storedDesign
}
