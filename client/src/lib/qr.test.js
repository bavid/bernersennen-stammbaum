import { describe, expect, test } from 'vitest'
import qrcode from 'qrcode-generator'
import { qrSvgPath } from './qr.js'

// Ein Ziel, wie es die Druckseite baut: Adresse, /v und der Code hinter der Raute.
const TARGET = 'https://beispiel-chronik.de/v#ABCD-EFGH-JKLM'
const RUN_RE = /M(\d+) (\d+)h(\d+)v1h-(\d+)z/g

// Baut aus dem Pfad wieder die Matrix dunkler Module (Zeile, Spalte) auf.
function darkCellsFromPath(path) {
  const cells = new Set()
  for (const match of path.matchAll(RUN_RE)) {
    const [, x, y, width, back] = match.map(Number)
    expect(width).toBe(back)
    for (let dx = 0; dx < width; dx += 1) cells.add(`${y}:${x + dx}`)
  }
  return cells
}

function libraryDarkCells(text, ecc) {
  const qr = qrcode(0, ecc)
  qr.addData(text, 'Byte')
  qr.make()
  const size = qr.getModuleCount()
  const cells = new Set()
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (qr.isDark(row, col)) cells.add(`${row}:${col}`)
    }
  }
  return { size, cells }
}

describe('qrSvgPath', () => {
  test('liefert Größe und Pfad, die genau der Matrix der Bibliothek entsprechen', () => {
    const { size, path } = qrSvgPath(TARGET)
    const expected = libraryDarkCells(TARGET, 'M')

    expect(size).toBe(expected.size)
    expect(darkCellsFromPath(path)).toEqual(expected.cells)
  })

  test('der Pfad ist ein gültiger, nur aus Rechteck-Läufen bestehender SVG-Pfad', () => {
    const { size, path } = qrSvgPath(TARGET)

    expect(path).toMatch(/^(M\d+ \d+h\d+v1h-\d+z)+$/)
    // QR-Versionen sind 21, 25, 29, … Module groß.
    expect(size).toBeGreaterThanOrEqual(21)
    expect((size - 21) % 4).toBe(0)
    // Kein Lauf ragt über den Rand hinaus.
    for (const [, x, y, width] of path.matchAll(RUN_RE)) {
      expect(Number(x) + Number(width)).toBeLessThanOrEqual(size)
      expect(Number(y)).toBeLessThan(size)
    }
  })

  test('ist deterministisch', () => {
    expect(qrSvgPath(TARGET)).toEqual(qrSvgPath(TARGET))
  })

  test('Fehlerkorrektur M ist Standard, eine andere Stufe ergibt einen anderen Code', () => {
    expect(qrSvgPath(TARGET)).toEqual(qrSvgPath(TARGET, { ecc: 'M' }))
    const high = qrSvgPath(TARGET, { ecc: 'H' })
    expect(high).not.toEqual(qrSvgPath(TARGET))
    expect(darkCellsFromPath(high.path)).toEqual(libraryDarkCells(TARGET, 'H').cells)
  })

  test('kodiert Text als UTF-8 (Umlaute in einer Domain gehen nicht verloren)', () => {
    expect(qrcode.stringToBytes('ä')).toEqual([0xc3, 0xa4])
    expect(qrSvgPath('https://bärenstark.de/v#ABCD').path).toMatch(/^(M\d+ \d+h\d+v1h-\d+z)+$/)
  })

  test('leerer Text ist ein Fehler', () => {
    expect(() => qrSvgPath('')).toThrow()
  })
})
