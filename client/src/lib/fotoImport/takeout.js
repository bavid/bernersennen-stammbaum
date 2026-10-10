import { unzipSync } from 'fflate'

// Google-Takeout-ZIP im Browser entpacken (fflate, MIT): nur Bilder und die JSON-Begleitdateien; aus deren
// photoTakenTime.timestamp kommt das Aufnahmedatum, falls ein Foto selbst kein EXIF trägt (Takeout entfernt es manchmal).
// Begleitdateien heißen „IMG_1.jpg.json“ oder „IMG_1.jpg.supplemental-metadata.json“ (gekürzte Namen kommen vor) - wir
// ordnen über den Ordner + „title“ zu, sonst über den Dateinamen.

export const MAX_ZIP_BYTES = 500 * 1024 * 1024
export const MAX_ZIP_IMAGES = 200

const IMAGE_TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' }

function extOf(name) {
  const match = /\.([a-z0-9]+)$/i.exec(name)
  return match ? match[1].toLowerCase() : ''
}

function dirOf(path) {
  const i = path.lastIndexOf('/')
  return i < 0 ? '' : path.slice(0, i + 1)
}

function isHidden(path) {
  return path.split('/').some((part) => part.startsWith('.') || part === '__MACOSX')
}

export function isZipFile(file) {
  return /\.zip$/i.test(file?.name || '') || file?.type === 'application/zip' || file?.type === 'application/x-zip-compressed'
}

// Lokales Datum (Zeitzone des Geräts) zu einem Unix-Zeitstempel in Sekunden.
export function isoFromTimestamp(seconds) {
  const value = Number(seconds)
  if (!Number.isFinite(value) || value <= 0) return null
  const date = new Date(value * 1000)
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function sidecarTarget(path, json) {
  const base = path.replace(/(\.supplemental-metadata)?(\.[^./]*)?\.json$/i, '')
  const title = typeof json?.title === 'string' && json.title && !json.title.includes('/') ? json.title : null
  return [title && dirOf(path) + title, base].filter(Boolean)
}

function readSidecars(jsonFiles) {
  const dates = new Map()
  for (const [path, bytes] of jsonFiles) {
    try {
      const json = JSON.parse(new TextDecoder().decode(bytes))
      const iso = isoFromTimestamp(json?.photoTakenTime?.timestamp)
      if (iso) for (const target of sidecarTarget(path, json)) dates.set(target, iso)
    } catch {
      // keine gültige Begleitdatei - das Foto behält sein EXIF-Datum
    }
  }
  return dates
}

function sidecarDate(dates, path) {
  if (dates.has(path)) return dates.get(path)
  // gekürzte Begleitnamen: „IMG_20230101_1234567.j.json“ → passt als Anfang
  for (const [target, iso] of dates) if (dirOf(target) === dirOf(path) && target.length > dirOf(path).length + 4 && path.startsWith(target)) return iso
  return null
}

// bytes: Uint8Array des ZIPs → { photos: [{ path, name, type, bytes, sidecarDate }], truncated }
export function readTakeoutZip(bytes) {
  let images = 0
  let truncated = false
  const entries = unzipSync(bytes, {
    filter: (file) => {
      if (isHidden(file.name)) return false
      const ext = extOf(file.name)
      if (ext === 'json') return file.originalSize < 256 * 1024
      if (!IMAGE_TYPES[ext]) return false
      if (images >= MAX_ZIP_IMAGES) {
        truncated = true
        return false
      }
      images += 1
      return true
    }
  })
  const paths = Object.keys(entries)
  const dates = readSidecars(paths.filter((p) => extOf(p) === 'json').map((p) => [p, entries[p]]))
  const photos = paths
    .filter((p) => IMAGE_TYPES[extOf(p)])
    .map((path) => ({
      path,
      name: path.slice(dirOf(path).length),
      type: IMAGE_TYPES[extOf(path)],
      bytes: entries[path],
      sidecarDate: sidecarDate(dates, path)
    }))
  return { photos, truncated }
}
