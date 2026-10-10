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
// Wie bei den anderen Walkern: bei jeder unerwarteten Struktur (keine RIFF/WEBP-Kennung, eine Größe zeigt
// über das Bufferende hinaus, ...) wird der unveränderte Original-Buffer zurückgegeben.

const RIFF_HEADER_LENGTH = 12 // "RIFF" + 4 Byte Größe + "WEBP"
const CHUNK_HEADER_LENGTH = 8 // 4 Byte Typ + 4 Byte Größe (little endian)
const VP8X_MIN_LENGTH = 10
const DROP_CHUNK_TYPES = new Set(['EXIF', 'XMP '])
const VP8X_EXIF_FLAG = 0x08
const VP8X_XMP_FLAG = 0x04

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

// Liefert die zu behaltenden Chunks (je inkl. Kopf und Padding-Byte) oder null bei kaputter Struktur.
function collectChunks(buffer, riffEnd) {
  const chunks = []
  let offset = RIFF_HEADER_LENGTH
  while (offset < riffEnd) {
    if (offset + CHUNK_HEADER_LENGTH > riffEnd) return null
    const type = buffer.toString('ascii', offset, offset + 4)
    const size = buffer.readUInt32LE(offset + 4)
    const chunkEnd = offset + CHUNK_HEADER_LENGTH + size + (size % 2) // Chunks sind auf gerade Länge gepolstert
    if (chunkEnd > riffEnd) return null
    const chunk = buffer.subarray(offset, chunkEnd)
    if (type === 'VP8X') {
      if (size < VP8X_MIN_LENGTH) return null
      chunks.push(clearVp8xFlags(chunk))
    } else if (!DROP_CHUNK_TYPES.has(type)) {
      chunks.push(chunk)
    }
    offset = chunkEnd
  }
  return chunks
}

function stripWebpMetadata(buffer) {
  if (!isWebp(buffer)) return buffer

  try {
    const riffEnd = 8 + buffer.readUInt32LE(4)
    if (riffEnd < RIFF_HEADER_LENGTH || riffEnd > buffer.length) return buffer

    const chunks = collectChunks(buffer, riffEnd)
    if (!chunks) return buffer

    const body = Buffer.concat(chunks)
    const header = Buffer.from(buffer.subarray(0, RIFF_HEADER_LENGTH))
    header.writeUInt32LE(4 + body.length, 4) // "WEBP" + alle Chunks
    // Reste nach dem RIFF-Container (sollte es nicht geben) wie bei PNG unverändert anhängen.
    return Buffer.concat([header, body, buffer.subarray(riffEnd)])
  } catch {
    return buffer
  }
}

module.exports = { stripWebpMetadata }
