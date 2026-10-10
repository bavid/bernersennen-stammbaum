'use strict'

// security-review Phase T Finding 12: dasselbe Anliegen wie lib/stripJpegMetadata.js, für PNG. PNGs
// tragen Metadaten in eigenen "ancillary chunks" (tEXt/iTXt/zTXt für Freitext, eXIf für eingebettete
// EXIF-Daten inkl. GPS) - die werden hier entfernt, alle anderen Chunks (IHDR, PLTE, IDAT, IEND, ...)
// bleiben byteidentisch und in ihrer ursprünglichen Reihenfolge erhalten.
//
// Wie beim JPEG-Walker fail closed: keine PNG-Signatur -> Buffer unverändert (kein PNG, nichts zu tun); eine
// Chunk-Länge zeigt über das Bufferende hinaus (abgeschnittener oder manipulierter Chunk, der Metadaten tragen
// könnte) -> null, der Aufrufer lehnt mit 400 ab. Bytes nach IEND (manche Handys hängen etwas an) fallen weg.

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const DROP_CHUNK_TYPES = new Set(['tEXt', 'iTXt', 'zTXt', 'eXIf'])
const CHUNK_HEADER_LENGTH = 8 // 4 Byte Länge + 4 Byte Typ
const CHUNK_CRC_LENGTH = 4

function walkChunks(buffer) {
  const chunks = [buffer.subarray(0, PNG_SIGNATURE.length)]
  let offset = PNG_SIGNATURE.length

  while (offset < buffer.length) {
    if (offset + CHUNK_HEADER_LENGTH + CHUNK_CRC_LENGTH > buffer.length) return null
    const dataLength = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const chunkEnd = offset + CHUNK_HEADER_LENGTH + dataLength + CHUNK_CRC_LENGTH
    if (chunkEnd > buffer.length) return null // kaputte/unerwartete Struktur

    if (!DROP_CHUNK_TYPES.has(type)) chunks.push(buffer.subarray(offset, chunkEnd))
    offset = chunkEnd
    if (type === 'IEND') break
  }

  return Buffer.concat(chunks)
}

function stripPngMetadata(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < PNG_SIGNATURE.length || !buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return buffer
  }
  try {
    return walkChunks(buffer)
  } catch {
    return null
  }
}

module.exports = { stripPngMetadata }
