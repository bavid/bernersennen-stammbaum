const test = require('node:test')
const assert = require('node:assert/strict')
const {
  VORLAGEN,
  KARTEN,
  DEFAULT_KARTE,
  KEYS,
  MAX_KURZTEXT_LENGTH,
  MAX_WIDMUNG_LENGTH,
  DEFAULT_FARBE,
  defaultDesign,
  defaultKurztext,
  validateDesign,
  mergeLegacyDesigns,
  storedDesign
} = require('../lib/visitenkarteDesign')

// Phase V5, Feedback-Runde: die Gestaltung der Karten eines Partners - EINE Vorderseite (Vorlage, Farbe, Kurztext,
// persönliche Zeile, Schalter) für alle Kombinationen und die gewählte Kombination (karte: Visitenkarte, Einladungskarte
// oder Kombi). Reine Prüfung ohne Datenbank, dazu das Zusammenführen der früher getrennten Gestaltungen.

const VALID = Object.freeze({
  karte: 'kombi',
  vorlage: 'foto',
  farbe: '#1F5F8B',
  kurztext: '  Training mit Herz – vom Welpen bis zum Senior  ',
  widmung: '  Für unsere Welpenkurs-Familien  ',
  zeigeAnsprechperson: true,
  zeigeWebsite: true,
  zeigeTelefon: false,
  zeigeEmail: true
})

const PARTNER = Object.freeze({
  id: 7,
  name: 'Hundeschule Wiesengrund',
  farbe: '#2a6f4e',
  portal_titel: 'Gemeinsam lernen auf der Wiese',
  portal_text: 'Wir trainieren in kleinen Gruppen. Jeder Hund lernt in seinem Tempo, mit viel Lob und Geduld.',
  ansprechperson: 'Wilma Feld'
})

// Frühere Formen (vor der Feedback-Runde): die Visitenkarte mit Gutschein-Schalter, die Einladungskarte mit Zeile.
const OLD_VISITENKARTE = Object.freeze({
  vorlage: 'schlicht',
  farbe: '#3f4b39',
  kurztext: 'Gemeinsam lernen',
  zeigeAnsprechperson: false,
  zeigeWebsite: true,
  zeigeTelefon: false,
  zeigeEmail: true,
  mitGutschein: false
})
const OLD_EINLADUNG = Object.freeze({
  vorlage: 'klassisch',
  farbe: '#2f6b3f',
  kurztext: 'Training mit Herz',
  widmung: 'Für unsere Welpenkurs-Familien',
  zeigeAnsprechperson: true,
  zeigeWebsite: true,
  zeigeTelefon: true,
  zeigeEmail: false
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
    kurztext: 'Training mit Herz – vom Welpen bis zum Senior',
    widmung: 'Für unsere Welpenkurs-Familien'
  })
  assert.deepEqual(VORLAGEN, ['klassisch', 'foto', 'schlicht'])
  assert.deepEqual(KEYS, ['karte', 'vorlage', 'farbe', 'kurztext', 'widmung', 'zeigeAnsprechperson', 'zeigeWebsite', 'zeigeTelefon', 'zeigeEmail'])
})

test('validateDesign: Kombination nur aus der festen Liste, Kombi ist die Vorgabe', () => {
  assert.deepEqual(KARTEN, ['visitenkarte', 'einladung', 'kombi', 'geschenk'])
  assert.equal(DEFAULT_KARTE, 'kombi')
  for (const karte of KARTEN) assert.equal(validateDesign({ ...VALID, karte }).karte, karte)
  for (const karte of ['gutschein', '', null, 1, 'KOMBI']) rejects({ ...VALID, karte }, /Kombination/)
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
  assert.equal(validateDesign({ ...VALID, kurztext: 'Null\u200Bbreite\u200F\uFEFF\u2028Marke\u061C\u2060' }).kurztext, 'NullbreiteMarke')
  // Emoji-Folgen mit Nullbreiten-Verbinder bleiben ganz (Hund + ZWJ + Weste = Assistenzhund).
  assert.equal(validateDesign({ ...VALID, kurztext: 'Wir \u{1F415}\u200D\u{1F9BA} lieben Hunde' }).kurztext, 'Wir \u{1F415}\u200D\u{1F9BA} lieben Hunde')
  assert.equal(validateDesign({ ...VALID, kurztext: '' }).kurztext, '')
  assert.equal(validateDesign({ ...VALID, kurztext: '   ' }).kurztext, '')
  rejects({ ...VALID, kurztext: 42 }, /Kurztext/)
  assert.throws(() => validateDesign({ ...VALID, kurztext: 'Welpen aus eigener Zucht' }), (err) => err.status === 400)
})

test('validateDesign: persönliche Zeile leer erlaubt, höchstens 80 Zeichen, ohne unsichtbare Zeichen und Zucht-Angebote', () => {
  assert.equal(MAX_WIDMUNG_LENGTH, 80)
  assert.equal(validateDesign({ ...VALID, widmung: '' }).widmung, '')
  assert.equal(validateDesign({ ...VALID, widmung: 'x'.repeat(80) }).widmung.length, 80)
  rejects({ ...VALID, widmung: 'x'.repeat(81) }, /höchstens 80 Zeichen/)
    assert.equal(validateDesign({ ...VALID, widmung: 'Für\u200B euch\u202E' }).widmung, 'Für euch')
  rejects({ ...VALID, widmung: 'Welpen abzugeben' }, /Zucht/)
  // Unsichtbares mitten im Wort (Nullbreiten-Nichtverbinder, Silbentrennzeichen, Tag-Zeichen) schützt nicht vor der Prüfung.
    for (const hidden of ['\u200C', '\u00AD', '\u{E0041}']) {
    rejects({ ...VALID, widmung: `Unsere Zu${hidden}cht` }, /Zucht/)
    rejects({ ...VALID, kurztext: `Hunde${hidden}züchter aus der Region` }, /Zucht/)
  }
  rejects({ ...VALID, widmung: 42 }, /Text/)
})

test('validateDesign: Schalter nur als echte Booleans', () => {
  for (const key of ['zeigeAnsprechperson', 'zeigeWebsite', 'zeigeTelefon', 'zeigeEmail']) {
    for (const value of ['true', 1, 0, null, undefined]) rejects({ ...VALID, [key]: value }, new RegExp(key))
  }
})

test('validateDesign: unbekannte (auch der frühere Gutschein-Schalter und Texte der Rückseite) oder fehlende Felder -> 400', () => {
  rejects({ ...VALID, schrift: 'comic' }, /schrift/)
  rejects({ ...VALID, mitGutschein: true }, /Unbekanntes Feld: mitGutschein/)
  rejects({ ...VALID, titel: 'Eigene Rückseite' }, /Unbekanntes Feld: titel/)
  rejects({ ...VALID, __proto__: { vorlage: 'foto' }, extra: 1 }, /extra/)
  const { karte, ...ohneKarte } = VALID
  assert.ok(karte)
  rejects(ohneKarte, /Es fehlt: karte/)
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

test('defaultDesign: Kombi, Klassisch in der Partnerfarbe, ohne persönliche Zeile, Ansprechperson nur, wenn eingetragen', () => {
  assert.deepEqual(defaultDesign(PARTNER), {
    karte: 'kombi',
    vorlage: 'klassisch',
    farbe: '#2a6f4e',
    kurztext: 'Gemeinsam lernen auf der Wiese',
    widmung: '',
    zeigeAnsprechperson: true,
    zeigeWebsite: true,
    zeigeTelefon: true,
    zeigeEmail: true
  })
  const ohne = defaultDesign({ name: 'Salon', farbe: null, ansprechperson: null })
  assert.equal(ohne.farbe, DEFAULT_FARBE)
  assert.equal(ohne.zeigeAnsprechperson, false)
  // Eine kaputte Partnerfarbe (Altbestand) fällt auf die Standardfarbe zurück.
  assert.equal(defaultDesign({ ...PARTNER, farbe: 'rot' }).farbe, DEFAULT_FARBE)
})

test('mergeLegacyDesigns: Vorderseite der Visitenkarte, Zeile der Einladungskarte, Kombination aus dem Gedruckten', () => {
  const { mitGutschein, ...front } = OLD_VISITENKARTE
  assert.equal(mitGutschein, false)
  // Beide gespeichert: die Visitenkarte gewinnt, die persönliche Zeile kommt von der Einladungskarte.
  assert.deepEqual(mergeLegacyDesigns(OLD_VISITENKARTE, OLD_EINLADUNG, PARTNER), {
    karte: 'visitenkarte',
    ...front,
    widmung: 'Für unsere Welpenkurs-Familien'
  })
  // Visitenkarte mit Gutschein -> Kombi (Portal und Code); nur eine Einladungskarte -> Einladungskarte.
  assert.equal(mergeLegacyDesigns({ ...OLD_VISITENKARTE, mitGutschein: true }, null, PARTNER).karte, 'kombi')
  const nurEinladung = mergeLegacyDesigns(null, OLD_EINLADUNG, PARTNER)
  assert.deepEqual(nurEinladung, { karte: 'einladung', ...OLD_EINLADUNG })
  // Eine kaputte Visitenkarte: die Vorderseite der Einladungskarte, sonst die Vorgabe - nie ein Fehler.
  assert.equal(mergeLegacyDesigns({ ...OLD_VISITENKARTE, vorlage: 'bunt' }, OLD_EINLADUNG, PARTNER).vorlage, 'klassisch')
  const kaputt = mergeLegacyDesigns({ vorlage: 'bunt' }, { widmung: 'x'.repeat(200) }, PARTNER)
  assert.deepEqual(kaputt, { ...defaultDesign(PARTNER), karte: 'visitenkarte', widmung: '' })
  assert.deepEqual(mergeLegacyDesigns(null, null, PARTNER), defaultDesign(PARTNER))
})

test('storedDesign: neue Form geprüft; frühere getrennte Gestaltungen zusammengeführt; Fehlerhaftes -> Vorgabe', (t) => {
  const clean = validateDesign(VALID)
  assert.deepEqual(storedDesign(JSON.stringify(clean), PARTNER), clean)
  assert.deepEqual(storedDesign(JSON.stringify(clean), PARTNER, JSON.stringify(OLD_EINLADUNG)), clean, 'neue Form gewinnt')
  assert.deepEqual(storedDesign(null, PARTNER), defaultDesign(PARTNER))
  assert.deepEqual(storedDesign(JSON.stringify(OLD_VISITENKARTE), PARTNER, JSON.stringify(OLD_EINLADUNG)), mergeLegacyDesigns(OLD_VISITENKARTE, OLD_EINLADUNG, PARTNER))
  assert.equal(storedDesign(null, PARTNER, JSON.stringify(OLD_EINLADUNG)).karte, 'einladung')
  const warn = t.mock.method(console, 'warn', () => {})
  assert.deepEqual(storedDesign('{kaputt', PARTNER), defaultDesign(PARTNER))
  assert.deepEqual(storedDesign(JSON.stringify({ ...clean, vorlage: 'bunt' }), PARTNER), defaultDesign(PARTNER))
  assert.ok(warn.mock.callCount() >= 2)
  assert.equal(warn.mock.calls.some((call) => String(call.arguments[0]).includes('Training')), false, 'kein Inhalt im Protokoll')
})
