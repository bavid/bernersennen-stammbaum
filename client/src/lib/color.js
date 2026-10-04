// Partner-Akzentfarbe (partners.farbe, server-geprüft #rrggbb) fürs Portal: --rust/--rust-deep/--rust-wash
// werden nur bei einer wirklich gültigen Hex-Farbe gesetzt – nie ein roher String in ein Inline-Style.
const HEX_RE = /^#[0-9a-fA-F]{6}$/

export function isValidHexColor(value) {
  return typeof value === 'string' && HEX_RE.test(value)
}

// Exportiert (auch von lib/contrast.js genutzt – dieselbe Umrechnung, nicht zweimal schreiben).
export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function rgbToHsl({ r, g, b }) {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0)
  else if (max === gn) h = (bn - rn) / d + 2
  else h = (rn - gn) / d + 4
  return { h: h / 6, s, l }
}

function hue2rgb(p, q, t) {
  let tt = t
  if (tt < 0) tt += 1
  if (tt > 1) tt -= 1
  if (tt < 1 / 6) return p + (q - p) * 6 * tt
  if (tt < 1 / 2) return q
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
  return p
}

function hslToRgb({ h, s, l }) {
  if (s === 0) {
    const v = Math.round(l * 255)
    return { r: v, g: v, b: v }
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255)
  }
}

function toHex({ r, g, b }) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)))
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('')}`
}

const DARKEN_AMOUNT = 0.15

// ~15% dunkler in HSL (relative Abnahme der Helligkeit) – für --rust-deep.
export function darkenHex(hex, amount = DARKEN_AMOUNT) {
  const hsl = rgbToHsl(hexToRgb(hex))
  return toHex(hslToRgb({ ...hsl, l: Math.max(0, hsl.l * (1 - amount)) }))
}

export function hexToRgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// ~15% heller in HSL (relativ zum Abstand nach Weiß) – für --rust-deep im dunklen Modus (lib/akzent.js).
export function lightenHex(hex, amount = DARKEN_AMOUNT) {
  const hsl = rgbToHsl(hexToRgb(hex))
  return toHex(hslToRgb({ ...hsl, l: Math.min(1, hsl.l + (1 - hsl.l) * amount) }))
}

// Helligkeit in HSL um delta verschieben (-1 … 1, begrenzt auf 0 … 1) – Schritte für die Lesbarkeits-Anpassung.
export function shiftLightness(hex, delta) {
  const hsl = rgbToHsl(hexToRgb(hex))
  return toHex(hslToRgb({ ...hsl, l: Math.max(0, Math.min(1, hsl.l + delta)) }))
}
