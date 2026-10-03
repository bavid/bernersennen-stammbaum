// Reine Hilfen für die Bannerfotos im Kopf des Portals (Phase V4b) - spiegeln server/lib/partnerBanner.js
// (MAX_BANNER, MAX_ALT_LENGTH) und die Upload-Regeln der Einblicke (nur JPG oder PNG).
import { isAllowedMedia } from './discover.js'
import { EINBLICK_ACCEPT, TYPE_MESSAGE, isEinblickFileType } from './einblicke.js'

export const MAX_BANNER = 2
export const MAX_BANNER_ALT_LENGTH = 120
export const BANNER_ACCEPT = EINBLICK_ACCEPT
export const BANNER_TYPE_MESSAGE = TYPE_MESSAGE

// Das eigene Foto kommt über /uploads (server ownBanner) - genau ein Dateiname, kein weiterer Pfadteil.
const OWN_PHOTO_RE = /^\/uploads\/[\w-][\w.-]*$/

export function isBannerFileType(file) {
  return isEinblickFileType(file)
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

// Die eigenen Bannerfotos im Profil (server ownBanner): Position 1 oder 2, das Foto über /uploads.
export function ownBannerItems(banner) {
  if (!Array.isArray(banner)) return []
  return banner
    .filter((item) => item && (item.position === 1 || item.position === 2) && OWN_PHOTO_RE.test(item.fotoUrl ?? ''))
    .slice(0, MAX_BANNER)
    .map((item) => ({ position: item.position, fotoUrl: item.fotoUrl, alt: typeof item.alt === 'string' ? item.alt : '' }))
}

// Formular-Daten für Hochladen und Ersetzen: das Foto (Feld "foto") und der getrimmte Alternativtext.
export function bannerFormData(file, alt = '') {
  const formData = new FormData()
  const cleanAlt = typeof alt === 'string' ? alt.trim() : ''
  if (cleanAlt) formData.append('alt', cleanAlt)
  formData.append('foto', file)
  return formData
}
