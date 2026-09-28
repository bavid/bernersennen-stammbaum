const test = require('node:test')
const assert = require('node:assert/strict')
const { looksLikeBreeder, assertNoBreeder } = require('../lib/breederGuard')

test('looksLikeBreeder: erkennt Zucht-Begriffe (Komposita, Pluralformen, Groß-/Kleinschreibung egal)', () => {
  const positives = [
    'Zucht',
    'zucht',
    'ZUCHT',
    'Wir betreiben eine kleine Zucht',
    'Zuchtstätte am Waldrand',
    'Hundezucht seit 1990',
    'Katzenzucht mit Stammbaum',
    'Zuchthündin sucht neues Zuhause',
    'Hundezuchtverein',
    'Züchter',
    'erfahrene Züchterin',
    'Hundezüchter Meier',
    'Hobbyzüchterin',
    'Katzenzüchter',
    'Züchterinnen',
    'großer Zwinger vorhanden',
    'Zwingername',
    'Deckrüde verfügbar',
    'Deckrüden',
    'Deckkater abzugeben',
    'Deckhengst gesucht',
    'Welpen abzugeben',
    'Welpen  abzugeben', // doppeltes Leerzeichen
    'Welpen zu verkaufen',
    'Welpen zu vergeben',
    'Welpen verfügbar',
    'Welpenverkauf ab sofort',
    'Vermehrer',
    'lokaler Kennel',
    'Kennels',
    'renommierte Cattery',
    'Catteries',
    'certified breeder',
    'Dog breeders',
    'responsible breeding program',
    'Puppies for sale',
    'Kittens for sale',
    'stud dog available',
    'stud service angeboten',
    // Züchter mit zerlegtem ü (u + kombinierendem Trema, U+0308) statt des vorkomponierten Zeichens
    `Züchter`
  ]
  for (const text of positives) {
    assert.equal(looksLikeBreeder(text), true, `sollte als Zucht-Text erkannt werden: "${text}"`)
  }
})

test('looksLikeBreeder: legitime Partner-Kategorien lösen keinen Treffer aus', () => {
  const negatives = [
    'Tierschutz',
    'Tierschutzverein Deichland',
    'Welpenschule',
    'Welpenkurs am Samstag',
    'Hundeschule',
    'Hundeschule Pfotenglück',
    'Tierheim',
    'Tierheim Sonnenhang',
    'Wir vermitteln Hunde aus dem Tierschutz',
    'Willkommen bei unserer Hundeschule',
    ''
  ]
  for (const text of negatives) {
    assert.equal(looksLikeBreeder(text), false, `sollte NICHT als Zucht-Text erkannt werden: "${text}"`)
  }
})

// "Aufzucht"/"Handaufzucht"/"Flaschenaufzucht"/"Welpenaufzucht"/"Kittenaufzucht" sind im Tierschutz
// übliche Begriffe für die Betreuung elternloser Welpen/Kätzchen - keine Zucht. "Zwingerhusten" ist eine
// Krankheit, kein Zwinger-Angebot. "nicht im Zwinger" verneint gerade das Zwinger-Halten. Siehe
// lib/breederGuard.js (Allow-Liste vor dem Stamm-Muster).
test('looksLikeBreeder: Aufzucht-Begriffe, Zwingerhusten und Verneinungen sind keine Zucht', () => {
  const negatives = [
    'Aufzucht',
    'aufzucht',
    'AUFZUCHT',
    'Handaufzucht',
    'Flaschenaufzucht',
    'Welpenaufzucht',
    'Kittenaufzucht',
    'Wir kümmern uns um die Aufzucht elternloser Kätzchen',
    'Diese Welpen sind in Handaufzucht groß geworden',
    'Flaschenaufzucht rund um die Uhr',
    'Unsere Welpenaufzucht liegt uns am Herzen',
    'Kittenaufzucht für Findelkätzchen',
    'Zwingerhusten-Impfung',
    'Achtung: Zwingerhusten geht um',
    'Unsere Hunde leben nicht im Zwinger'
  ]
  for (const text of negatives) {
    assert.equal(looksLikeBreeder(text), false, `sollte NICHT als Zucht-Text erkannt werden: "${text}"`)
  }
})

test('looksLikeBreeder: Allow-Liste schützt nicht vor echten Zucht-Begriffen im selben Text', () => {
  assert.equal(looksLikeBreeder('Aufzucht und Zucht seit 1990'), true)
  assert.equal(looksLikeBreeder('Handaufzucht, aber auch Hundezucht'), true)
  assert.equal(looksLikeBreeder('Zwingerhusten geimpft, aber trotzdem ein großer Zwinger'), true)
})

test('looksLikeBreeder: nicht-string Eingaben gelten als unbedenklich', () => {
  assert.equal(looksLikeBreeder(null), false)
  assert.equal(looksLikeBreeder(undefined), false)
  assert.equal(looksLikeBreeder(42), false)
})

test('assertNoBreeder: wirft bei Treffer in irgendeinem Feld mit Status 400 und fester Meldung', () => {
  assert.throws(
    () => assertNoBreeder({ name: 'Tierheim Sonnenhang', portal_titel: '', portal_text: 'Wir sind eine seriöse Hundezucht.' }),
    (err) => {
      assert.ok(err instanceof Error)
      assert.equal(err.status, 400)
      assert.equal(err.message, 'Züchter und Zucht-Angebote werden hier nicht aufgenommen.')
      return true
    }
  )
})

test('assertNoBreeder: bleibt still, wenn kein Feld einen Zucht-Begriff enthält', () => {
  assert.doesNotThrow(() =>
    assertNoBreeder({ name: 'Tierheim Sonnenhang', portal_titel: 'Willkommen', portal_text: 'Wir freuen uns auf Ihren Besuch im Tierschutz.' })
  )
})
