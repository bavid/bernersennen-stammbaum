import { useCallback, useSyncExternalStore } from 'react'
import de from './de.js'
import { DEFAULT_LANG, LANGUAGES, LOCALES, isLanguage, pickBrowserLang } from './languages.js'
import { loadMessages, readCache } from './loader.js'

export { LANGUAGES } from './languages.js'
export const LANG_KEY = 'fap-lang'

// Geladene Wörterbücher je Sprache. Deutsch ist immer da (die Punkt-Schlüssel aus login.js/settings.js), alle anderen
// kommen über loadLanguage() (lib/i18n/loader.js) - aus dem Browser-Speicher, der API oder dem Quelltext.
let dictionaries = { [DEFAULT_LANG]: de }
const pending = new Map()
const listeners = new Set()
// Zählt jeden Wechsel und jedes nachgeladene Wörterbuch - useLang hört darauf, damit auch eine frischere Fassung derselben
// Sprache neu zeichnet.
let revision = 0

function readStored() {
  try {
    const value = window.localStorage.getItem(LANG_KEY)
    return isLanguage(value) ? value : null
  } catch {
    return null
  }
}

function browserLanguages() {
  try {
    const nav = globalThis.navigator
    if (!nav) return []
    return nav.languages?.length ? nav.languages : [nav.language]
  } catch {
    return []
  }
}

function applyToDocument(lang) {
  if (typeof document !== 'undefined') document.documentElement.lang = lang
}

function notify() {
  revision += 1
  listeners.forEach((listener) => listener())
}

function install(lang, messages) {
  dictionaries = { ...dictionaries, [lang]: messages }
  if (lang === current) notify()
}

// Erster Besuch: die beste Sprache des Browsers; danach gilt, was gewählt wurde.
let current = readStored() || pickBrowserLang(browserLanguages())
let wanted = current

// Sprache laden (ohne zu wechseln). Gleichzeitige Aufrufe teilen sich eine Anfrage.
export function loadLanguage(lang, options) {
  if (!isLanguage(lang)) return Promise.reject(new Error(`Unbekannte Sprache: ${lang}`))
  if (lang === DEFAULT_LANG) return Promise.resolve(de)
  if (!pending.has(lang)) {
    const request = loadMessages(lang, options)
      .then((messages) => {
        install(lang, messages)
        return messages
      })
      .finally(() => pending.delete(lang))
    pending.set(lang, request)
  }
  return pending.get(lang)
}

// Start in einer anderen Sprache: gespeicherte Texte sofort (kein Aufblitzen von Deutsch), dann im Hintergrund prüfen,
// ob es eine neuere Fassung gibt.
const startup = (() => {
  if (current === DEFAULT_LANG) return Promise.resolve()
  applyToDocument(current)
  const cached = readCache(current)
  if (cached) dictionaries = { ...dictionaries, [current]: cached.messages }
  const refresh = loadLanguage(current).catch(() => {})
  return cached ? Promise.resolve() : refresh
})()

// Für main.jsx: erst zeichnen, wenn die Startsprache da ist - höchstens timeoutMs warten, dann eben erst Deutsch.
export function whenReady(timeoutMs = 1500) {
  return Promise.race([startup, new Promise((resolve) => setTimeout(resolve, timeoutMs))])
}

export function getLang() {
  return current
}

function switchTo(lang) {
  current = lang
  try {
    window.localStorage.setItem(LANG_KEY, lang)
  } catch {
    // Speicher gesperrt: die Wahl gilt dann nur, bis die Seite neu geladen wird.
  }
  applyToDocument(lang)
  notify()
}

// Wechseln: ist die Sprache schon geladen, sofort; sonst erst laden. Klappt das nicht (offline), bleibt die bisherige.
// Liefert ein Promise mit der danach gültigen Sprache.
export function setLang(lang) {
  if (!isLanguage(lang)) return Promise.resolve(current)
  wanted = lang
  if (lang === current) return Promise.resolve(current)
  if (dictionaries[lang]) {
    switchTo(lang)
    return Promise.resolve(lang)
  }
  return loadLanguage(lang).then(
    () => {
      if (wanted === lang && current !== lang) switchTo(lang)
      return current
    },
    () => current
  )
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
  const text = dictionaries[lang]?.[key] ?? de[key] ?? key
  return fill(text, vars)
}

// Wie translate(), aber mit eigenem Rückfall (z. B. dem deutschen Etikett aus einer Optionsliste) statt des Schlüssels.
export function translateOr(lang, key, fallback, vars) {
  const text = dictionaries[lang]?.[key] ?? de[key]
  return text === undefined ? fallback : fill(text, vars)
}

// Gebietsschema für Intl/toLocale* (Zahlen, Beträge, Daten).
export function locale() {
  return LOCALES[current] || LOCALES[DEFAULT_LANG]
}

export function t(key, vars) {
  return translate(current, key, vars)
}

export function tOr(key, fallback, vars) {
  return translateOr(current, key, fallback, vars)
}

// Listen/Objekte (z. B. loginFacts) kommen unverändert zurück; Fallback wie bei t().
export function tList(key) {
  return dictionaries[current]?.[key] ?? de[key] ?? []
}

function getRevision() {
  return revision
}

export function useLang() {
  useSyncExternalStore(subscribe, getRevision, getRevision)
  return current
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
