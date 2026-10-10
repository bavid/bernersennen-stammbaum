'use strict'

// Phase V4b (security-review): Prüfung eines schon bereinigten JPG/PNG vor dem Veröffentlichen als Bannerfoto - Maße aus
// dem Kopf (JPEG: SOF-Segment vor dem ersten SOS, PNG: IHDR) und ob noch Metadaten-Segmente übrig sind (dieselben wie
// lib/stripJpegMetadata.js/lib/stripPngMetadata.js entfernen: APP1 Exif/XMP, APP13, COM bzw. tEXt/iTXt/zTXt/eXIf).
// Die Stripper lehnen kaputte Bilder ab (fail closed, lib/imageMetadata.js) - für öffentliche Fotos wird als zweite
// Sicherung trotzdem danach geprüft und im Zweifel abgelehnt. Ergebnis: { width, height, metadata } oder null (nicht lesbar).

const JPEG_SOI = 0xd8
const JPEG_SOS = 0xda
const JPEG_EOI = 0xd9
const APP1 = 0xe1
const APP13 = 0xed
const COM = 0xfe
// SOF0-SOF15 ohne DHT (C4), JPG (C8) und DAC (CC).
const SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])
const EXIF_PREFIX = Buffer.from('Exif\0\0', 'latin1')
const XMP_PREFIX = Buffer.from('http://ns.adobe.com/xap/1.0/\0', 'latin1')
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const PNG_METADATA_CHUNKS = new Set(['tEXt', 'iTXt', 'zTXt', 'eXIf'])

function startsWith(buffer, offset, prefix) {
  return offset + prefix.length <= buffer.length && buffer.subarray(offset, offset + prefix.length).equals(prefix)
}

function isJpegMetadata(marker, buffer, dataStart) {
  if (marker === APP13 || marker === COM) return true
  return marker === APP1 && (startsWith(buffer, dataStart, EXIF_PREFIX) || startsWith(buffer, dataStart, XMP_PREFIX))
}

function inspectJpeg(buffer) {
  let offset = 2
  let size = null
  let metadata = false
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) return null
    let markerOffset = offset + 1
    while (markerOffset < buffer.length && buffer[markerOffset] === 0xff) markerOffset += 1
    if (markerOffset >= buffer.length) return null
    const marker = buffer[markerOffset]
    if (marker === JPEG_SOS || marker === JPEG_EOI) break
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset = markerOffset + 1
      continue
    }
    if (markerOffset + 3 > buffer.length) return null
    const length = buffer.readUInt16BE(markerOffset + 1)
    const dataStart = markerOffset + 3
    const segmentEnd = markerOffset + 1 + length
    if (length < 2 || segmentEnd > buffer.length) return null
    if (isJpegMetadata(marker, buffer, dataStart)) metadata = true
    if (SOF_MARKERS.has(marker) && !size) {
      if (length < 7) return null
      size = { height: buffer.readUInt16BE(dataStart + 1), width: buffer.readUInt16BE(dataStart + 3) }
    }
    offset = segmentEnd
  }
  return size ? { ...size, metadata } : null
}

function inspectPng(buffer) {
  let offset = PNG_SIGNATURE.length
  let size = null
  let metadata = false
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('latin1', offset + 4, offset + 8)
    const chunkEnd = offset + 12 + length
    if (chunkEnd > buffer.length) return null
    if (type === 'IHDR' && length >= 8) size = { width: buffer.readUInt32BE(offset + 8), height: buffer.readUInt32BE(offset + 12) }
    if (PNG_METADATA_CHUNKS.has(type)) metadata = true
    if (type === 'IEND') break
    offset = chunkEnd
  }
  return size ? { ...size, metadata } : null
}

function inspectImage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) return null
  try {
    const result = buffer[0] === 0xff && buffer[1] === JPEG_SOI ? inspectJpeg(buffer) : startsWith(buffer, 0, PNG_SIGNATURE) ? inspectPng(buffer) : null
    return result && result.width > 0 && result.height > 0 ? result : null
  } catch {
    return null
  }
}

module.exports = { inspectImage }
