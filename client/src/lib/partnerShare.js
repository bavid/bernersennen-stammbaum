// "Teilen" im Partner-Profil (Phase U, PartnerShareSection): Portal-Adresse, QR-Code als SVG-Datei, ein
// HTML-Knopf für die eigene Website und ein Text-Vorschlag für Social Media - reine Funktionen ohne DOM.
import { qrSvgPath } from './qr.js'
import { isValidHexColor } from './color.js'
import { printBaseUrl } from './voucherPrint.js'
import { portalPath } from './partnerProfile.js'

export const APP_NAME = 'Familie auf Pfoten'
export const SNIPPET_LABEL = `Uns findet ihr auch auf ${APP_NAME}`
// Ohne eigene Partnerfarbe der Rost-Ton des Standard-Auftritts (palettes.css --rust, Terrakotta) mit heller Schrift.
const DEFAULT_BUTTON_COLOR = '#a4431d'
const BUTTON_TEXT_COLOR = '#fffaf2'
// Heller Rand um den Code (Ruhezone, vier Module) - ohne ihn lesen manche Kameras schlecht.
const QR_QUIET_ZONE = 4
// Feste Größe der SVG-Datei - ohne width/height nehmen manche Programme (Office, Canvas) 0 oder 150 px an.
const QR_FILE_SIZE = 1024
const SHELTER_TYPES = ['tierheim', 'vermittlung']

// Öffentliche Adresse des Portals: PUBLIC_URL (api.config) oder der Ursprung dieser Seite. Ein Demo-Partner
// ist öffentlich nur mit ?demo=1 zu sehen (server/routes/partners.js demoAllowed) - dann gehört es dazu.
export function portalUrl({ publicUrl, origin, slug, demo = false }) {
  const base = printBaseUrl(publicUrl, origin)
  return `${base}${portalPath(slug)}${demo ? '?demo=1' : ''}`
}

// Für Attribute und Text im HTML-Schnipsel: nichts, was aus dem Attribut oder dem Tag ausbrechen könnte.
export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Stil des Website-Knopfs - dieselben Werte für den Schnipsel (Text) und die Vorschau (React-Style).
export function snippetStyle(farbe) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 18px',
    borderRadius: '999px',
    background: isValidHexColor(farbe) ? farbe : DEFAULT_BUTTON_COLOR,
    color: BUTTON_TEXT_COLOR,
    font: '600 15px/1.2 system-ui, -apple-system, "Segoe UI", sans-serif',
    textDecoration: 'none'
  }
}

function cssText(style) {
  return Object.entries(style)
    .map(([key, value]) => `${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}:${value}`)
    .join(';')
}

// Ein Link als Knopf, nur Inline-Styles, kein Skript - zum Einfügen auf der eigenen Website.
export function shareSnippet(url, { farbe } = {}) {
  const style = escapeHtml(cssText(snippetStyle(farbe)))
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" style="${style}">${escapeHtml(SNIPPET_LABEL)}</a>`
}

// Text-Vorschlag für Instagram, Facebook & Co. - Tierheime nennen ihre Tiere, alle anderen ihre Angebote.
export function socialText({ typ, url }) {
  const inhalt = SHELTER_TYPES.includes(typ)
    ? 'unsere Tiere, die ein Zuhause suchen, Happy Ends und Einblicke in unseren Alltag'
    : 'unsere Angebote, Einblicke in unseren Alltag und den direkten Draht zu uns'
  return `Neu: Ihr findet uns jetzt auch auf ${APP_NAME}! Dort gibt es ${inhalt}. Schaut vorbei: ${url}`
}

// Vollständige SVG-Datei des QR-Codes (weißer Grund samt Ruhezone, schwarze Module) - für die Anzeige und
// den Download als .svg; als .png zeichnet sie PartnerShareQr auf ein Canvas.
export function qrSvgMarkup(text) {
  const { size, path } = qrSvgPath(text)
  const total = size + QR_QUIET_ZONE * 2
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${QR_FILE_SIZE}" height="${QR_FILE_SIZE}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">` +
    `<rect width="${total}" height="${total}" fill="#fff"/>` +
    `<path transform="translate(${QR_QUIET_ZONE} ${QR_QUIET_ZONE})" d="${path}" fill="#000"/>` +
    '</svg>'
  )
}

// Dateiname für Downloads: "qr-<slug>.svg" - der Slug ist schon URL-tauglich, zur Sicherheit noch einmal gefiltert.
export function qrFileName(slug, extension) {
  const safe = String(slug || 'portal').replace(/[^a-z0-9-]/gi, '') || 'portal'
  return `qr-${safe}.${extension}`
}
