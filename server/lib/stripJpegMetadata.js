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
// Sicherheitsprinzip: bei JEDEM Anzeichen einer unerwarteten/kaputten Struktur (kein SOI, eine Länge
// zeigt über das Bufferende hinaus, ...) wird der UNVERÄNDERTE Originalbuffer zurückgegeben - lieber ein
// paar Metadaten zu viel behalten als ein Bild zu beschädigen (siehe routes/uploads.js: bei einem
// Rückgabewert, der dem Original entspricht, wird gar nichts neu geschrieben).

const SOI = 0xd8
const SOS = 0xda
// Standalone-Marker ohne Längenfeld/Nutzdaten (ITU-T.81 Anhang B.1): TEM (0x01) und RSTn (0xd0-0xd7).
// SOI/EOI werden hier gesondert behandelt.
function isStandaloneMarker(marker) {
  return marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)
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

// Liefert einen neuen Buffer ohne die oben genannten Metadaten-Segmente, oder `buffer` unverändert,
// wenn es sich nicht um ein (zumindest strukturell plausibles) JPEG handelt oder die Struktur an
// irgendeiner Stelle nicht dem erwarteten Format entspricht.
function stripJpegMetadata(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== SOI) return buffer

  try {
    const chunks = [buffer.subarray(0, 2)]
    let offset = 2

    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) return buffer // unerwartete Struktur - Original behalten

      // Erlaubte 0xFF-Füllbytes vor dem eigentlichen Marker-Byte überspringen.
      let markerOffset = offset + 1
      while (markerOffset < buffer.length && buffer[markerOffset] === 0xff) markerOffset += 1
      if (markerOffset >= buffer.length) return buffer
      const marker = buffer[markerOffset]

      if (marker === SOS) {
        // Ab hier folgen entropie-codierte Bilddaten (können 0xFF-Bytes mit 0x00-Stuffing sowie
        // RSTn-Marker enthalten) bis EOI - unverändert und vollständig übernehmen, nicht weiter parsen.
        chunks.push(buffer.subarray(offset))
        return Buffer.concat(chunks)
      }

      if (isStandaloneMarker(marker)) {
        chunks.push(buffer.subarray(offset, markerOffset + 1))
        offset = markerOffset + 1
        continue
      }

      const lengthOffset = markerOffset + 1
      if (lengthOffset + 2 > buffer.length) return buffer
      const length = buffer.readUInt16BE(lengthOffset)
      if (length < 2) return buffer
      const segmentEnd = lengthOffset + length
      if (segmentEnd > buffer.length) return buffer

      if (!shouldDropSegment(marker, buffer, lengthOffset + 2)) {
        chunks.push(buffer.subarray(offset, segmentEnd))
      }
      offset = segmentEnd
    }

    // Kein SOS gefunden (z. B. eine Datei, die vor dem eigentlichen Bild abbricht) - was bis hierhin
    // gesammelt wurde, ist trotzdem konsistent (nur vollständige Segmente wurden übernommen).
    return Buffer.concat(chunks)
  } catch {
    // Nie eine Ausnahme nach außen geben und nie irgendetwas aus dem Bildinhalt loggen - im Zweifel
    // bleibt einfach die Originaldatei bestehen.
    return buffer
  }
}

module.exports = { stripJpegMetadata }
