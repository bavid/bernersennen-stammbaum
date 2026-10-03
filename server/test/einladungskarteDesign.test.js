const test = require('node:test')
const assert = require('node:assert/strict')
const {
  MAX_WIDMUNG_LENGTH,
  EINLADUNG_KEYS,
  defaultEinladungDesign,
  validateEinladungDesign,
  storedEinladungDesign
} = require('../lib/einladungskarteDesign')

// Einladungskarten: die Vorderseite gestaltet der Partner (wie die Visitenkarte, dazu eine persönliche Zeile), die
// Rückseite Familie auf Pfoten - gespeichert werden nur die Felder der Vorderseite. Reine Prüfung ohne Datenbank.

const VALID = Object.freeze({
  vorlage: 'schlicht',
  farbe: '#2F6B3F',
  kurztext: 'Training mit Herz',
  widmung: '  Für unsere Welpenkurs-Familien  ',
  zeigeAnsprechperson: true,
  zeigeWebsite: false,
  zeigeTelefon: true,
  zeigeEmail: true
})

const PARTNER = Object.freeze({
  id: 7,
  name: 'Hundeschule Wiesengrund',
  farbe: '#2a6f4e',
  portal_titel: 'Gemeinsam lernen auf der Wiese',
  ansprechperson: 'Wilma Feld'
})

function rejects(input, pattern) {
  assert.throws(
    () => validateEinladungDesign(input),
    (err) => err.status === 400 && pattern.test(err.message)
  )
}

test('Einladungskarte: Gestaltung der Vorderseite', async (t) => {
  await t.test('gültig: gesäubert, Farbe klein, die persönliche Zeile getrimmt - nie ein Feld der Rückseite', () => {
    assert.deepEqual(validateEinladungDesign(VALID), { ...VALID, farbe: '#2f6b3f', widmung: 'Für unsere Welpenkurs-Familien' })
    assert.deepEqual(EINLADUNG_KEYS, ['vorlage', 'farbe', 'kurztext', 'widmung', 'zeigeAnsprechperson', 'zeigeWebsite', 'zeigeTelefon', 'zeigeEmail'])
    assert.equal(EINLADUNG_KEYS.includes('mitGutschein'), false)
  })

  await t.test('persönliche Zeile: leer erlaubt, höchstens 80 Zeichen, ohne unsichtbare Zeichen und Zucht-Angebote', () => {
    assert.equal(MAX_WIDMUNG_LENGTH, 80)
    assert.equal(validateEinladungDesign({ ...VALID, widmung: '' }).widmung, '')
    assert.equal(validateEinladungDesign({ ...VALID, widmung: 'x'.repeat(80) }).widmung.length, 80)
    rejects({ ...VALID, widmung: 'x'.repeat(81) }, /höchstens 80 Zeichen/)
    assert.equal(validateEinladungDesign({ ...VALID, widmung: 'Für\u200B euch\u202E' }).widmung, 'Für euch')
    rejects({ ...VALID, widmung: 'Welpen abzugeben' }, /Zucht/)
    // Unsichtbares mitten im Wort (Nullbreiten-Nichtverbinder, Silbentrennzeichen, Tag-Zeichen) schützt nicht vor der Prüfung.
    for (const hidden of ['\u200C', '\u00AD', '\u{E0041}']) {
      rejects({ ...VALID, widmung: `Unsere Zu${hidden}cht` }, /Zucht/)
      rejects({ ...VALID, kurztext: `Hunde${hidden}züchter aus der Region` }, /Zucht/)
    }
    rejects({ ...VALID, widmung: 42 }, /Text/)
  })

  await t.test('die ganze Gestaltung: unbekannte Felder (auch Texte der Rückseite) und fehlende -> 400', () => {
    rejects({ ...VALID, mitGutschein: true }, /Unbekanntes Feld: mitGutschein/)
    rejects({ ...VALID, titel: 'Eigene Rückseite' }, /Unbekanntes Feld: titel/)
    const { widmung, ...ohne } = VALID
    assert.ok(widmung)
    rejects(ohne, /Es fehlt: widmung/)
    rejects(null, /Ungültige Gestaltung/)
    rejects([VALID], /Ungültige Gestaltung/)
    rejects({ ...VALID, vorlage: 'bunt' }, /Vorlage/)
    rejects({ ...VALID, farbe: 'red' }, /#rrggbb/)
    rejects({ ...VALID, zeigeEmail: 'true' }, /true oder false/)
  })

  await t.test('Vorgabe: übernimmt die Visitenkarte des Partners (ohne Gutschein-Schalter), sonst das Profil', () => {
    const visitenkarte = { ...VALID, widmung: undefined, mitGutschein: true, vorlage: 'foto', farbe: '#1f5f8b' }
    delete visitenkarte.widmung
    assert.deepEqual(defaultEinladungDesign(PARTNER, visitenkarte), {
      vorlage: 'foto',
      farbe: '#1f5f8b',
      kurztext: 'Training mit Herz',
      widmung: '',
      zeigeAnsprechperson: true,
      zeigeWebsite: false,
      zeigeTelefon: true,
      zeigeEmail: true
    })
    assert.deepEqual(defaultEinladungDesign(PARTNER), {
      vorlage: 'klassisch',
      farbe: '#2a6f4e',
      kurztext: 'Gemeinsam lernen auf der Wiese',
      widmung: '',
      zeigeAnsprechperson: true,
      zeigeWebsite: true,
      zeigeTelefon: true,
      zeigeEmail: true
    })
  })

  await t.test('gespeicherte Gestaltung: geprüft wie beim Speichern, ungültig -> Vorgabe', () => {
    const clean = validateEinladungDesign(VALID)
    assert.deepEqual(storedEinladungDesign(JSON.stringify(clean), PARTNER), clean)
    assert.deepEqual(storedEinladungDesign(null, PARTNER), defaultEinladungDesign(PARTNER))
    const warn = t.mock.method(console, 'warn', () => {})
    assert.deepEqual(storedEinladungDesign('{"vorlage":"bunt"}', PARTNER), defaultEinladungDesign(PARTNER))
    assert.deepEqual(storedEinladungDesign('kein json', PARTNER, VALID), defaultEinladungDesign(PARTNER, VALID))
    assert.equal(warn.mock.callCount(), 2)
    assert.equal(warn.mock.calls.some((call) => String(call.arguments[0]).includes('Training')), false, 'kein Inhalt im Protokoll')
  })
})
