const test = require('node:test')
const assert = require('node:assert/strict')
const { looksLikeBreeder, assertNoBreeder } = require('../lib/breederGuard')

test('looksLikeBreeder: erkennt Zucht-Begriffe (Groß-/Kleinschreibung egal)', () => {
  const positives = [
    'Zucht',
    'zucht',
    'ZUCHT',
    'Wir betreiben eine kleine Zucht',
    'Zuchtstätte am Waldrand',
    'Hundezucht seit 1990',
    'Katzenzucht mit Stammbaum',
    'Zuchthündin sucht neues Zuhause',
    'Züchter',
    'erfahrene Züchterin',
    'großer Zwinger vorhanden',
    'Deckrüde verfügbar',
    'Deckkater abzugeben',
    'Welpen abzugeben',
    'Welpen  abzugeben', // doppeltes Leerzeichen
    'Welpenverkauf ab sofort',
    'lokaler Kennel',
    'renommierte Cattery',
    'certified breeder',
    'responsible breeding program'
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
