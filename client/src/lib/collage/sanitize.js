// Entwurf aus dem Browser-Speicher prüfen, bevor der Editor ihn nutzt: Die Collage speichert nur lokal
// (localStorage, nie auf dem Server) - trotzdem kann dort Altes oder Kaputtes liegen. Unbekannte Vorlagen,
// Hintergründe und Sticker fallen weg bzw. auf den Standard zurück, Zahlen werden begrenzt, Fotos nur mit
// eigenen Pfaden ("/uploads/…"), höchstens MAX_STICKERS Sticker je Seite.
import { DEFAULT_BACKGROUND, isBackgroundId } from './backgrounds.js'
import { clampZoom } from './layout.js'
import { DEFAULT_LAYOUT, isLayoutId } from './layouts.js'
import { LIMITS, newId } from './pages.js'
import { MAX_STICKERS, isStickerId } from './stickers.js'
import { clampSticker } from './stickerTransform.js'

const { pages: MAX_PAGES, photosPerPage: MAX_PHOTOS, library: MAX_LIBRARY } = LIMITS
const TEXT_LIMITS = { title: LIMITS.title, subtitle: LIMITS.title, footer: LIMITS.title, caption: LIMITS.caption }
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '')
const listOf = (value) => (Array.isArray(value) ? value : [])
const unit = (value) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5)
// Eindeutige Id je Liste (doppelte gäben doppelte React-Schlüssel) - fehlende oder doppelte werden neu vergeben.
function uniqueIds(prefix) {
  const seen = new Set()
  return (value) => {
    const id = typeof value === 'string' && value && !seen.has(value.slice(0, 80)) ? value.slice(0, 80) : newId(prefix)
    seen.add(id)
    return id
  }
}

// Nur Pfade auf dem eigenen Server ("/uploads/…"): keine fremden Hosts ("//…", "https://…"), keine Schemata wie
// javascript:, und nur unverdächtige Zeichen - der Browser löst z. B. "/\host" oder "/<Tab>/host" zu "//host" auf.
const OWN_PATH = /^\/(?![/\\])[\w\-./~%]*$/
export const isOwnPath = (url) => typeof url === 'string' && url.length < 500 && OWN_PATH.test(url)

const dateOf = (value) => (typeof value === 'string' && ISO_DATE.test(value) ? value : '')

function sanitizePhoto(photo, idOf) {
  return {
    id: idOf(photo.id),
    url: photo.url,
    caption: text(photo.caption, TEXT_LIMITS.caption),
    focusX: unit(photo.focusX),
    focusY: unit(photo.focusY),
    zoom: clampZoom(photo.zoom),
    date: dateOf(photo.date)
  }
}

function sanitizeSticker(sticker, idOf) {
  return clampSticker({ id: idOf(sticker.id), sticker: sticker.sticker, x: sticker.x, y: sticker.y, size: sticker.size, rotation: sticker.rotation })
}

function sanitizePage(page, idOf) {
  const photoId = uniqueIds('photo')
  const stickerId = uniqueIds('sticker')
  return {
    id: idOf(page.id),
    title: text(page.title, TEXT_LIMITS.title),
    subtitle: text(page.subtitle, TEXT_LIMITS.subtitle),
    footer: text(page.footer, TEXT_LIMITS.footer),
    photos: listOf(page.photos).filter((p) => isObject(p) && isOwnPath(p.url)).slice(0, MAX_PHOTOS).map((p) => sanitizePhoto(p, photoId)),
    layout: isLayoutId(page.layout) ? page.layout : DEFAULT_LAYOUT,
    background: isBackgroundId(page.background) ? page.background : DEFAULT_BACKGROUND,
    stickers: listOf(page.stickers).filter((s) => isObject(s) && isStickerId(s.sticker)).slice(0, MAX_STICKERS).map((s) => sanitizeSticker(s, stickerId))
  }
}

export function sanitizeDraft(raw) {
  if (!isObject(raw) || !Array.isArray(raw.pages)) return null
  const perPage = Number(raw.perPage)
  const pageId = uniqueIds('page')
  return {
    ...(Array.isArray(raw.selectedIds) ? { selectedIds: raw.selectedIds.filter((id) => ['number', 'string'].includes(typeof id)) } : {}),
    ...(Number.isInteger(perPage) && perPage >= 1 && perPage <= 9 ? { perPage } : {}),
    ...(typeof raw.overview === 'boolean' ? { overview: raw.overview } : {}),
    pages: raw.pages.filter(isObject).slice(0, MAX_PAGES).map((page) => sanitizePage(page, pageId)),
    library: listOf(raw.library)
      .filter((p) => isObject(p) && isOwnPath(p.url))
      .slice(0, MAX_LIBRARY)
      .map((p) => ({ url: p.url, caption: text(p.caption, TEXT_LIMITS.caption), date: dateOf(p.date) }))
  }
}
