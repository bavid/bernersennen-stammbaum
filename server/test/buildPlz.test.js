const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { pickOrt } = require('../scripts/build-plz')

// Drei Zeilen im GeoNames-Format, eine davon mit Firmenname - prüft Gruppierung, Mittelwert-Bildung
// und Ortswahl (Firmenname wird ignoriert, solange ein anderer Name existiert).
const FIXTURE_ROWS = [
  ['DE', '12345', 'Musterstadt', 'Land', '00', 'Kreis', '000', 'Amt', '00000', '52.100', '13.100', '4'],
  ['DE', '12345', 'Musterstadt GmbH', 'Land', '00', 'Kreis', '000', 'Amt', '00000', '52.110', '13.110', '4'],
  ['DE', '12345', 'Musterstadt GmbH', 'Land', '00', 'Kreis', '000', 'Amt', '00000', '52.120', '13.120', '4'],
  // eigene PLZ, um Gruppierung (nichts vermischt sich) zu prüfen
  ['DE', '54321', 'Anderswald', 'Land', '00', 'Kreis', '000', 'Amt', '00000', '50.000', '8.000', '4']
]

function writeFixture(dir) {
  const filePath = path.join(dir, 'DE-fixture.txt')
  const text = FIXTURE_ROWS.map((cols) => cols.join('\t')).join('\n') + '\n'
  fs.writeFileSync(filePath, text, 'utf8')
  return filePath
}

test('build-plz.js: gruppiert nach PLZ, mittelt Koordinaten und ignoriert Firmennamen bei der Ortswahl', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronik-build-plz-'))
  const fixturePath = writeFixture(dir)
  const outputPath = path.join(dir, 'plz-out.json')
  const serverDir = path.join(__dirname, '..')

  const output = execFileSync(process.execPath, ['scripts/build-plz.js', fixturePath, outputPath], { cwd: serverDir }).toString()
  assert.match(output, /2 PLZ aus 4 Zeilen/)

  const table = JSON.parse(fs.readFileSync(outputPath, 'utf8'))
  assert.deepEqual(Object.keys(table).sort(), ['12345', '54321'])

  // Mittelwert von 52.100 / 52.110 / 52.120 = 52.11, von 13.100 / 13.110 / 13.120 = 13.11.
  const [lat, lon, ort] = table['12345']
  assert.equal(lat, 52.11)
  assert.equal(lon, 13.11)
  // "Musterstadt GmbH" kommt zweimal vor, "Musterstadt" nur einmal - trotzdem gewinnt der
  // Nicht-Firmenname, weil er (als einziger Nicht-Firmenname) den Firmennamen aussticht.
  assert.equal(ort, 'Musterstadt')

  assert.deepEqual(table['54321'], [50, 8, 'Anderswald'])
})

// Die alte Regex fing nur ganze Wörter wie "Verwaltung" oder "Versicherung" - Wortstämme in
// zusammengesetzten Firmennamen ("Verwaltungsgesellschaft", "Vertriebszentrum") rutschten durch, weil
// nach dem Stamm noch Buchstaben folgen (keine Wortgrenze). Damit gewann sogar ein häufigerer
// Firmenname gegen den selteneren echten Ortsnamen. Jeder Firmenname hier taucht bewusst ÖFTER auf als
// der echte Ort UND enthält KEIN eigenständiges "GmbH"/"AG"/... Wort - nur so testet der Fall wirklich
// den neuen Wortstamm-Treffer und nicht die schon vorher erkannten ganzen Wörter.
test('pickOrt: erkennt auch Firmen-Wortstämme (Verwaltungsgesellschaft, Vertriebs-, Versicherungs-, Gesellschaft)', () => {
  const cases = [
    ['Musterstadt', 'Musterstadt Verwaltungsgesellschaft'],
    ['Musterstadt', 'Musterstadt Vertriebszentrum'],
    ['Musterstadt', 'Musterstadt Versicherungsdienste'],
    ['Musterstadt', 'Musterstadt Gesellschafterversammlung']
  ]
  for (const [real, company] of cases) {
    // Firmenname 2x, echter Ort 1x - ohne Stamm-Erkennung würde die (häufigere) Firma gewinnen.
    assert.equal(pickOrt([real, company, company]), real, `sollte "${real}" statt "${company}" wählen`)
  }
})

// "Holding" ist (wie GmbH/AG/KG/...) ein ganzes Wort mit Wortgrenze - anders als die vier Stämme oben.
test('pickOrt: "Holding" als eigenes Wort gilt weiter als Firmenname', () => {
  assert.equal(pickOrt(['Musterstadt', 'Musterstadt Holding', 'Musterstadt Holding']), 'Musterstadt')
})

// Echte deutsche Ortsnamen dürfen durch die erweiterten (nicht wortgrenzen-verankerten) Stämme nicht
// fälschlich als Firma gelten - sonst bliebe für die PLZ am Ende gar kein Ortsname übrig.
test('pickOrt: reale Ortsnamen bleiben trotz der erweiterten Firmen-Erkennung unangetastet', () => {
  const townNames = ['Gesell', 'Vertrieb-Wüstung', 'Versicherungsstädt', 'Holdingen', 'Verwaltungsheim']
  for (const name of townNames) {
    assert.equal(pickOrt([name]), name, `einziger Name "${name}" muss trotzdem gewählt werden`)
  }
})

test('build-plz.js: ohne Pfad zur Quelldatei bricht das Skript mit Fehlermeldung ab', () => {
  const serverDir = path.join(__dirname, '..')
  assert.throws(() => execFileSync(process.execPath, ['scripts/build-plz.js'], { cwd: serverDir, stdio: 'pipe' }))
})
