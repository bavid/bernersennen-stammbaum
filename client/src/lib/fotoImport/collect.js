import { EXIF_READ_BYTES, readExifDate } from './exif.js'
import { MAX_ZIP_BYTES, isZipFile, readTakeoutZip } from './takeout.js'

// Ausgewählte Dateien (einzelne Fotos, ein Ordner oder ein Takeout-ZIP) → Import-Fotos
// [{ id, name, blob, date, dateGuessed }]. Datum: EXIF → Takeout-Begleitdatei → Änderungsdatum der Datei (geschätzt).

export class ImportError extends Error {
  constructor(code, details = {}) {
    super(code)
    this.code = code
    this.details = details
  }
}

function localIso(ms) {
  const date = new Date(ms)
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// Blob → Bytes; ältere Umgebungen (und jsdom) kennen blob.arrayBuffer() nicht - dann über FileReader.
function readBytes(blob) {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer().then((buffer) => new Uint8Array(buffer))
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(new Uint8Array(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(blob)
  })
}

function headBytes(blob) {
  return readBytes(blob.slice(0, EXIF_READ_BYTES))
}

async function fromFiles(files) {
  const images = files.filter((file) => file.type?.startsWith('image/'))
  const photos = []
  for (const [index, file] of images.entries()) {
    const exif = file.type === 'image/jpeg' ? readExifDate(await headBytes(file)) : null
    const date = exif || localIso(file.lastModified || Date.now())
    photos.push({ id: `f${index}`, name: file.webkitRelativePath || file.name, blob: file, date, dateGuessed: !exif })
  }
  return { photos, truncated: false }
}

async function fromZip(file) {
  if (file.size > MAX_ZIP_BYTES) throw new ImportError('zipTooBig', { mb: Math.round(MAX_ZIP_BYTES / 1024 / 1024) })
  let read
  try {
    read = readTakeoutZip(await readBytes(file))
  } catch {
    throw new ImportError('zipBroken')
  }
  const photos = read.photos.map((entry, index) => {
    const exif = entry.type === 'image/jpeg' ? readExifDate(entry.bytes.subarray(0, EXIF_READ_BYTES)) : null
    const date = exif || entry.sidecarDate || localIso(file.lastModified || Date.now())
    return { id: `z${index}`, name: entry.name, blob: new Blob([entry.bytes], { type: entry.type }), date, dateGuessed: !exif && !entry.sidecarDate }
  })
  return { photos, truncated: read.truncated }
}

export async function collectPhotos(fileList) {
  const files = Array.from(fileList || [])
  const zip = files.find(isZipFile)
  const result = zip ? await fromZip(zip) : await fromFiles(files)
  if (result.photos.length === 0) throw new ImportError('nothingFound')
  return result
}
