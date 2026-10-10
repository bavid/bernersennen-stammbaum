// Profil (server/lib/profil.js): „Euer Name“ der angemeldeten Person und das Bild eines Zuhauses bzw. einer Familie.
import { readSetting, writeSetting } from './storage.js'

const AUTOR_KEY = 'autorName'
const DEFAULT_SIZE = 640
const JPEG_QUALITY = 0.86

// Name der Person aus /me (person.anzeigename) - leer, wenn keiner gespeichert ist.
export function personName(family) {
  return family?.person?.anzeigename || ''
}

// Der gespeicherte Name ist die Vorgabe für den Autor neuer Erinnerungen und Kommentare: alle Formulare lesen den
// gemerkten Namen dieses Geräts (readSetting('autorName')) - so wird gefüllt statt gefragt, ohne jedes Formular umzubauen.
export function rememberPersonName(family) {
  const name = personName(family)
  if (name && readSetting(AUTOR_KEY, '') !== name) writeSetting(AUTOR_KEY, name)
}

// Quadrat aus der Mitte: Seitenlänge = kürzere Seite, Versatz so, dass gleich viel links/rechts bzw. oben/unten wegfällt.
export function centerSquare(width, height) {
  const side = Math.min(width, height)
  return { sx: Math.round((width - side) / 2), sy: Math.round((height - side) / 2), side }
}

// Schneidet ein Foto im Browser quadratisch zu und verkleinert es (JPEG). Kann der Browser das Bild nicht lesen, geht das
// Original hoch - der Server prüft und bereinigt es ohnehin (Metadaten, Maße).
export async function squareImage(file, size = DEFAULT_SIZE) {
  let bitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    return file
  }
  const { sx, sy, side } = centerSquare(bitmap.width, bitmap.height)
  const target = Math.min(size, side)
  const canvas = document.createElement('canvas')
  canvas.width = target
  canvas.height = target
  canvas.getContext('2d').drawImage(bitmap, sx, sy, side, side, 0, 0, target, target)
  bitmap.close?.()
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
  return blob ? new File([blob], 'bild.jpg', { type: 'image/jpeg' }) : file
}

// /me nach einem neuen (oder entfernten) Bild des Bereichs areaId: aktiver Bereich, eigenes Zuhause und die Familien-Liste.
export function withAreaBild(family, areaId, bild) {
  if (!family) return family
  const set = (area) => (area && area.id === areaId ? { ...area, bild } : area)
  return {
    ...set(family),
    home: set(family.home),
    ...(family.memberships ? { memberships: family.memberships.map(set) } : {})
  }
}
