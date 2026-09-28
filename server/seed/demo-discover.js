// Demo-Inhalte für den Reiter "Entdecken" (Phase 3 Task 3, siehe
// docs/superpowers/plans/2026-09-29-phase-3-entdecken.md) - lib/demoPack.js legt sie mit is_demo = 1 an und
// ersetzt sie bei jedem Demo-Wechsel. Nur fiktive Namen/Marken und example.org-Links.
//
// DEMO_PROMOTIONS: Felder wie bei POST /api/admin/promotions (camelCase) - lib/demoPack.js prüft sie mit
// derselben validatePromotion() wie der Admin (Kennzeichnung, "Empfehlung von"-Pflicht, Link, Züchter-
// Schutz). Statt einer partnerId steht hier der Slug des Demo-Partners (seed/demo-partners.js), weil
// dessen Id bei jedem Demo-Wechsel neu vergeben wird. bild: optionales Seed-Bild aus seed/images.
// Rechtliches: Futtertexte sachlich, ohne Gesundheitsversprechen.
const DEMO_PROMOTIONS = [
  {
    bereich: 'futter',
    kennzeichnung: 'Empfehlung',
    empfohlenVon: 'Hundeschule Pfotenglück',
    titel: 'Knusperkorn Sensitive',
    text:
      'Trockenfutter mit Ente als einziger tierischer Proteinquelle, dazu Kartoffeln und Karotten, ohne Weizen. ' +
      'Kleine Kroketten, erhältlich in 2- und 10-kg-Säcken. Viele Familien aus unseren Kursen fragen danach.',
    url: 'https://example.org/knusperkorn',
    tierart: 'hund'
  },
  {
    bereich: 'futter',
    kennzeichnung: 'Anzeige',
    titel: 'Futterhof Deichland – Probierpaket',
    text: 'Drei kleine Beutel Trocken- und Nassfutter zum Ausprobieren, für Hunde und Katzen, portofrei nach Hause geliefert.',
    url: 'https://example.org/futterhof-deichland'
  },
  {
    bereich: 'hundeschule',
    kennzeichnung: 'Partner',
    partnerSlug: 'hundeschule-pfotenglueck',
    titel: 'Welpenkurs im Frühjahr',
    text: 'Sechs Termine für Welpen bis 16 Wochen, samstags vormittags in kleinen Gruppen. Anmeldung direkt bei der Hundeschule.',
    url: 'https://example.org/pfotenglueck-welpenkurs',
    tierart: 'hund',
    bild: 'welpen.jpg'
  }
]

// Einstellungen OHNE "demo_"-Präfix - lib/demoPack.js setzt ihn selbst davor, damit ein Demo-Wechsel
// niemals einen echten Schlüssel (gofundme_url, unterstuetzen_text) überschreiben kann.
const DEMO_SETTINGS = {
  gofundme_url: 'https://example.org/familie-auf-pfoten-spenden',
  unterstuetzen_text:
    'Jeder Beitrag hält Familie auf Pfoten am Laufen. Was nach den Kosten für Server und Betrieb übrig bleibt, ' +
    'geben wir an Tierheime weiter – wie viel genau, steht unten im Bericht. Danke, dass du dabei bist!'
}

// Beträge in Cent wie in donation_reports (Eingang 1.250 €, Kosten 180 €, weitergeleitet 1.000 €).
const DEMO_DONATION_REPORT = {
  zeitraum: '2026 Q3',
  eingangCents: 125000,
  kostenCents: 18000,
  weitergeleitetCents: 100000,
  empfaenger: 'Tierheim Sonnenhang',
  nachweisUrl: 'https://example.org/familie-auf-pfoten-spendenbericht-2026-q3'
}

module.exports = { DEMO_PROMOTIONS, DEMO_SETTINGS, DEMO_DONATION_REPORT }
