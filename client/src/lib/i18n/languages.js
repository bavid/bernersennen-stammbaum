// Welche Sprachen die App kennt - die einzige Stelle, an der eine neue Sprache eingetragen wird. Deutsch steckt als
// Schlüssel im Code (t('Neue Erinnerung')) und braucht kein Wörterbuch; jede andere Sprache hat eines (z. B. ./en.js).
// Neue Sprache (etwa Französisch): lib/i18n/fr/… und ./fr.js anlegen, hier eine Zeile in LANGUAGES, LOADERS und LOCALES.
// Das Bauen (scripts/build-i18n.mjs) schreibt daraus dist/i18n/<sprache>.json, der Server liefert sie (/api/i18n).
export const DEFAULT_LANG = 'de'

export const LANGUAGES = Object.freeze([
  { code: 'de', label: 'Deutsch' },
  { code: 'en', label: 'English' }
])

export const LANGUAGE_CODES = Object.freeze(LANGUAGES.map((language) => language.code))

// Quelltext der Wörterbücher: im Bündel ein eigener Chunk (nur im Entwickeln/Testen und als Rückfall geladen), im
// Bauskript direkt aus Node.
export const LOADERS = Object.freeze({
  en: () => import('./en.js')
})

// Gebietsschema für Intl/toLocale* (Zahlen, Beträge, Daten).
export const LOCALES = Object.freeze({ de: 'de-DE', en: 'en-GB' })

export function isLanguage(code) {
  return LANGUAGE_CODES.includes(code)
}

// Beste Sprache aus den Wünschen des Browsers (navigator.languages): en-US -> en, de-AT -> de; nichts Passendes -> Deutsch.
export function pickBrowserLang(preferred) {
  for (const tag of preferred || []) {
    const code = String(tag || '').toLowerCase().split(/[-_]/)[0]
    if (isLanguage(code)) return code
  }
  return DEFAULT_LANG
}
