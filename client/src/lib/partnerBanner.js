// Reine Hilfen für die Bannerfotos im Kopf des Portals (Phase V4b) - spiegeln server/lib/partnerBanner.js
// (MAX_BANNER, MAX_ALT_LENGTH, BANNER_LAYOUTS, defaultLayout) und die Upload-Regeln der Einblicke (nur JPG oder PNG).
// Feedback-Runde: bis zu drei Fotos in einem gewählten Layout - im Profil (PartnerBannerEditor) und im Portal
// (PortalBanner). Fehlen Fotos für das Layout, zeigt das Portal die vorhandenen im nächstkleineren Layout.
import { isAllowedMedia } from './discover.js'
import { EINBLICK_ACCEPT, TYPE_MESSAGE, isEinblickFileType } from './einblicke.js'
import { t } from './i18n/index.js'

// Reihenfolge der Auswahl im Profil. slots: wie viele Fotos das Layout zeigt; places: wo jedes steht (Platzname im
// Editor); fallback: das nächstkleinere Layout, wenn ein Foto fehlt.
export const BANNER_LAYOUTS = Object.freeze([
  { id: 'eins', label: 'Ein Foto', slots: 1, places: [''], fallback: null },
  { id: 'halb', label: 'Zwei Fotos – halb/halb', slots: 2, places: ['links', 'rechts'], fallback: 'eins' },
  { id: 'gross-links', label: 'Groß links, klein rechts', slots: 2, places: ['groß links', 'klein rechts'], fallback: 'eins' },
  { id: 'drei', label: 'Drei Fotos', slots: 3, places: ['groß links', 'rechts oben', 'rechts unten'], fallback: 'gross-links' }
])
const LAYOUT_BY_ID = Object.fromEntries(BANNER_LAYOUTS.map((layout) => [layout.id, layout]))

export const MAX_BANNER = Math.max(...BANNER_LAYOUTS.map((layout) => layout.slots))
export const MAX_BANNER_ALT_LENGTH = 120
export const BANNER_ACCEPT = EINBLICK_ACCEPT
export const BANNER_TYPE_MESSAGE = TYPE_MESSAGE

// Das eigene Foto kommt über /uploads (server ownBanner) - genau ein Dateiname, kein weiterer Pfadteil.
const OWN_PHOTO_RE = /^\/uploads\/[\w-][\w.-]*$/

export function isBannerFileType(file) {
  return isEinblickFileType(file)
}

export function layoutSlots(id) {
  return LAYOUT_BY_ID[id]?.slots ?? 1
}

// Das Layout eines Partners: das gespeicherte (nur bekannte), sonst wie der Server die Vorgabe aus der Zahl der Fotos.
export function layoutOf(stored, count) {
  if (LAYOUT_BY_ID[stored]) return stored
  if (count >= 3) return 'drei'
  return count === 2 ? 'gross-links' : 'eins'
}

// Das Layout, das count Fotos wirklich füllen: das gewählte oder das nächstkleinere (drei -> groß links -> eins). Ohne
// Foto null.
export function effectiveLayout(id, count) {
  if (count < 1) return null
  let layout = LAYOUT_BY_ID[id] ?? LAYOUT_BY_ID.eins
  while (layout.slots > count && layout.fallback) layout = LAYOUT_BY_ID[layout.fallback]
  return layout.id
}

// Bannerfotos fürs Portal: höchstens MAX_BANNER, nur erlaubte Foto-Adressen (öffentlich /public-media, in der
// Kundensicht auch /uploads) - nie eine beliebige Adresse in einem src. alt ist reiner Text oder ''.
export function portalBannerItems(banner, { preview = false } = {}) {
  if (!Array.isArray(banner)) return []
  return banner
    .filter((item) => item && typeof item === 'object' && isAllowedMedia(item.fotoUrl, { preview }))
    .slice(0, MAX_BANNER)
    .map((item) => ({ fotoUrl: item.fotoUrl, alt: typeof item.alt === 'string' ? item.alt : '' }))
}

// Was der Kopf des Portals zeigt: das wirksame Layout und genau so viele Fotos, wie es fasst.
export function portalBanner(banner, stored, { preview = false } = {}) {
  const items = portalBannerItems(banner, { preview })
  const layout = effectiveLayout(layoutOf(stored, items.length), items.length)
  return { layout, items: layout ? items.slice(0, layoutSlots(layout)) : [] }
}

// Die eigenen Bannerfotos im Profil (server ownBanner): Position 1 bis MAX_BANNER, das Foto über /uploads.
export function ownBannerItems(banner) {
  if (!Array.isArray(banner)) return []
  return banner
    .filter((item) => item && Number.isInteger(item.position) && item.position >= 1 && item.position <= MAX_BANNER && OWN_PHOTO_RE.test(item.fotoUrl ?? ''))
    .slice(0, MAX_BANNER)
    .map((item) => ({ position: item.position, fotoUrl: item.fotoUrl, alt: typeof item.alt === 'string' ? item.alt : '' }))
}

// "Foto 2 · rechts" - wo ein Foto im Layout steht (ein einzelnes Foto heißt nur "Foto").
export function slotLabel(id, position) {
  const layout = LAYOUT_BY_ID[id] ?? LAYOUT_BY_ID.eins
  if (layout.slots === 1) return t('Foto')
  const place = layout.places[position - 1]
  return place ? t('Foto {n} · {place}', { n: position, place: t(place) }) : t('Foto {n}', { n: position })
}

// Plätze im Editor: die Fotos, die das Layout zeigt, dazu der nächste freie Platz (Fotos rücken lückenlos nach - ein
// neues landet immer dort). extra: Fotos, die das gewählte Layout nicht zeigt (bleiben gespeichert, bis man sie
// entfernt oder ein größeres Layout wählt).
export function editorSlots(id, items) {
  const slots = layoutSlots(id)
  const shown = items.slice(0, slots).map((item) => ({ position: item.position, label: slotLabel(id, item.position), item }))
  const next = shown.length < slots ? [{ position: shown.length + 1, label: slotLabel(id, shown.length + 1), item: null }] : []
  const extra = items.slice(slots).map((item) => ({ position: item.position, label: t('Foto {n}', { n: item.position }), item }))
  return { slots: [...shown, ...next], extra }
}

// Formular-Daten für Hochladen und Ersetzen: das Foto (Feld "foto") und der getrimmte Alternativtext.
export function bannerFormData(file, alt = '') {
  const formData = new FormData()
  const cleanAlt = typeof alt === 'string' ? alt.trim() : ''
  if (cleanAlt) formData.append('alt', cleanAlt)
  formData.append('foto', file)
  return formData
}
