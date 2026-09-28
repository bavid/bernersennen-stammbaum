const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { lookupPlz, roundCoord, validCoords, distanceKm } = require('../lib/geo')

test('lookupPlz: bekannte PLZ liefert plausible Koordinaten und Ort', () => {
  const berlin = lookupPlz('10115')
  assert.ok(berlin, 'PLZ 10115 sollte gefunden werden')
  assert.equal(berlin.ort, 'Berlin')
  assert.ok(berlin.lat > 52 && berlin.lat < 53, `lat ${berlin.lat} sollte um Berlin liegen`)
  assert.ok(berlin.lon > 13 && berlin.lon < 14, `lon ${berlin.lon} sollte um Berlin liegen`)
})

test('lookupPlz: ungültiges Format ergibt null', () => {
  assert.equal(lookupPlz('abcde'), null)
  assert.equal(lookupPlz('1234'), null)
  assert.equal(lookupPlz('123456'), null)
  assert.equal(lookupPlz(''), null)
  assert.equal(lookupPlz(null), null)
  assert.equal(lookupPlz(undefined), null)
  assert.equal(lookupPlz(10115), null)
})

test('lookupPlz: unbekannte, aber formal gültige PLZ ergibt null', () => {
  assert.equal(lookupPlz('00000'), null)
})

test('distanceKm: Berlin–Hamburg liegt bei etwa 255 km', () => {
  const berlin = lookupPlz('10115')
  const hamburg = lookupPlz('20095')
  const km = distanceKm(berlin, hamburg)
  assert.ok(Math.abs(km - 255) <= 5, `Distanz ${km} km sollte 255 km ±5 sein`)
})

test('distanceKm: derselbe Punkt hat Abstand 0', () => {
  const point = { lat: 52.5, lon: 13.4 }
  assert.equal(distanceKm(point, point), 0)
})

test('roundCoord: rundet kaufmännisch auf die angegebene Schrittweite', () => {
  assert.equal(roundCoord(52.567), 52.57)
  assert.equal(roundCoord(52.564), 52.56)
  assert.equal(roundCoord(52.565), 52.57)
})

test('roundCoord: eigene Schrittweite wird respektiert', () => {
  // Gleitkomma-Division kann winzige Artefakte erzeugen (z. B. 52.050000000000004) - Vergleich
  // deshalb mit Tolerenz statt strikter Gleichheit.
  assert.ok(Math.abs(roundCoord(52.03, 0.05) - 52.05) < 1e-9)
  assert.ok(Math.abs(roundCoord(52.01, 0.05) - 52) < 1e-9)
})

test('validCoords: Grenzen für Deutschland plus Rand', () => {
  assert.equal(validCoords(47, 5.5), true)
  assert.equal(validCoords(55.2, 15.5), true)
  assert.equal(validCoords(46.9, 10), false)
  assert.equal(validCoords(55.3, 10), false)
  assert.equal(validCoords(50, 5.4), false)
  assert.equal(validCoords(50, 15.6), false)
  assert.equal(validCoords(Number.NaN, 10), false)
  assert.equal(validCoords(50, Number.POSITIVE_INFINITY), false)
})

test('plz-de.json: kompakt ohne überflüssigen Leerraum (eine Zeile, keine Einrückung)', () => {
  const jsonPath = path.join(__dirname, '..', 'geo', 'plz-de.json')
  const raw = fs.readFileSync(jsonPath, 'utf8')
  assert.equal(raw.includes('\n'), false, 'die Datei sollte aus einer einzigen Zeile bestehen')
  // Ortsnamen dürfen Leerzeichen enthalten ("Bad Schandau") - "ohne Leerzeichen" bezieht sich auf die
  // JSON-Struktur selbst. Re-Serialisieren ohne Einrückung darf die Länge deshalb nicht verkürzen.
  const table = JSON.parse(raw)
  assert.equal(raw.length, JSON.stringify(table).length, 'die Datei sollte bereits maximal kompakt sein')
})

test('plz-de.json: über 8000 Einträge im Format { "PLZ": [lat, lon, "Ort"] }', () => {
  const jsonPath = path.join(__dirname, '..', 'geo', 'plz-de.json')
  const raw = fs.readFileSync(jsonPath, 'utf8')

  const table = JSON.parse(raw)
  const keys = Object.keys(table)
  assert.ok(keys.length > 8000, `erwarte über 8000 Einträge, sind ${keys.length}`)

  for (const code of keys) {
    assert.match(code, /^\d{5}$/, `PLZ-Schlüssel "${code}" sollte 5 Ziffern haben`)
    const entry = table[code]
    assert.ok(Array.isArray(entry) && entry.length === 3, `Eintrag für ${code} sollte [lat, lon, ort] sein`)
    const [lat, lon, ort] = entry
    assert.equal(typeof lat, 'number')
    assert.equal(typeof lon, 'number')
    assert.equal(typeof ort, 'string')
    assert.ok(ort.length > 0, `Ort für ${code} sollte nicht leer sein`)
  }
})

test('plz-de.json: Datei ist nach PLZ aufsteigend sortiert', () => {
  // Object.keys() auf dem geparsten Objekt eignet sich hier NICHT: JS-Engines ziehen Array-Index-
  // artige Schlüssel (PLZ ohne führende Null) automatisch nach vorn und sortieren sie numerisch,
  // während PLZ mit führender Null (z. B. "01945") hinten in Einfügereihenfolge landen. Deshalb
  // wird die Schlüsselreihenfolge direkt aus dem rohen Dateitext gelesen.
  const jsonPath = path.join(__dirname, '..', 'geo', 'plz-de.json')
  const raw = fs.readFileSync(jsonPath, 'utf8')
  const keysInFile = [...raw.matchAll(/"(\d{5})":/g)].map((m) => m[1])
  const sorted = [...keysInFile].sort()
  assert.deepEqual(keysInFile, sorted)
})
