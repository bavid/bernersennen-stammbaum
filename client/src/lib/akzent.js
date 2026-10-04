// Eigene Akzentfarbe im Mini-Designer (Einstellungen → Darstellung, B+ Familienalbum): aus einer frei gewählten Farbe wird
// je Modus eine lesbare Fassung - als Link auf allen Flächen der Farbwelt (lib/paletteFlaechen.js) und auf ihrem eigenen
// Hauch (aktiver Reiter) und als Knopf mit seiner Schrift, alles mindestens WCAG AA (4,5 : 1). Reicht es nicht, wird die Farbe in kleinen Schritten dunkler (hell) bzw.
// heller (dunkel), bis es passt - dann heißt sie „angepasst“ und die Einstellungen sagen das dazu. Im dunklen Modus steht
// auf dem Knopf dunkle Schrift (--on-rust der Farbwelt), im hellen helle.
import { darkenHex, hexToRgb, isValidHexColor, lightenHex, shiftLightness } from './color.js'
import { contrastRatio } from './contrast.js'
import { PALETTE_FLAECHEN } from './paletteFlaechen.js'

const AA = 4.5
const STEP = 0.02
const MAX_STEPS = 60
// Deckkraft des Hauchs (--rust-wash, palettes.css data-akzent): aktiver Reiter, Kennzeichen - darauf steht die Farbe als Schrift.
const WASH_ALPHA = { hell: 0.1, dunkel: 0.14 }

// Sechs Vorschläge neben dem Farbfeld - warm wie das Album; die Lesbarkeit rechnet accentFor ohnehin nach.
export const AKZENT_VORSCHLAEGE = Object.freeze([
  { farbe: '#a64b2a', label: 'Terrakotta' },
  { farbe: '#c8553a', label: 'Hagebutte' },
  { farbe: '#7c8f6a', label: 'Salbei' },
  { farbe: '#3f6e8c', label: 'Taubenblau' },
  { farbe: '#8a5a9e', label: 'Pflaume' },
  { farbe: '#b8862f', label: 'Honig' }
])

function backgroundsOf(flaechen) {
  const list = [flaechen.paper, flaechen.surface, flaechen.sunk, flaechen.deep, flaechen.hero]
  // Hintergrund „Weiß“ (palettes.css data-grund) - im hellen Modus auch dagegen.
  return flaechen.scheme === 'hell' ? [...list, '#ffffff'] : list
}

// farbe mit Deckkraft alpha über bg (wie color-mix(in srgb, farbe alpha, transparent) auf bg).
function mixOver(farbe, alpha, bg) {
  const [f, b] = [hexToRgb(farbe), hexToRgb(bg)]
  const mix = (key) => Math.round(f[key] * alpha + b[key] * (1 - alpha))
  return `#${['r', 'g', 'b'].map((key) => mix(key).toString(16).padStart(2, '0')).join('')}`
}

// Lesbar: Schrift auf dem Knopf, die Farbe als Schrift auf jeder Fläche und auf ihrem eigenen Hauch über Papier und Karte.
function readable(farbe, auf, backgrounds, flaechen) {
  const alpha = WASH_ALPHA[flaechen.scheme]
  const washes = [flaechen.paper, flaechen.surface].map((bg) => mixOver(farbe, alpha, bg))
  return contrastRatio(auf, farbe) >= AA && [...backgrounds, ...washes].every((bg) => contrastRatio(farbe, bg) >= AA)
}

// { farbe, tief, auf, angepasst } für einen Modus (flaechen: PALETTE_FLAECHEN[id].hell bzw. .dunkel).
export function accentFor(hex, flaechen) {
  const input = hex.toLowerCase()
  const light = flaechen.scheme === 'hell'
  const auf = flaechen.onRust
  const backgrounds = backgroundsOf(flaechen)
  let farbe = input
  for (let step = 0; step < MAX_STEPS && !readable(farbe, auf, backgrounds, flaechen); step += 1) {
    farbe = shiftLightness(farbe, light ? -STEP : STEP)
  }
  const tief = light ? darkenHex(farbe) : lightenHex(farbe)
  return { farbe, tief, auf, angepasst: farbe !== input }
}

// Beide Modi für eine Farbwelt - null ohne gültige Farbe (nie ein roher Wert in eine CSS-Variable).
export function akzentFarben(hex, palette) {
  if (!isValidHexColor(hex)) return null
  const flaechen = PALETTE_FLAECHEN[palette] || PALETTE_FLAECHEN.familienalbum
  return { hell: accentFor(hex, flaechen.hell), dunkel: accentFor(hex, flaechen.dunkel) }
}
