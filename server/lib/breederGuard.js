'use strict'

// Erkennt Zucht- und Züchter-Texte, damit sie draußen bleiben - Partner sind nie Züchter
// (docs/superpowers/plans/2026-09-28-phase-2-partner.md, Task 1).

// "Zucht" tritt in deutschen Komposita als Vorsilbe ("Zuchtstätte", "Zuchthündin") UND als
// Nachsilbe ("Hundezucht", "Katzenzucht") auf. Eine reine \bzucht\b-Klammer würde beide Komposita-
// Formen verfehlen, deshalb genügt hier eine Wortanfang- ODER eine Wortende-Grenze.
const ZUCHT_RE = /\bzucht|zucht\b/i

// Begriffe, die als ganzes Wort auftreten müssen (Groß-/Kleinschreibung egal).
const WORD_TERMS = ['Züchter', 'Züchterin', 'Zwinger', 'Deckrüde', 'Deckkater', 'Welpenverkauf', 'Kennel', 'Cattery', 'breeder', 'breeding']
const WORD_RE = new RegExp(`\\b(${WORD_TERMS.join('|')})\\b`, 'i')

// Mehrwort-Wendung - der Leerraum dazwischen darf variieren (mehrere Leerzeichen, Zeilenumbruch, ...).
const PHRASE_RE = /\bwelpen\s+abzugeben\b/i

// Bewusst NICHT in der Liste (siehe Task-Vorgabe): "Tierschutz", "Welpenschule", "Welpenkurs",
// "Hundeschule", "Tierheim" - das sind legitime Partner-Kategorien, keine Zucht-Angebote.

function looksLikeBreeder(text) {
  if (typeof text !== 'string' || !text) return false
  return ZUCHT_RE.test(text) || WORD_RE.test(text) || PHRASE_RE.test(text)
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
