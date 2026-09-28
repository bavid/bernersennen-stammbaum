'use strict'

// Erkennt Zucht- und Züchter-Texte, damit sie draußen bleiben - Partner sind nie Züchter
// (docs/superpowers/plans/2026-09-28-phase-2-partner.md, Task 1; security-review Phase 2 Finding 1).

// JS `\b` kennt nur ASCII-Wortzeichen - bei Umlauten (z. B. "Züchter") wäre eine reine \b-Klammer
// unzuverlässig. Deshalb: erst auf NFC normalisieren (setzt ein zerlegtes ü = u + Kombinationstrema
// U+0308 zu einem einzigen ü zusammen) und kleinschreiben, danach mit reinen Teilstring-/Stamm-Mustern
// statt \b arbeiten (Komposita wie "Hundezüchter" und Pluralformen wie "Züchterinnen" matchen so von
// selbst mit).

// Erlaubt: Betreuung elternloser Welpen/Kätzchen ("Aufzucht") ist keine Zucht, "Zwingerhusten" ist eine
// Krankheit (kein Zwinger-Angebot), "nicht im Zwinger" verneint das Zwinger-Halten ausdrücklich. Diese
// Begriffe/Wendungen werden VOR der Stamm-Prüfung aus dem Text entfernt - ein zusätzliches "Zucht" oder
// "Zwinger" an anderer Stelle im selben Text bleibt trotzdem erkennbar (siehe Test "Allow-Liste schützt
// nicht vor echten Zucht-Begriffen").
const ALLOWLIST_WORDS = ['aufzucht', 'handaufzucht', 'flaschenaufzucht', 'welpenaufzucht', 'kittenaufzucht', 'zwingerhusten']
const ALLOWLIST_PHRASES = ['nicht im zwinger']

// Stämme statt ganzer Wörter, damit Komposita ("Hundezucht") UND Pluralformen/Deklinationen
// ("Züchterinnen", "Deckrüden") gleichermaßen treffen. "(?<!auf)zucht" lässt "aufzucht" durch (zusätzlich
// zur Allow-Liste oben) - eine negative Lookbehind-Bedingung reicht hier, weil "Aufzucht" selbst nie ein
// eigenständiges "Zucht"-Vorkommen enthält. "\bkennels?\b" und "\bbreed(er|ers|ing)\b" sind reine
// ASCII-Wörter, dort ist die Wortgrenze unproblematisch.
const STEM_RE = /(?<!auf)zucht|züchte|zwinger|deckr(ü|ue)de|deckkater|deckhengst|welpenverkauf|vermehrer|\bkennels?\b|catter(y|ies)|\bbreed(er|ers|ing)\b/iu

// Mehrwort-Wendungen - der Leerraum dazwischen darf variieren (mehrere Leerzeichen, Zeilenumbruch, ...).
const PHRASE_RE = /welpen\s+(abzugeben|zu\s+verkaufen|zu\s+vergeben|verfügbar)|puppies\s+for\s+sale|kittens\s+for\s+sale|stud\s+(dog|service)/iu

// Bewusst NICHT in den Mustern (siehe Task-Vorgabe): "Tierschutz", "Welpenschule", "Welpenkurs",
// "Hundeschule", "Tierheim" - das sind legitime Partner-Kategorien, keine Zucht-Angebote.

function stripAllowlisted(normalized) {
  let result = normalized
  for (const phrase of ALLOWLIST_PHRASES) {
    result = result.split(phrase).join(' ')
  }
  for (const word of ALLOWLIST_WORDS) {
    result = result.replace(new RegExp(`\\b${word}\\b`, 'giu'), ' ')
  }
  return result
}

function looksLikeBreeder(text) {
  if (typeof text !== 'string' || !text) return false
  const normalized = text.normalize('NFC').toLowerCase()
  const stripped = stripAllowlisted(normalized)
  return STEM_RE.test(stripped) || PHRASE_RE.test(stripped)
}

function breederGuardError() {
  const err = new Error('Züchter und Zucht-Angebote werden hier nicht aufgenommen.')
  err.status = 400
  return err
}

// Prüft mehrere Felder auf einmal (z. B. { name, portal_titel, portal_text }) und wirft beim ersten Treffer.
function assertNoBreeder(fields) {
  const values = fields && typeof fields === 'object' ? Object.values(fields) : [fields]
  for (const value of values) {
    if (looksLikeBreeder(value)) throw breederGuardError()
  }
}

module.exports = { looksLikeBreeder, assertNoBreeder }
