import qrcode from 'qrcode-generator'

// QR-Codes für die Druckkarten (VoucherCard.jsx): kapselt qrcode-generator (MIT, ohne Abhängigkeiten) und
// liefert einen einzigen SVG-Pfad für alle dunklen Module - der Aufrufer setzt ihn in
// <svg viewBox="0 0 size size"><path d={path} /></svg>. Die Bibliothek arbeitet rein rechnerisch, es
// entsteht kein <img>, kein Canvas und keine Datei - der Code bleibt im DOM der Druckseite.

// 0 = kleinste Version, in die der Text passt
const AUTO_TYPE_NUMBER = 0
// Fehlerkorrektur M (~15 %): robust genug für Papier und Handykamera, ohne den Code unnötig zu vergrößern
const DEFAULT_ECC = 'M'
const BYTE_MODE = 'Byte'

// Die Bibliothek nimmt Zeichen standardmäßig nur bis 0xff (Latin-1). Lesegeräte erwarten im Byte-Modus
// UTF-8 - so überstehen auch Umlaute in einer Domain den Weg auf die Karte. Einmalig beim Laden gesetzt,
// die Bibliothek kennt keine Einstellung je Aufruf.
const utf8Encoder = new TextEncoder()
qrcode.stringToBytes = (text) => Array.from(utf8Encoder.encode(text))

// Ein Pfad-Lauf je zusammenhängender dunkler Strecke in einer Zeile: kürzer als ein Rechteck je Modul
// und ohne Haarrisse zwischen Nachbarn (shape-rendering="crispEdges" im SVG).
function rowRuns(qr, row, size) {
  const runs = []
  let col = 0
  while (col < size) {
    if (!qr.isDark(row, col)) {
      col += 1
      continue
    }
    const start = col
    while (col < size && qr.isDark(row, col)) col += 1
    const width = col - start
    runs.push(`M${start} ${row}h${width}v1h-${width}z`)
  }
  return runs
}

// { size, path } für text; ecc ist 'L' | 'M' | 'Q' | 'H' (Standard M).
export function qrSvgPath(text, { ecc = DEFAULT_ECC } = {}) {
  if (!text) throw new Error('QR-Code ohne Inhalt')
  const qr = qrcode(AUTO_TYPE_NUMBER, ecc)
  qr.addData(text, BYTE_MODE)
  qr.make()
  const size = qr.getModuleCount()
  const path = Array.from({ length: size }, (_, row) => rowRuns(qr, row, size).join('')).join('')
  return { size, path }
}
