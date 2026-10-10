import { t } from '../i18n/index.js'
import { IMPORT_TEXT } from './texts.js'

// Jedes mitgebrachte Foto wird im Browser neu gezeichnet und als JPEG gespeichert - IMMER, auch kleine Bilder (anders als
// lib/images.js downscaleImage). Ein Canvas trägt keine EXIF-Daten: GPS-Koordinaten, Kameradaten usw. verlassen das Gerät so
// nie. (Der Server entfernt EXIF aus JPEG/PNG zusätzlich - lib/stripJpegMetadata.js -, WebP aber nicht.) Kann der Browser ein
// Bild nicht lesen (z. B. HEIC), gibt es einen Fehler statt des Originals.

const MAX_DIMENSION = 2000
const JPEG_QUALITY = 0.86

export async function reencodeImage(blob, name = 'foto.jpg') {
  let bitmap
  try {
    bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' })
  } catch {
    throw new Error(t(IMPORT_TEXT.unreadable))
  }
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close?.()
  const out = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
  if (!out) throw new Error(t(IMPORT_TEXT.unreadable))
  return new File([out], name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
}
