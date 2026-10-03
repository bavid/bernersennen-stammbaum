// Hintergründe einer Collage-Seite: drei selbst gezeichnete Muster und schlichte Farben (hell und dunkel) aus
// der Palette der App. Jeder Hintergrund bringt seine Schriftfarben mit - Vorschau (CSS-Variablen am .cpage)
// und Export (render.js) lesen dieselben Werte, damit beide gleich aussehen.
import { buildTile } from './patterns.js'

export { buildTile }

export const DEFAULT_BACKGROUND = 'creme'

export const BACKGROUND_GROUPS = [
  { id: 'muster', label: 'Muster' },
  { id: 'hell', label: 'Hell' },
  { id: 'dunkel', label: 'Dunkel' }
]

// Schrift auf hellem Papier (wie bisher) bzw. auf dunklem Grund
const LIGHT = { ink: '#1c1511', muted: '#74665a', accent: '#a4431d' }
const DARK = { ink: '#f5ecdf', muted: '#c2ae98', accent: '#e2b079' }

const LIST = [
  { id: 'pfoten', label: 'Pfoten', group: 'muster', ...LIGHT, paper: '#f6efe4', frame: '#ecdfcc' },
  { id: 'herzen', label: 'Herzen', group: 'muster', ...LIGHT, paper: '#f8ece8', frame: '#efd9d2' },
  { id: 'papier', label: 'Papier', group: 'muster', ...LIGHT, paper: '#f3eadb', frame: '#e6d8c2' },
  { id: 'creme', label: 'Creme', group: 'hell', ...LIGHT, paper: '#f6efe4', frame: '#ecdfcc' },
  { id: 'weiss', label: 'Weiß', group: 'hell', ...LIGHT, paper: '#fffdf9', frame: '#eee6da' },
  { id: 'sand', label: 'Sand', group: 'hell', ...LIGHT, muted: '#66574b', paper: '#ecdcc5', frame: '#dfcbaf' },
  { id: 'salbei', label: 'Salbei', group: 'hell', ...LIGHT, muted: '#5a6354', accent: '#3f4b39', paper: '#e2e9dc', frame: '#d1dbc6' },
  { id: 'himmel', label: 'Himmel', group: 'hell', ...LIGHT, muted: '#58636e', paper: '#e1e9f0', frame: '#cfdae4' },
  { id: 'rose', label: 'Rosé', group: 'hell', ...LIGHT, muted: '#715d55', paper: '#f5e4de', frame: '#e9cfc5' },
  { id: 'espresso', label: 'Espresso', group: 'dunkel', ...DARK, paper: '#231a15', frame: '#382c23' },
  { id: 'tanne', label: 'Tanne', group: 'dunkel', ...DARK, muted: '#b8c6b4', paper: '#1e2f26', frame: '#2c4236' },
  { id: 'nacht', label: 'Nacht', group: 'dunkel', ...DARK, muted: '#afbccb', paper: '#1c2530', frame: '#2b3745' }
]

export const BACKGROUNDS = Object.freeze(LIST.map((bg) => Object.freeze({ ...bg, tile: buildTile(bg.id) })))

const BY_ID = new Map(BACKGROUNDS.map((bg) => [bg.id, bg]))

export const isBackgroundId = (id) => typeof id === 'string' && BY_ID.has(id)
export const getBackground = (id) => BY_ID.get(id) || BY_ID.get(DEFAULT_BACKGROUND)

const tileUrls = new Map()

// encodeURIComponent lässt ( ) ' stehen - die gehören in CSS url(...) aber auch maskiert
const encodeForCss = (text) => encodeURIComponent(text).replace(/[()']/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)

// Kachel als data:-URL (eingebettet, kein Netzwerkzugriff) - null für einfarbige Hintergründe.
export function backgroundTileUrl(bg) {
  if (!bg?.tile) return null
  if (!tileUrls.has(bg.id)) tileUrls.set(bg.id, `data:image/svg+xml;charset=utf-8,${encodeForCss(bg.tile.svg)}`)
  return tileUrls.get(bg.id)
}
