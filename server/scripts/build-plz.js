'use strict'

// Postleitzahlen: GeoNames (geonames.org), CC BY 4.0.
// Erzeugt server/geo/plz-de.json aus der GeoNames-Postleitzahlen-Datei "DE.txt".
// Quelle und Lizenz siehe server/geo/README.md; die Rohdatei selbst wird nicht committet.
//
// Aufruf: node scripts/build-plz.js <Pfad zu DE.txt> [Ausgabe-Pfad]
// Spalten (tab-getrennt, ohne Kopfzeile): Land, PLZ, Ort, Land(1), Code, Kreis(2), Code, (3), Code,
// Breite, Länge, Genauigkeit.

const fs = require('node:fs')
const path = require('node:path')
const readline = require('node:readline')

const PLZ_COL = 1
const ORT_COL = 2
const LAT_COL = 9
const LON_COL = 10
const MIN_COLUMNS = 11

const DEFAULT_OUTPUT = path.join(__dirname, '..', 'geo', 'plz-de.json')

// Namen, die nach Firma statt nach Ort aussehen (Großkunden-PLZ) - werden bei der Ortswahl
// ignoriert, solange für die PLZ noch mindestens ein anderer Name übrig bleibt.
const COMPANY_RE = /\b(GmbH|AG|KG|mbH|e\.V\.|SE|Co\.|Verwaltung|Vertrieb|Bank|Versicherung)\b/

function round3(value) {
  return Math.round(value * 1000) / 1000
}

// Liest die GeoNames-Datei zeilenweise und liefert gültige { plz, ort, lat, lon }-Zeilen.
// Zeilen mit zu wenigen Spalten oder ohne verwertbare PLZ/Koordinaten werden übersprungen.
async function readRows(filePath) {
  const rows = []
  const input = fs.createReadStream(filePath, { encoding: 'utf8' })
  const rl = readline.createInterface({ input, crlfDelay: Infinity })

  for await (const line of rl) {
    if (!line.trim()) continue
    const cols = line.split('\t')
    if (cols.length < MIN_COLUMNS) continue

    const plzCode = cols[PLZ_COL]
    const ort = cols[ORT_COL]
    const lat = Number.parseFloat(cols[LAT_COL])
    const lon = Number.parseFloat(cols[LON_COL])
    if (!/^\d{5}$/.test(plzCode) || !ort || !Number.isFinite(lat) || !Number.isFinite(lon)) continue

    rows.push({ plz: plzCode, ort, lat, lon })
  }
  return rows
}

// Wählt den häufigsten Ortsnamen einer PLZ-Gruppe. Firmenklingende Namen zählen nur mit, wenn
// sonst kein anderer Name übrig bliebe (z. B. reine Großkunden-PLZ ohne "echten" Ortsnamen).
function pickOrt(names) {
  const nonCompany = names.filter((name) => !COMPANY_RE.test(name))
  const candidates = nonCompany.length > 0 ? nonCompany : names

  const counts = new Map()
  for (const name of candidates) counts.set(name, (counts.get(name) || 0) + 1)

  let best = candidates[0]
  let bestCount = 0
  for (const [name, count] of counts) {
    if (count > bestCount) {
      best = name
      bestCount = count
    }
  }
  return best
}

// Gruppiert die Zeilen nach PLZ: Mittelwert von lat/lon (gerundet auf 3 Nachkommastellen) und den
// häufigsten Ortsnamen je PLZ. Reihenfolge der Rückgabe: aufsteigend nach PLZ (Zeichenkette).
function buildPlzTable(rows) {
  const groups = new Map()
  for (const row of rows) {
    let group = groups.get(row.plz)
    if (!group) {
      group = { latSum: 0, lonSum: 0, count: 0, names: [] }
      groups.set(row.plz, group)
    }
    group.latSum += row.lat
    group.lonSum += row.lon
    group.count += 1
    group.names.push(row.ort)
  }

  const plzCodes = [...groups.keys()].sort()
  return plzCodes.map((plzCode) => {
    const group = groups.get(plzCode)
    const lat = round3(group.latSum / group.count)
    const lon = round3(group.lonSum / group.count)
    return [plzCode, [lat, lon, pickOrt(group.names)]]
  })
}

// Baut die kompakte JSON-Ausgabe von Hand statt über JSON.stringify(Object.fromEntries(...)):
// PLZ ohne führende Null (z. B. "10115") sind gültige Array-Index-Schlüssel, JS-Engines sortieren
// solche Objekt-Schlüssel beim Serialisieren automatisch um und würden PLZ mit führender Null
// (z. B. "01945") ans Ende reißen. Handgebaut bleibt die PLZ-Sortierung verlässlich.
function serialize(entries) {
  const parts = entries.map(([plzCode, value]) => `${JSON.stringify(plzCode)}:${JSON.stringify(value)}`)
  return `{${parts.join(',')}}`
}

async function main() {
  const inputPath = process.argv[2]
  if (!inputPath) {
    console.error('Aufruf: node scripts/build-plz.js <Pfad zu DE.txt> [Ausgabe-Pfad]')
    process.exitCode = 1
    return
  }
  const outputPath = process.argv[3] ? path.resolve(process.argv[3]) : DEFAULT_OUTPUT

  const rows = await readRows(inputPath)
  const entries = buildPlzTable(rows)

  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, serialize(entries))

  console.log(`${entries.length} PLZ aus ${rows.length} Zeilen nach ${outputPath} geschrieben.`)
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
}

module.exports = { readRows, buildPlzTable, pickOrt, round3, serialize }
