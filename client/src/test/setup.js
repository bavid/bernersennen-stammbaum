// Gemeinsame Test-Vorbereitung: jsdom kennt window.scrollTo nicht ("Not implemented") - ScrollToTop ruft es
// bei jedem Routenwechsel auf. Ein stiller Ersatz hält die Testausgabe sauber; Tests, die das Scrollen
// prüfen, legen wie bisher vi.spyOn(window, 'scrollTo') darüber.
if (typeof window !== 'undefined') {
  window.scrollTo = () => {}
}

// Sprache: jsdom und Node melden „en-US“ - die App wählte dann beim ersten Start Englisch (lib/i18n/languages.js
// pickBrowserLang). Die Tests erwarten Deutsch als Start; einzelne Tests überschreiben die Getter mit vi.spyOn.
for (const target of [globalThis.navigator].filter(Boolean)) {
  Object.defineProperty(target, 'languages', { configurable: true, get: () => ['de-DE', 'de'] })
  Object.defineProperty(target, 'language', { configurable: true, get: () => 'de-DE' })
}

// Englisch vorab laden (aus dem Quelltext, lib/i18n/loader.js): so wechselt setLang('en') in Tests sofort, wie früher,
// als das Wörterbuch fest im Bündel lag.
const { loadLanguage } = await import('../lib/i18n/index.js')
await loadLanguage('en')
