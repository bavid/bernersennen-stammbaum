'use strict'

// Einladungskarten (Wunsch des Betreibers: "Vorderseite ihre Infos, Rückseite meine Infos"): die Vorderseite gestaltet
// der Partner wie seine Visitenkarte (Vorlage, Farbe, Kurztext, Angaben aus dem Profil) und kann eine persönliche Zeile
// dazuschreiben ("Für unsere Welpenkurs-Familien"); die Rückseite gestaltet Familie auf Pfoten (Texte aus der
// Admin-Einstellung, lib/einladungRueckseite.js) samt eigenem Code je Karte. Gespeichert wird hier nur die Vorderseite -
// kein Feld der Rückseite, kein Gutschein-Schalter (eine Einladungskarte trägt immer einen Code). Reine Prüfung ohne
// Datenbank mit denselben Bausteinen wie die Visitenkarte (lib/visitenkarteDesign.js); gespeichert wird in
// lib/einladungskarte.js.

const {
  httpError,
  defaultDesign,
  cleanCardText,
  validateVorlage,
  validateFarbe,
  validateKurztext,
  validateFlag
} = require('./visitenkarteDesign')

const MAX_WIDMUNG_LENGTH = 80
const FLAGS = Object.freeze(['zeigeAnsprechperson', 'zeigeWebsite', 'zeigeTelefon', 'zeigeEmail'])
const EINLADUNG_KEYS = Object.freeze(['vorlage', 'farbe', 'kurztext', 'widmung', ...FLAGS])
// Was die Vorgabe aus einer gespeicherten Visitenkarte übernimmt (alles außer der persönlichen Zeile).
const FROM_VISITENKARTE = Object.freeze(['vorlage', 'farbe', 'kurztext', ...FLAGS])

// Ein unbekannter Schlüssel kommt gekürzt in die Fehlermeldung.
const MAX_KEY_ECHO = 40

function validateWidmung(value) {
  return cleanCardText(value, { label: 'Die persönliche Zeile', max: MAX_WIDMUNG_LENGTH })
}

// Vorgabe: der Look der Visitenkarte des Partners (falls gespeichert, sonst die Vorgabe aus dem Profil) - ohne
// persönliche Zeile.
function defaultEinladungDesign(partner, visitenkarte = null) {
  const base = visitenkarte || defaultDesign(partner)
  return { ...Object.fromEntries(FROM_VISITENKARTE.map((key) => [key, base[key]])), widmung: '' }
}

// Die ganze Gestaltung auf einmal (PUT ersetzt sie): jedes Feld muss da sein, unbekannte Felder -> 400.
function validateEinladungDesign(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw httpError(400, 'Ungültige Gestaltung')
  const unknown = Object.keys(body).find((key) => !EINLADUNG_KEYS.includes(key))
  if (unknown !== undefined) throw httpError(400, `Unbekanntes Feld: ${unknown.slice(0, MAX_KEY_ECHO)}`)
  const missing = EINLADUNG_KEYS.find((key) => !Object.hasOwn(body, key))
  if (missing !== undefined) throw httpError(400, `Es fehlt: ${missing}`)

  return {
    vorlage: validateVorlage(body.vorlage),
    farbe: validateFarbe(body.farbe),
    kurztext: validateKurztext(body.kurztext),
    widmung: validateWidmung(body.widmung),
    ...Object.fromEntries(FLAGS.map((key) => [key, validateFlag(body[key], key)]))
  }
}

// Gespeicherte Gestaltung (JSON-Text) - geprüft wie beim Speichern; ungültig -> Vorgabe (visitenkarte: die gespeicherte
// Visitenkarte des Partners, falls es eine gibt). Ins Protokoll kommt nur die Partner-Id, nie ein Inhalt.
function storedEinladungDesign(json, partner, visitenkarte = null) {
  if (!json) return defaultEinladungDesign(partner, visitenkarte)
  try {
    return validateEinladungDesign(JSON.parse(json))
  } catch {
    console.warn(`[partner-area] Einladungskarte von Partner ${partner.id ?? '?'}: gespeicherte Gestaltung ungültig, nehme die Vorgabe`)
    return defaultEinladungDesign(partner, visitenkarte)
  }
}

module.exports = { MAX_WIDMUNG_LENGTH, EINLADUNG_KEYS, defaultEinladungDesign, validateEinladungDesign, storedEinladungDesign }
