const test = require('node:test')
const assert = require('node:assert/strict')
const {
  VORLAGEN,
  MAX_KURZTEXT_LENGTH,
  DEFAULT_FARBE,
  defaultDesign,
  defaultKurztext,
  validateDesign,
  storedDesign
} = require('../lib/visitenkarteDesign')

// Phase V5: die Gestaltung einer Visitenkarte (Vorlage, Farbe, Kurztext, Schalter) - reine Prüfung ohne Datenbank.

const VALID = Object.freeze({
  vorlage: 'foto',
  farbe: '#1F5F8B',
  kurztext: '  Training mit Herz – vom Welpen bis zum Senior  ',
  zeigeAnsprechperson: true,
  zeigeWebsite: true,
  zeigeTelefon: false,
  zeigeEmail: true,
  mitGutschein: true
})

const PARTNER = Object.freeze({
  name: 'Hundeschule Wiesengrund',
  farbe: '#2a6f4e',
  portal_titel: 'Gemeinsam lernen auf der Wiese',
  portal_text: 'Wir trainieren in kleinen Gruppen. Jeder Hund lernt in seinem Tempo, mit viel Lob und Geduld.',
  ansprechperson: 'Wilma Feld'
})

function rejects(input, pattern) {
  assert.throws(
    () => validateDesign(input),
    (err) => err.status === 400 && pattern.test(err.message)
  )
}

test('validateDesign: eine vollständige Gestaltung wird gesäubert übernommen', () => {
  assert.deepEqual(validateDesign(VALID), {
    ...VALID,
    farbe: '#1f5f8b',
    kurztext: 'Training mit Herz – vom Welpen bis zum Senior'
  })
  assert.deepEqual(VORLAGEN, ['klassisch', 'foto', 'schlicht'])
})

test('validateDesign: nur bekannte Vorlagen, Farbe als #rrggbb', () => {
  rejects({ ...VALID, vorlage: 'bunt' }, /Vorlage/)
  rejects({ ...VALID, vorlage: '' }, /Vorlage/)
  for (const farbe of ['1f5f8b', '#1f5f8', '#1f5f8bb', 'rot', '#12345g', 12, null]) rejects({ ...VALID, farbe }, /Farbe/)
})

test('validateDesign: Kurztext höchstens 120 Zeichen, ohne Steuerzeichen, ohne Zucht-Begriffe, leer erlaubt', () => {
  assert.equal(MAX_KURZTEXT_LENGTH, 120)
  assert.equal(validateDesign({ ...VALID, kurztext: 'x'.repeat(120) }).kurztext.length, 120)
  rejects({ ...VALID, kurztext: 'x'.repeat(121) }, /120/)
  assert.equal(validateDesign({ ...VALID, kurztext: 'Erste\nZeile‮umgedreht\u0007' }).kurztext, 'ErsteZeileumgedreht')
  // Unsichtbare Zeichen (Nullbreite, Richtungsmarken, BOM, Zeilentrenner) kommen nicht auf die Karte.
  assert.equal(validateDesign({ ...VALID, kurztext: 'Null​breite‏﻿ Marke؜' }).kurztext, 'NullbreiteMarke')
  assert.equal(validateDesign({ ...VALID, kurztext: '' }).kurztext, '')
  assert.equal(validateDesign({ ...VALID, kurztext: '   ' }).kurztext, '')
  rejects({ ...VALID, kurztext: 42 }, /Kurztext/)
  assert.throws(() => validateDesign({ ...VALID, kurztext: 'Welpen aus eigener Zucht' }), (err) => err.status === 400)
})

test('validateDesign: Schalter nur als echte Booleans', () => {
  for (const key of ['zeigeAnsprechperson', 'zeigeWebsite', 'zeigeTelefon', 'zeigeEmail', 'mitGutschein']) {
    for (const value of ['true', 1, 0, null, undefined]) rejects({ ...VALID, [key]: value }, new RegExp(key))
  }
})

test('validateDesign: unbekannte oder fehlende Felder und Nicht-Objekte -> 400', () => {
  rejects({ ...VALID, schrift: 'comic' }, /schrift/)
  rejects({ ...VALID, __proto__: { vorlage: 'foto' }, extra: 1 }, /extra/)
  const { farbe, ...ohneFarbe } = VALID
  assert.ok(farbe)
  rejects(ohneFarbe, /farbe/)
  for (const input of [null, undefined, 'foto', [VALID], 7]) rejects(input, /Gestaltung/)
})

test('defaultKurztext: Portal-Titel, sonst der erste Satz des Portal-Texts, nie länger als 120 Zeichen', () => {
  assert.equal(defaultKurztext(PARTNER), 'Gemeinsam lernen auf der Wiese')
  assert.equal(defaultKurztext({ ...PARTNER, portal_titel: '  ' }), 'Wir trainieren in kleinen Gruppen.')
  const lang = `${'Sehr lange Beschreibung ohne Punkt '.repeat(6)}`
  const kurz = defaultKurztext({ portal_titel: null, portal_text: lang })
  assert.ok(kurz.length <= 120)
  assert.ok(kurz.endsWith('…'))
  assert.equal(kurz.includes('  '), false)
  assert.equal(defaultKurztext({ portal_titel: null, portal_text: null }), '')
})

test('defaultDesign: Klassisch in der Partnerfarbe, Ansprechperson nur, wenn eingetragen, ohne Gutschein', () => {
  assert.deepEqual(defaultDesign(PARTNER), {
    vorlage: 'klassisch',
    farbe: '#2a6f4e',
    kurztext: 'Gemeinsam lernen auf der Wiese',
    zeigeAnsprechperson: true,
    zeigeWebsite: true,
    zeigeTelefon: true,
    zeigeEmail: true,
    mitGutschein: false
  })
  const ohne = defaultDesign({ name: 'Salon', farbe: null, ansprechperson: null })
  assert.equal(ohne.farbe, DEFAULT_FARBE)
  assert.equal(ohne.zeigeAnsprechperson, false)
  // Eine kaputte Partnerfarbe (Altbestand) fällt auf die Standardfarbe zurück.
  assert.equal(defaultDesign({ ...PARTNER, farbe: 'rot' }).farbe, DEFAULT_FARBE)
})

test('storedDesign: gespeicherte JSON-Gestaltung, fehlerhafte Einträge fallen auf die Vorgabe zurück', () => {
  assert.deepEqual(storedDesign(JSON.stringify(validateDesign(VALID)), PARTNER), validateDesign(VALID))
  assert.deepEqual(storedDesign(null, PARTNER), defaultDesign(PARTNER))
  assert.deepEqual(storedDesign('{kaputt', PARTNER), defaultDesign(PARTNER))
  assert.deepEqual(storedDesign(JSON.stringify({ ...VALID, vorlage: 'bunt' }), PARTNER), defaultDesign(PARTNER))
})
