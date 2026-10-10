// Rückseiten mit Code (Einladungskarte und Kombi, Wunsch des Betreibers: "Vorderseite ihre Infos, Rückseite meine
// Infos"): Titel und Texte gestaltet Familie auf Pfoten (Admin-Einstellung, server/lib/einladungRueckseite.js), dazu der
// eigene Code je Karte. Außerdem der Druck nach Kartenzahl (1-50, der letzte Bogen darf angebrochen sein) für alle
// Kombinationen. Reine Funktionen ohne DOM.
import { CARDS_PER_SHEET, PENDING_ADDRESS, mirrorRows } from './visitenkarte.js'
import { t } from './i18n/index.js'

export const MIN_KARTEN = 1
export const MAX_KARTEN = 50
export const DEFAULT_KARTEN = 10

const VOUCHER_PATH = '/v'

export const RUECKSEITE_VORGABEN = Object.freeze({
  titel: 'Eure Tierchronik – geschenkt',
  text: 'Familie auf Pfoten hält fest, was eure Tiere erleben – für euch und eure Familie. Ohne Tracking, ohne Datenhandel.',
  schritte: Object.freeze(['QR-Code scannen oder Adresse öffnen', 'Code eingeben', 'Tiere anlegen und loslegen']),
  adresse: ''
})
export const RUECKSEITE_LIMITS = Object.freeze({ titel: 60, text: 240, schritt: 60, schritte: 3, adresse: 60 })
export const SCHRITT_FIELDS = Object.freeze(['schritt1', 'schritt2', 'schritt3'])

// Was die Rückseite zeigt: die Texte der Admin-Einstellung (fehlen sie, die Vorgaben) und die Adresse - ohne Eintrag die,
// auf die auch der QR-Code zeigt (card.host + /v); ohne öffentliche Adresse (card.addressPending) der Platzhalter.
export function rueckseiteModel(rueckseite, card) {
  // Ohne Admin-Einstellung gelten die Vorgaben - die in der gewählten Sprache.
  const source = rueckseite || RUECKSEITE_VORGABEN
  const tr = rueckseite ? (text) => text : t
  return {
    titel: tr(source.titel),
    text: tr(source.text),
    schritte: (source.schritte || []).filter(Boolean).map(tr),
    adresse: source.adresse || (card.addressPending ? PENDING_ADDRESS : `${card.host}${VOUCHER_PATH}`)
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

// Bögen für count Karten: fronts sind die Karten-Nummern in Leserichtung (null = leerer Platz auf dem letzten Bogen),
// backs dieselben Karten gespiegelt (lib/visitenkarte.js mirrorRows), je mit dem Code ihrer Karte (null = ohne Code) -
// ein leerer Platz bleibt auch hinten leer (null). Keine Karte, kein Bogen.
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
