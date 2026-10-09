import { useCallback, useSyncExternalStore } from 'react'
import de from './de.js'
import en from './en.js'

export const LANG_KEY = 'fap-lang'
export const LANGUAGES = [
  { code: 'de', label: 'Deutsch' },
  { code: 'en', label: 'English' }
]
const DICTIONARIES = { de, en }
const DEFAULT_LANG = 'de'

const listeners = new Set()

function readStored() {
  try {
    const value = window.localStorage.getItem(LANG_KEY)
    return value in DICTIONARIES ? value : null
  } catch {
    return null
  }
}

let current = readStored() || DEFAULT_LANG

function applyToDocument(lang) {
  if (typeof document !== 'undefined') document.documentElement.lang = lang
}
if (current !== DEFAULT_LANG) applyToDocument(current)

export function getLang() {
  return current
}

export function setLang(lang) {
  if (!(lang in DICTIONARIES) || lang === current) return
  current = lang
  try {
    window.localStorage.setItem(LANG_KEY, lang)
  } catch {
    // Speicher gesperrt: die Wahl gilt dann nur, bis die Seite neu geladen wird.
  }
  applyToDocument(lang)
  listeners.forEach((listener) => listener())
}

export function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function fill(text, vars) {
  if (!vars) return text
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match))
}

// Nachschlagen: gewählte Sprache, sonst Deutsch, sonst der Schlüssel selbst.
export function translate(lang, key, vars) {
  const text = DICTIONARIES[lang]?.[key] ?? de[key] ?? key
  return fill(text, vars)
}

// Wie translate(), aber mit eigenem Rückfall (z. B. dem deutschen Etikett aus einer Optionsliste) statt des Schlüssels.
export function translateOr(lang, key, fallback, vars) {
  const text = DICTIONARIES[lang]?.[key] ?? de[key]
  return text === undefined ? fallback : fill(text, vars)
}

// Gebietsschema für Intl/toLocale* (Zahlen, Beträge, Daten).
export function locale() {
  return current === 'en' ? 'en-GB' : 'de-DE'
}

export function t(key, vars) {
  return translate(current, key, vars)
}

export function tOr(key, fallback, vars) {
  return translateOr(current, key, fallback, vars)
}

// Listen/Objekte (z. B. loginFacts) kommen unverändert zurück; Fallback wie bei t().
export function tList(key) {
  return DICTIONARIES[current]?.[key] ?? de[key] ?? []
}

export function useLang() {
  return useSyncExternalStore(subscribe, getLang, getLang)
}

export function useT() {
  const lang = useLang()
  return useCallback((key, vars) => translate(lang, key, vars), [lang])
}

// Wie useT, mit eigenem Rückfall je Aufruf: tr(key, fallback, vars).
export function useTr() {
  const lang = useLang()
  return useCallback((key, fallback, vars) => translateOr(lang, key, fallback, vars), [lang])
}
