// WCAG-Kontrast, dieselbe Formel wie server/lib/partners.js (relative Luminanz nach
// https://www.w3.org/TR/WCAG21/#dfn-relative-luminance) - hier nur fürs Live-Feedback im
// Admin-Formular (AdminPartners): die Farbe wird beim Speichern trotzdem serverseitig erneut geprüft,
// das hier ersetzt diese Prüfung nicht.
import { hexToRgb } from './color.js'

// Textfarbe auf der Akzentfläche (--on-rust, hell) - siehe client/src/styles/tokens.css und
// server/lib/partners.js ON_RUST. Fest auf den hellen Wert geprüft, unabhängig vom Theme.
export const ON_RUST = '#fffaf2'
export const MIN_CONTRAST = 4.5

function channelLuminance(channel) {
  const c = channel / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function relativeLuminance({ r, g, b }) {
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b)
}

export function contrastRatio(hexA, hexB) {
  const luminanceA = relativeLuminance(hexToRgb(hexA))
  const luminanceB = relativeLuminance(hexToRgb(hexB))
  const lighter = Math.max(luminanceA, luminanceB)
  const darker = Math.min(luminanceA, luminanceB)
  return (lighter + 0.05) / (darker + 0.05)
}

// Reicht der Kontrast der Farbe gegen --on-rust für lesbare Schrift (>= MIN_CONTRAST)?
export function hasEnoughContrast(hex) {
  return contrastRatio(hex, ON_RUST) >= MIN_CONTRAST
}
