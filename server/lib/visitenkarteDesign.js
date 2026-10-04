'use strict'

// Phase V5, Feedback-Runde: Gestaltung der Karten eines Partners (85 × 55 mm) - EINE Vorderseite für alle Kombinationen
// (Vorlage, Farbe, Kurztext, persönliche Zeile, welche Angaben auf der Karte stehen) und die gewählte Kombination (karte):
// Visitenkarte (hinten das Portal), Einladungskarte (hinten Familie auf Pfoten mit Code) oder Kombi (hinten Portal und
// Code). Reine Prüfung ohne Datenbank; gespeichert wird in lib/visitenkarte.js. Den Kontrast regelt der Client
// (client/src/lib/visitenkarte.js wählt die Schriftfarbe auf der Farbfläche selbst) - hier zählt nur das Format #rrggbb.
// Inhalte wie Name, Logo und Kontakt kommen immer frisch aus dem Profil; gespeichert werden nur die Schalter.
// Früher standen Visitenkarte (mit Gutschein-Schalter) und Einladungskarte (mit persönlicher Zeile) getrennt -
// mergeLegacyDesigns führt sie zusammen.

const { stripUnsafeChars } = require('./partners')
const { assertNoBreeder } = require('./breederGuard')

const VORLAGEN = Object.freeze(['klassisch', 'foto', 'schlicht'])
const KARTEN = Object.freeze(['visitenkarte', 'einladung', 'kombi'])
const DEFAULT_KARTE = 'kombi'
const MAX_KURZTEXT_LENGTH = 120
const MAX_WIDMUNG_LENGTH = 80
// Rost des Standard-Auftritts (client/src/styles/tokens.css --rust).
const DEFAULT_FARBE = '#a4431d'
const FARBE_RE = /^#[0-9a-f]{6}$/i
const FLAGS = Object.freeze(['zeigeAnsprechperson', 'zeigeWebsite', 'zeigeTelefon', 'zeigeEmail'])
const KEYS = Object.freeze(['karte', 'vorlage', 'farbe', 'kurztext', 'widmung', ...FLAGS])
const ELLIPSIS = '…'
// Ein unbekannter Schlüssel kommt gekürzt in die Fehlermeldung.
const MAX_KEY_ECHO = 40
// Unsichtbare Zeichen, die lib/partners.js stripUnsafeChars nicht kennt (security-review V5): Nullbreiten-Leerzeichen,
// Wortverbinder, Richtungsmarken, arabisches Buchstabenzeichen, BOM, Zeilen-/Absatztrenner - auf gedruckten Karten nur
// zum Täuschen gut. Nullbreiten-(Nicht-)Verbinder (U+200C/U+200D) bleiben: Emoji-Folgen und manche Schriften brauchen sie.
const INVISIBLE_RE = /[\u200B\u200E\u200F\u2060\u061C\uFEFF\u2028\u2029]/g
// Für die Zucht-Prüfung (security-review Einladungskarten): eine Kopie ohne alles, was gedruckt unsichtbar bleibt - auch
// Silbentrennzeichen, Nullbreiten-(Nicht-)Verbinder, Variantenwähler und Tag-Zeichen -, NFKC-normalisiert (Vollbreiten-
// Doppelgänger). Gespeichert wird weiter der Text ohne INVISIBLE_RE; Emoji-Folgen behalten ihre Verbinder.
const HIDDEN_FOR_GUARD_RE = /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0\u{E0000}-\u{E007F}]/gu
// Der erste Satz endet an . ! oder ? mit Leerraum oder Textende danach.
const FIRST_SENTENCE_RE = /^(.+?[.!?])(\s|$)/s

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
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
    karte: DEFAULT_KARTE,
    vorlage: VORLAGEN[0],
    farbe: FARBE_RE.test(partner.farbe || '') ? partner.farbe.toLowerCase() : DEFAULT_FARBE,
    kurztext: defaultKurztext(partner),
    widmung: '',
    zeigeAnsprechperson: Boolean(oneLine(partner.ansprechperson)),
    zeigeWebsite: true,
    zeigeTelefon: true,
    zeigeEmail: true
  }
}

function validateKarte(value) {
  if (!KARTEN.includes(value)) throw httpError(400, `Kombination muss eine von ${KARTEN.join(', ')} sein`)
  return value
}

function validateVorlage(value) {
  if (!VORLAGEN.includes(value)) throw httpError(400, `Vorlage muss eine von ${VORLAGEN.join(', ')} sein`)
  return value
}

function validateFarbe(value) {
  if (typeof value !== 'string' || !FARBE_RE.test(value)) throw httpError(400, 'Die Farbe muss im Format #rrggbb angegeben werden')
  return value.toLowerCase()
}

// Ein Text für die Karte (Kurztext, persönliche Zeile): ohne Steuer-, Bidi- und unsichtbare Zeichen, höchstens max
// Zeichen, keine Zucht-Angebote.
function cleanCardText(value, { label, max }) {
  if (typeof value !== 'string') throw httpError(400, `${label} muss ein Text sein`)
  const text = stripUnsafeChars(value).replace(INVISIBLE_RE, '').trim()
  if (text.length > max) throw httpError(400, `${label} darf höchstens ${max} Zeichen haben`)
  assertNoBreeder({ text: text.normalize('NFKC').replace(HIDDEN_FOR_GUARD_RE, '') })
  return text
}

function validateKurztext(value) {
  return cleanCardText(value, { label: 'Der Kurztext', max: MAX_KURZTEXT_LENGTH })
}

function validateWidmung(value) {
  return cleanCardText(value, { label: 'Die persönliche Zeile', max: MAX_WIDMUNG_LENGTH })
}

function validateFlag(value, key) {
  if (typeof value !== 'boolean') throw httpError(400, `„${key}“ muss true oder false sein`)
  return value
}

// Die ganze Gestaltung auf einmal (PUT ersetzt sie): jedes Feld muss da sein, unbekannte Felder -> 400.
function validateDesign(body) {
  if (!isPlainObject(body)) throw httpError(400, 'Ungültige Gestaltung')
  const unknown = Object.keys(body).find((key) => !KEYS.includes(key))
  if (unknown !== undefined) throw httpError(400, `Unbekanntes Feld: ${unknown.slice(0, MAX_KEY_ECHO)}`)
  const missing = KEYS.find((key) => !Object.hasOwn(body, key))
  if (missing !== undefined) throw httpError(400, `Es fehlt: ${missing}`)

  return {
    karte: validateKarte(body.karte),
    vorlage: validateVorlage(body.vorlage),
    farbe: validateFarbe(body.farbe),
    kurztext: validateKurztext(body.kurztext),
    widmung: validateWidmung(body.widmung),
    ...Object.fromEntries(FLAGS.map((key) => [key, validateFlag(body[key], key)]))
  }
}

// --- Frühere, getrennte Gestaltungen ---------------------------------------------------------------------

// Die Vorderseite einer früheren Gestaltung - nur, wenn jedes Feld gültig ist, sonst null.
function legacyFront(source) {
  if (!isPlainObject(source)) return null
  try {
    return {
      vorlage: validateVorlage(source.vorlage),
      farbe: validateFarbe(source.farbe),
      kurztext: validateKurztext(source.kurztext),
      ...Object.fromEntries(FLAGS.map((key) => [key, validateFlag(source[key], key)]))
    }
  } catch {
    return null
  }
}

function legacyWidmung(source) {
  if (!isPlainObject(source) || typeof source.widmung !== 'string') return ''
  try {
    return validateWidmung(source.widmung)
  } catch {
    return ''
  }
}

// visitenkarte/einladung: die früher getrennt gespeicherten Gestaltungen (geparstes JSON oder null). Vorderseite: die der
// Visitenkarte, sonst die der Einladungskarte, sonst die Vorgabe; die persönliche Zeile der Einladungskarte; die
// Kombination aus dem, was gedruckt wurde - Visitenkarte mit Gutschein -> Kombi, ohne -> Visitenkarte, nur eine
// Einladungskarte -> Einladungskarte. Wirft nie.
function mergeLegacyDesigns(visitenkarte, einladung, partner) {
  const base = defaultDesign(partner)
  if (!isPlainObject(visitenkarte) && !isPlainObject(einladung)) return base
  const { karte: baseKarte, widmung: baseWidmung, ...baseFront } = base
  const front = legacyFront(visitenkarte) ?? legacyFront(einladung) ?? baseFront
  let karte = 'einladung'
  if (isPlainObject(visitenkarte)) karte = visitenkarte.mitGutschein === true ? 'kombi' : 'visitenkarte'
  return { karte, ...front, widmung: legacyWidmung(einladung) }
}

function parseJson(json) {
  if (!json) return null
  try {
    return JSON.parse(json)
  } catch {
    return undefined
  }
}

// Gespeicherte Gestaltung (JSON-Text aus partner_visitenkarte.design; einladungJson: die frühere Einladungskarte aus
// partner_einladungskarte, falls es sie noch gibt). Die neue Form (mit karte) wird geprüft wie beim Speichern, eine
// frühere zusammengeführt. Ist nichts davon (mehr) gültig, gilt die Vorgabe aus dem Profil, statt die Seite scheitern
// zu lassen. Ins Protokoll kommt nur die Partner-Id, nie ein Inhalt.
function storedDesign(json, partner, einladungJson = null) {
  const saved = parseJson(json)
  const warn = () => console.warn(`[partner-area] Karten von Partner ${partner.id ?? '?'}: gespeicherte Gestaltung ungültig, nehme die Vorgabe`)
  if (isPlainObject(saved) && Object.hasOwn(saved, 'karte')) {
    try {
      return validateDesign(saved)
    } catch {
      warn()
      return defaultDesign(partner)
    }
  }
  const einladung = parseJson(einladungJson)
  if (saved === undefined && !isPlainObject(einladung)) {
    warn()
    return defaultDesign(partner)
  }
  return mergeLegacyDesigns(saved, einladung, partner)
}

module.exports = {
  VORLAGEN,
  KARTEN,
  DEFAULT_KARTE,
  KEYS,
  MAX_KURZTEXT_LENGTH,
  MAX_WIDMUNG_LENGTH,
  DEFAULT_FARBE,
  httpError,
  defaultDesign,
  defaultKurztext,
  validateDesign,
  mergeLegacyDesigns,
  storedDesign
}
