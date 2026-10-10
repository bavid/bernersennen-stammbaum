'use strict'

// security-review Phase T Finding 12: Handyfotos tragen häufig EXIF-Metadaten (u. a. GPS-Koordinaten
// des Aufnahmeorts) und Kommentar-/IPTC-Segmente - beim Hochladen eines Tierfotos (routes/uploads.js)
// landen die unverändert in einer über /uploads/<datei> öffentlich (jedem eingeloggten sichtbaren, bei
// veröffentlichten Steckbriefen sogar öffentlich ohne Login erreichbaren) abgelegten Datei. Dieser
// Walker läuft einmal über die JPEG-Segmentstruktur und entfernt gezielt:
//  - APP1 mit "Exif\0\0"-Kennung (die eigentlichen EXIF-/GPS-Daten)
//  - APP1 mit der XMP-Kennung (kann ebenfalls Geodaten/Autoreninfos tragen)
//  - APP13 (Photoshop IRB, trägt häufig eingebettete IPTC-Metadaten)
//  - COM (Kommentar-Segmente)
// Alle anderen Segmente (APP0/JFIF, DQT, DHT, SOF, DRI, der Scan selbst, ...) bleiben byteidentisch
// erhalten - die Funktion verändert nie Bilddaten, nur ob ein Metadaten-Segment kopiert wird oder nicht.
//
// Sicherheitsprinzip (fail closed): bei JEDEM Anzeichen einer kaputten Struktur (eine Länge zeigt über das
// Bufferende hinaus, ein Segment beginnt nicht mit 0xFF, ...) liefert der Walker null - der Aufrufer lehnt
// den Upload dann mit 400 ab (lib/imageMetadata.js), statt die Datei samt EXIF/GPS zu speichern. Bytes nach
// EOI (Handy-Anhänge) werden abgeschnitten statt abgelehnt.

const SOI = 0xd8
const EOI = 0xd9
const SOS = 0xda
// Standalone-Marker ohne Längenfeld/Nutzdaten (ITU-T.81 Anhang B.1): TEM (0x01) und RSTn (0xd0-0xd7).
// SOI/EOI werden hier gesondert behandelt.
function isRestartMarker(marker) {
  return marker >= 0xd0 && marker <= 0xd7
}
function isStandaloneMarker(marker) {
  return marker === 0x01 || isRestartMarker(marker)
}

const APP1 = 0xe1
const APP13 = 0xed
const COM = 0xfe

const EXIF_PREFIX = Buffer.from('Exif\0\0', 'latin1')
const XMP_PREFIX = Buffer.from('http://ns.adobe.com/xap/1.0/\0', 'latin1')

function startsWith(buffer, offset, prefix) {
  if (offset < 0 || offset + prefix.length > buffer.length) return false
  return buffer.subarray(offset, offset + prefix.length).equals(prefix)
}

function shouldDropSegment(marker, buffer, dataStart) {
  if (marker === APP13 || marker === COM) return true
  if (marker === APP1) return startsWith(buffer, dataStart, EXIF_PREFIX) || startsWith(buffer, dataStart, XMP_PREFIX)
  return false
}

// Ende der entropie-codierten Daten nach einem SOS: das erste 0xFF, dem weder ein Stuffing-0x00 noch ein
// RSTn folgt (also der nächste echte Marker, z. B. EOI oder bei progressiven JPEGs DHT/SOS). Ohne weiteren
// Marker (abgeschnittene Datei) das Bufferende.
function entropyDataEnd(buffer, offset) {
  for (let i = offset; i + 1 < buffer.length; i += 1) {
    if (buffer[i] !== 0xff) continue
    const next = buffer[i + 1]
    if (next === 0x00 || isRestartMarker(next)) {
      i += 1
      continue
    }
    return i
  }
  return buffer.length
}

// Ende eines Segments mit Längenfeld (Marker an markerOffset) oder null bei kaputter Länge.
function segmentEndAt(buffer, markerOffset) {
  const lengthOffset = markerOffset + 1
  if (lengthOffset + 2 > buffer.length) return null
  const length = buffer.readUInt16BE(lengthOffset)
  if (length < 2 || lengthOffset + length > buffer.length) return null
  return lengthOffset + length
}

function walkSegments(buffer) {
  const chunks = [buffer.subarray(0, 2)]
  let offset = 2

  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) return null // unerwartete Struktur - nicht sicher zu bereinigen

    // Erlaubte 0xFF-Füllbytes vor dem eigentlichen Marker-Byte überspringen.
    let markerOffset = offset + 1
    while (markerOffset < buffer.length && buffer[markerOffset] === 0xff) markerOffset += 1
    if (markerOffset >= buffer.length) return null
    const marker = buffer[markerOffset]

    if (marker === EOI) {
      // Bildende: alles danach (Handy-Anhänge, zweite Bilder mit eigenem EXIF, ...) fällt weg.
      chunks.push(buffer.subarray(offset, markerOffset + 1))
      return Buffer.concat(chunks)
    }

    if (isStandaloneMarker(marker)) {
      chunks.push(buffer.subarray(offset, markerOffset + 1))
      offset = markerOffset + 1
      continue
    }

    const segmentEnd = segmentEndAt(buffer, markerOffset)
    if (segmentEnd === null) return null

    if (marker === SOS) {
      // Scan-Kopf plus entropie-codierte Bilddaten unverändert übernehmen, danach weiter Marker lesen
      // (progressive JPEGs haben mehrere Scans).
      const scanEnd = entropyDataEnd(buffer, segmentEnd)
      chunks.push(buffer.subarray(offset, scanEnd))
      offset = scanEnd
      continue
    }

    if (!shouldDropSegment(marker, buffer, markerOffset + 3)) {
      chunks.push(buffer.subarray(offset, segmentEnd))
    }
    offset = segmentEnd
  }

  // Ohne EOI (abgeschnittene Datei): was bis hierhin gesammelt wurde, besteht nur aus vollständig gelesenen
  // Segmenten bzw. Bilddaten - das ist konsistent.
  return Buffer.concat(chunks)
}

// Liefert einen neuen Buffer ohne die oben genannten Metadaten-Segmente und ohne Bytes nach EOI. Kein JPEG
// (keine SOI-Kennung) -> `buffer` unverändert. Ein JPEG, dessen Struktur sich nicht sicher lesen lässt -> null
// (fail closed: der Aufrufer lehnt den Upload ab, statt die Datei samt EXIF/GPS zu speichern).
function stripJpegMetadata(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== SOI) return buffer
  try {
    return walkSegments(buffer)
  } catch {
    return null
  }
}

module.exports = { stripJpegMetadata }
