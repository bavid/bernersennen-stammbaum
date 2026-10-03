import { readSetting, writeSetting } from './storage.js'

// Einstellungen „Darstellung“ (Calm-down-Runde): Farbpalette, Hell/Dunkel/Automatisch, Schriftgröße. Dieselben Listen wie
// server/lib/darstellung.js. Angewendet als data-Attribute an <html> - die Farben stehen in styles/palettes.css (je
// Palette hell und dunkel), die Schriftgröße in styles/tokens.css (data-schrift). data-scheme ist das Ergebnis von
// Hell/Dunkel/Automatisch: „Automatisch“ folgt dem System (und dessen Wechsel, solange die Seite offen ist).
// Damit beim Laden nichts aufblitzt, setzt public/darstellung-init.js die zuletzt gemerkte Wahl schon vor dem ersten
// Bild (aus localStorage) - dieselbe Regel, nur ohne Module.

export const PALETTEN = [
  { id: 'terrakotta', label: 'Terrakotta', hint: 'Rost und Creme – die gewohnten Farben' },
  { id: 'wald', label: 'Wald', hint: 'Tannengrün und Rinde' },
  { id: 'meer', label: 'Meer', hint: 'Tiefblau und Seegrün' },
  { id: 'lavendel', label: 'Lavendel', hint: 'Flieder und Salbei' },
  { id: 'schiefer', label: 'Schiefer', hint: 'Blaugrau und Petrol' }
]

export const MODI = [
  { id: 'auto', label: 'Automatisch', hint: 'wie am Gerät eingestellt' },
  { id: 'hell', label: 'Hell' },
  { id: 'dunkel', label: 'Dunkel' }
]

export const SCHRIFTEN = [
  { id: 'normal', label: 'Normal' },
  { id: 'gross', label: 'Größer' }
]

export const STANDARD = Object.freeze({ palette: 'terrakotta', modus: 'auto', schrift: 'normal' })

const ALLOWED = {
  palette: PALETTEN.map((option) => option.id),
  modus: MODI.map((option) => option.id),
  schrift: SCHRIFTEN.map((option) => option.id)
}

const STORAGE_KEY = 'darstellung'
const DARK_QUERY = '(prefers-color-scheme: dark)'

// Jedes Feld einzeln geprüft - Unbekanntes (alte Werte, kaputter Speicher) fällt auf die Vorgabe zurück.
export function normalizeDarstellung(value) {
  const source = value && typeof value === 'object' ? value : {}
  return Object.fromEntries(
    Object.entries(ALLOWED).map(([key, allowed]) => [key, allowed.includes(source[key]) ? source[key] : STANDARD[key]])
  )
}

function systemPrefersDark() {
  try {
    return Boolean(window.matchMedia?.(DARK_QUERY).matches)
  } catch {
    return false
  }
}

// Hell oder dunkel, wie es die Seite zeigt.
export function resolveScheme(modus, prefersDark = systemPrefersDark()) {
  if (modus === 'dunkel') return 'dunkel'
  if (modus === 'hell') return 'hell'
  return prefersDark ? 'dunkel' : 'hell'
}

// „Automatisch“: einem Wechsel des Systems (z. B. abends) folgen, solange die Seite offen ist - genau ein Lauscher.
let systemQuery = null
let systemListener = null

function followSystem(root, enabled) {
  if (systemQuery && systemListener) systemQuery.removeEventListener?.('change', systemListener)
  systemQuery = null
  systemListener = null
  if (!enabled) return
  try {
    systemQuery = window.matchMedia?.(DARK_QUERY) || null
  } catch {
    systemQuery = null
  }
  if (!systemQuery?.addEventListener) return
  systemListener = (event) => {
    root.dataset.scheme = event.matches ? 'dunkel' : 'hell'
  }
  systemQuery.addEventListener('change', systemListener)
}

// Setzt die Darstellung an <html> (oder root) und gibt die geprüfte Fassung zurück.
export function applyDarstellung(value, root = document.documentElement) {
  const darstellung = normalizeDarstellung(value)
  root.dataset.palette = darstellung.palette
  root.dataset.modus = darstellung.modus
  root.dataset.schrift = darstellung.schrift
  root.dataset.scheme = resolveScheme(darstellung.modus)
  followSystem(root, darstellung.modus === 'auto')
  return darstellung
}

// Für das nächste Laden auf diesem Gerät merken (public/darstellung-init.js liest denselben Schlüssel).
export function rememberDarstellung(value) {
  writeSetting(STORAGE_KEY, normalizeDarstellung(value))
}

export function storedDarstellung() {
  return normalizeDarstellung(readSetting(STORAGE_KEY, null))
}
