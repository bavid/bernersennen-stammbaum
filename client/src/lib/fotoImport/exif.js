// Mini-EXIF-Leser für „Fotos mitbringen“: holt nur das Aufnahmedatum (DateTimeOriginal, sonst DateTimeDigitized oder
// DateTime) aus einem JPEG - ohne Bibliothek. Läuft über die Segmente bis zum APP1-„Exif“-Block, dann TIFF-Kopf → IFD0
// → Exif-IFD. Alles Unerwartete (kein JPEG, kaputte Längen, fehlende Tags) ergibt null, nie einen Fehler.

export const EXIF_READ_BYTES = 256 * 1024

const TAG_EXIF_IFD = 0x8769
const TAG_DATETIME = 0x0132
const TAG_DATETIME_ORIGINAL = 0x9003
const TAG_DATETIME_DIGITIZED = 0x9004
const TYPE_ASCII = 2
const EXIF_DATE = /^(\d{4}):(\d{2}):(\d{2})/

function toIsoDate(text) {
  const match = EXIF_DATE.exec(text || '')
  if (!match) return null
  const [, year, month, day] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  const iso = `${year}-${month}-${day}`
  if (Number(year) < 1900 || Number.isNaN(date.getTime()) || !date.toISOString().startsWith(iso)) return null
  return iso
}

// Einträge eines IFD als Map tag → { type, count, valueOffset } (valueOffset relativ zum TIFF-Anfang bzw. Inline-Position).
function readIfd(view, tiff, offset, little) {
  const entries = new Map()
  const start = tiff + offset
  if (start + 2 > view.byteLength) return entries
  const count = view.getUint16(start, little)
  for (let i = 0; i < count; i += 1) {
    const at = start + 2 + i * 12
    if (at + 12 > view.byteLength) break
    const type = view.getUint16(at + 2, little)
    const n = view.getUint32(at + 4, little)
    const inline = n <= 4 && type === TYPE_ASCII
    entries.set(view.getUint16(at, little), { type, count: n, valueOffset: inline ? at + 8 - tiff : view.getUint32(at + 8, little) })
  }
  return entries
}

function readAscii(view, tiff, entry) {
  if (!entry || entry.type !== TYPE_ASCII) return null
  const start = tiff + entry.valueOffset
  const end = Math.min(start + entry.count, view.byteLength)
  let text = ''
  for (let i = start; i < end; i += 1) {
    const code = view.getUint8(i)
    if (code === 0) break
    text += String.fromCharCode(code)
  }
  return text
}

function dateFromTiff(view, tiff) {
  if (tiff + 8 > view.byteLength) return null
  const order = view.getUint16(tiff)
  if (order !== 0x4949 && order !== 0x4d4d) return null
  const little = order === 0x4949
  if (view.getUint16(tiff + 2, little) !== 42) return null
  const ifd0 = readIfd(view, tiff, view.getUint32(tiff + 4, little), little)
  const exifPointer = ifd0.get(TAG_EXIF_IFD)
  const exif = exifPointer ? readIfd(view, tiff, exifPointer.valueOffset, little) : new Map()
  const candidates = [exif.get(TAG_DATETIME_ORIGINAL), exif.get(TAG_DATETIME_DIGITIZED), ifd0.get(TAG_DATETIME)]
  for (const entry of candidates) {
    const iso = toIsoDate(readAscii(view, tiff, entry))
    if (iso) return iso
  }
  return null
}

function isExifHeader(view, at) {
  // "Exif\0\0"
  return view.getUint32(at) === 0x45786966 && view.getUint16(at + 4) === 0
}

// buffer: ArrayBuffer oder Uint8Array (der Anfang der Datei reicht, siehe EXIF_READ_BYTES) → 'YYYY-MM-DD' oder null.
export function readExifDate(buffer) {
  try {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null
    let at = 2
    while (at + 4 <= view.byteLength) {
      if (view.getUint8(at) !== 0xff) return null
      const marker = view.getUint8(at + 1)
      if (marker === 0xda || marker === 0xd9) return null
      const length = view.getUint16(at + 2)
      if (length < 2) return null
      if (marker === 0xe1 && at + 10 <= view.byteLength && isExifHeader(view, at + 4)) return dateFromTiff(view, at + 10)
      at += 2 + length
    }
    return null
  } catch {
    return null
  }
}
