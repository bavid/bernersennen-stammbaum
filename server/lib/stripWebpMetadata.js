'use strict'

// security-review Phase T Finding 12: dasselbe Anliegen wie lib/stripJpegMetadata.js und
// lib/stripPngMetadata.js, für WebP. Ein WebP ist ein RIFF-Container ("RIFF" <Größe LE> "WEBP" + Chunks);
// Metadaten stecken in eigenen Chunks: 'EXIF' (inkl. GPS) und 'XMP '. Die werden hier entfernt, alle anderen
// Chunks (VP8 , VP8L, ALPH, ANIM, ANMF, ICCP, ...) bleiben byteidentisch und in ihrer Reihenfolge erhalten.
// Farbprofile (ICCP) bleiben wie bei JPEG (APP2) und PNG (iCCP) bewusst drin - sie tragen keine
// Personendaten, ohne sie kippen aber die Farben.
//
// Im erweiterten Format (VP8X-Chunk) stehen im ersten Nutzdaten-Byte Flags, ob EXIF/XMP vorhanden sind -
// die werden gelöscht, damit Decoder nicht nach fehlenden Chunks suchen. Die RIFF-Größe im Kopf wird neu
// berechnet.
//
// Wie bei den anderen Walkern fail closed: keine RIFF/WEBP-Kennung -> unverändert; eine Größe zeigt über das
// Bufferende hinaus o. Ä. -> null, der Aufrufer lehnt den Upload mit 400 ab (lib/imageMetadata.js).

const RIFF_HEADER_LENGTH = 12 // "RIFF" + 4 Byte Größe + "WEBP"
const CHUNK_HEADER_LENGTH = 8 // 4 Byte Typ + 4 Byte Größe (little endian)
const VP8X_MIN_LENGTH = 10
const DROP_CHUNK_TYPES = new Set(['EXIF', 'XMP '])
const VP8X_EXIF_FLAG = 0x08
const VP8X_XMP_FLAG = 0x04
const PAD_BYTE = Buffer.from([0])

function isWebp(buffer) {
  return (
    Buffer.isBuffer(buffer) &&
    buffer.length >= RIFF_HEADER_LENGTH &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  )
}

// Kopie des VP8X-Chunks mit gelöschten EXIF-/XMP-Flags - das Original bleibt unangetastet.
function clearVp8xFlags(chunk) {
  const copy = Buffer.from(chunk)
  copy[CHUNK_HEADER_LENGTH] &= ~(VP8X_EXIF_FLAG | VP8X_XMP_FLAG) & 0xff
  return copy
}

// Liefert die zu behaltenden Chunks (je inkl. Kopf und Padding-Byte) oder null bei kaputter Struktur. Ein
// ungepolsterter LETZTER Chunk (häufig bei Encodern) wird toleriert und hier mit einem Null-Byte gepolstert.
function collectChunks(buffer, riffEnd) {
  const chunks = []
  let offset = RIFF_HEADER_LENGTH
  while (offset < riffEnd) {
    if (offset + CHUNK_HEADER_LENGTH > riffEnd) return null
    const type = buffer.toString('ascii', offset, offset + 4)
    const size = buffer.readUInt32LE(offset + 4)
    const dataEnd = offset + CHUNK_HEADER_LENGTH + size
    if (dataEnd > riffEnd) return null
    const paddedEnd = dataEnd + (size % 2) // Chunks sind auf gerade Länge gepolstert
    const isUnpadded = paddedEnd > riffEnd
    const chunk = isUnpadded ? Buffer.concat([buffer.subarray(offset, dataEnd), PAD_BYTE]) : buffer.subarray(offset, paddedEnd)
    if (type === 'VP8X') {
      if (size < VP8X_MIN_LENGTH) return null
      chunks.push(clearVp8xFlags(chunk))
    } else if (!DROP_CHUNK_TYPES.has(type)) {
      chunks.push(chunk)
    }
    offset = isUnpadded ? riffEnd : paddedEnd
  }
  return chunks
}

// Ende des RIFF-Containers oder null. Zeigt die RIFF-Größe genau ein Byte über das Dateiende (das Padding des
// letzten Chunks fehlt), gilt das Dateiende.
function riffEndOf(buffer) {
  const riffEnd = 8 + buffer.readUInt32LE(4)
  if (riffEnd === buffer.length + 1) return buffer.length
  if (riffEnd < RIFF_HEADER_LENGTH || riffEnd > buffer.length) return null
  return riffEnd
}

// Kein WebP -> unverändert. Kaputter Container -> null (fail closed, der Aufrufer lehnt mit 400 ab). Bytes nach
// dem RIFF-Container fallen weg.
function stripWebpMetadata(buffer) {
  if (!isWebp(buffer)) return buffer

  try {
    const riffEnd = riffEndOf(buffer)
    if (riffEnd === null) return null
    const chunks = collectChunks(buffer, riffEnd)
    if (!chunks) return null

    const body = Buffer.concat(chunks)
    const header = Buffer.from(buffer.subarray(0, RIFF_HEADER_LENGTH))
    header.writeUInt32LE(4 + body.length, 4) // "WEBP" + alle Chunks
    return Buffer.concat([header, body])
  } catch {
    return null
  }
}

module.exports = { stripWebpMetadata }
