// Gemeinsame Test-Vorbereitung: jsdom kennt window.scrollTo nicht ("Not implemented") - ScrollToTop ruft es
// bei jedem Routenwechsel auf. Ein stiller Ersatz hält die Testausgabe sauber; Tests, die das Scrollen
// prüfen, legen wie bisher vi.spyOn(window, 'scrollTo') darüber.
if (typeof window !== 'undefined') {
  window.scrollTo = () => {}
}
