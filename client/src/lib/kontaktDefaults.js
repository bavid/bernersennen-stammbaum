import { readSetting, removeSetting, writeSetting } from './storage.js'

// Gemerkte Kontaktdaten für die Formulare (Schreib uns, Zugang anfragen): nur auf diesem Gerät (localStorage über
// lib/storage.js, jeder Zugriff in try/catch). Nur diese Felder - nie Nachricht, Passwort oder Code.
export const KONTAKT_KEY = 'kontakt'
export const KONTAKT_FIELDS = Object.freeze(['name', 'email', 'telefon'])
export const MAX_KONTAKT_LENGTH = 200

function pickKontakt(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {}
  const picked = {}
  for (const field of KONTAKT_FIELDS) {
    const value = source[field]
    if (typeof value !== 'string') continue
    const text = value.trim().slice(0, MAX_KONTAKT_LENGTH)
    if (text) picked[field] = text
  }
  return picked
}

export function loadKontakt() {
  return pickKontakt(readSetting(KONTAKT_KEY, null))
}

// Ergänzt die schon gemerkten Angaben um die neuen (leere Felder löschen nichts).
export function saveKontakt(values) {
  writeSetting(KONTAKT_KEY, { ...loadKontakt(), ...pickKontakt(values) })
}

export function clearKontakt() {
  removeSetting(KONTAKT_KEY)
}

// Nur die gemerkten Felder, die das Formular wirklich hat.
export function kontaktFor(emptyForm) {
  const known = loadKontakt()
  return Object.fromEntries(Object.entries(known).filter(([field]) => field in emptyForm))
}
