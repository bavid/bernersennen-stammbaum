// Einladungskarten (Wunsch des Betreibers: "Vorderseite ihre Infos, Rückseite meine Infos"): vorne der Partner wie auf
// seiner Visitenkarte plus eine persönliche Zeile, hinten Familie auf Pfoten mit eigenem Code je Karte. Reine Funktionen
// ohne DOM - spiegelt server/lib/einladungskarteDesign.js (Vorderseite) und server/lib/einladungRueckseite.js (Rückseite,
// Admin-Einstellung). Gedruckt wird nach Kartenzahl (1-50), nicht nach ganzen Bögen.
import { CARDS_PER_SHEET, cardModel, mirrorRows } from './visitenkarte.js'

export const ART = Object.freeze({ visitenkarte: 'visitenkarte', einladung: 'einladung' })
export const ART_PARAM = 'art'
export const MAX_WIDMUNG_LENGTH = 80
export const MIN_KARTEN = 1
export const MAX_KARTEN = 50
export const DEFAULT_KARTEN = 10

const EINLADUNG_KEYS = Object.freeze(['vorlage', 'farbe', 'kurztext', 'widmung', 'zeigeAnsprechperson', 'zeigeWebsite', 'zeigeTelefon', 'zeigeEmail'])
const VOUCHER_PATH = '/v'

export const RUECKSEITE_VORGABEN = Object.freeze({
  titel: 'Eure Tierchronik – geschenkt',
  text: 'Familie auf Pfoten hält fest, was eure Tiere erleben – für euch und eure Familie. Ohne Tracking, ohne Datenhandel.',
  schritte: Object.freeze(['QR-Code scannen oder Adresse öffnen', 'Code eingeben', 'Tiere anlegen und loslegen']),
  adresse: ''
})
export const RUECKSEITE_LIMITS = Object.freeze({ titel: 60, text: 240, schritt: 60, schritte: 3, adresse: 60 })
export const SCHRITT_FIELDS = Object.freeze(['schritt1', 'schritt2', 'schritt3'])

// ?art=einladung wählt die Einladungskarte, alles andere (auch nichts) die Visitenkarte.
export function artFromParam(value) {
  return value === ART.einladung ? ART.einladung : ART.visitenkarte
}

// Das Kartenmodell der Visitenkarte (lib/visitenkarte.js cardModel) mit der persönlichen Zeile.
export function einladungCardModel({ profile, design, publicUrl, origin }) {
  const widmung = typeof design.widmung === 'string' ? design.widmung.trim() : ''
  return { ...cardModel({ profile, design, publicUrl, origin }), widmung: widmung || null }
}

export function einladungPayload(design) {
  return Object.fromEntries(EINLADUNG_KEYS.map((key) => [key, design[key]]))
}

export function isSameEinladung(a, b) {
  if (!a || !b) return false
  return EINLADUNG_KEYS.every((key) => a[key] === b[key])
}

// Was die Rückseite zeigt: die Texte der Admin-Einstellung (fehlen sie, die Vorgaben) und die Adresse - ohne Eintrag die,
// auf die auch der QR-Code zeigt (card.host + /v).
export function rueckseiteModel(rueckseite, card) {
  const source = rueckseite || RUECKSEITE_VORGABEN
  return {
    titel: source.titel,
    text: source.text,
    schritte: (source.schritte || []).filter(Boolean),
    adresse: source.adresse || `${card.host}${VOUCHER_PATH}`
  }
}

// --- Admin-Formular "Einladungskarte – Rückseite" -----------------------------------------------------

export function rueckseiteForm(rueckseite) {
  const schritte = rueckseite.schritte || []
  return {
    titel: rueckseite.titel,
    text: rueckseite.text,
    ...Object.fromEntries(SCHRITT_FIELDS.map((key, index) => [key, schritte[index] || ''])),
    adresse: rueckseite.adresse || ''
  }
}

export function rueckseitePayload(form) {
  return {
    titel: form.titel.trim(),
    text: form.text.trim(),
    // Alle drei Felder, auch leere - der Server lässt leere weg, und ein Feldfehler ("schritt2") trifft so das richtige Feld.
    schritte: SCHRITT_FIELDS.map((key) => form[key].trim()),
    adresse: form.adresse.trim()
  }
}

// Pflichtfelder vor dem Senden - Längen begrenzt das Formular (maxLength), alles andere prüft der Server.
export function rueckseiteClientErrors(form) {
  const errors = {}
  if (!form.titel.trim()) errors.titel = 'Bitte gib einen Titel an.'
  if (!form.text.trim()) errors.text = 'Bitte gib einen Text an.'
  return errors
}

// --- Druck nach Kartenzahl ------------------------------------------------------------------------------

export function clampKarten(value) {
  const number = Math.trunc(Number(value))
  if (!Number.isFinite(number)) return MIN_KARTEN
  return Math.min(MAX_KARTEN, Math.max(MIN_KARTEN, number))
}

export function sheetCountFor(count) {
  return Math.max(1, Math.ceil(count / CARDS_PER_SHEET))
}

// Bögen für count Karten (lib/visitenkarte.js buildSheets, aber nach Karten): fronts sind die Karten-Nummern in
// Leserichtung (null = leerer Platz auf dem letzten Bogen), backs dieselben Karten gespiegelt (lib/visitenkarte.js
// mirrorRows), je mit dem Code ihrer Karte - ein leerer Platz bleibt auch hinten leer (null). Keine Karte, kein Bogen.
export function buildKartenSheets({ count, codes = [] }) {
  return Array.from({ length: count > 0 ? sheetCountFor(count) : 0 }, (_, sheet) => {
    const fronts = Array.from({ length: CARDS_PER_SHEET }, (__, slot) => {
      const index = sheet * CARDS_PER_SHEET + slot
      return index < count ? index : null
    })
    const backs = mirrorRows(fronts).map((index) => (index === null ? null : { index, code: codes[index] ?? null }))
    return { number: sheet + 1, fronts, backs }
  })
}
