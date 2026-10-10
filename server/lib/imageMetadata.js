'use strict'

// Eine Stelle für die Metadaten-Entfernung aller Uploads (Tierfotos, Einblicke, Bannerfotos, Logos,
// Empfehlungsbilder). Der Stripper richtet sich nach dem INHALT (Magic Bytes), nicht nach dem vom Client
// behaupteten Content-Type - ein als GIF beschriftetes JPEG verliert sein EXIF trotzdem.
//
// Fail closed: lässt sich ein JPEG/PNG/WebP nicht sicher bereinigen (der Stripper liefert null), wird der
// Upload mit 400 abgelehnt, statt die Datei samt EXIF/GPS zu speichern. Andere Inhalte (z. B. GIF) tragen keinen
// der bekannten Metadaten-Container und bleiben unverändert.

const { detectImageExt } = require('./partners')
const { stripJpegMetadata } = require('./stripJpegMetadata')
const { stripPngMetadata } = require('./stripPngMetadata')
const { stripWebpMetadata } = require('./stripWebpMetadata')

const UNREADABLE_IMAGE_MESSAGE = 'Dieses Bild können wir nicht lesen – bitte als JPG oder PNG speichern.'
const STRIPPER_BY_EXT = Object.freeze({ jpg: stripJpegMetadata, png: stripPngMetadata, webp: stripWebpMetadata })

// Bereinigter Buffer (oder das Original, wenn es nichts zu bereinigen gibt). Wirft einen Fehler mit status 400,
// wenn das Bild kaputt ist.
function stripImageMetadata(buffer) {
  const strip = STRIPPER_BY_EXT[detectImageExt(buffer)]
  if (!strip) return buffer
  const stripped = strip(buffer)
  if (stripped) return stripped
  const err = new Error(UNREADABLE_IMAGE_MESSAGE)
  err.status = 400
  throw err
}

module.exports = { stripImageMetadata, UNREADABLE_IMAGE_MESSAGE }
