// Gestaltung einer Collage-Seite (Phase V6): Vorlage, Hintergrund und Sticker - unveränderliche Helfer für
// den Editor (jede Änderung liefert eine neue Seite bzw. Liste).
import { isBackgroundId } from './backgrounds.js'
import { isLayoutId } from './layouts.js'
import { MAX_STICKERS, isStickerId } from './stickers.js'
import { clampSticker, newSticker } from './stickerTransform.js'

const stickersOf = (page) => page.stickers || []

// Vorlage und/oder Hintergrund auf alle Seiten übertragen; unbekannte Werte bleiben außen vor.
export function applyToAllPages(pages, { layout, background } = {}) {
  const patch = {
    ...(isLayoutId(layout) ? { layout } : {}),
    ...(isBackgroundId(background) ? { background } : {})
  }
  return pages.map((page) => ({ ...page, ...patch }))
}

// id optional vorgeben: so kennt der Editor die Id schon vor dem (funktionalen) Zustands-Update.
export function addSticker(page, stickerId, id = undefined) {
  const stickers = stickersOf(page)
  if (!isStickerId(stickerId) || stickers.length >= MAX_STICKERS) return page
  return { ...page, stickers: [...stickers, newSticker(stickerId, stickers.length, id)] }
}

export function updateSticker(page, stickerId, next) {
  return { ...page, stickers: stickersOf(page).map((s) => (s.id === stickerId ? clampSticker({ ...next, id: s.id, sticker: s.sticker }) : s)) }
}

export function removeSticker(page, stickerId) {
  return { ...page, stickers: stickersOf(page).filter((s) => s.id !== stickerId) }
}

// Für den Zeitstrahl: ältestes Foto zuerst, Fotos ohne Datum behalten ihre Reihenfolge am Ende.
export function sortPhotosByDate(page) {
  const dated = page.photos.filter((p) => p.date)
  const undated = page.photos.filter((p) => !p.date)
  return { ...page, photos: [...[...dated].sort((a, b) => a.date.localeCompare(b.date)), ...undated] }
}
