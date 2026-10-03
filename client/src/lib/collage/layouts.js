// Vorlagen (Layouts) einer Collage-Seite. Jede Vorlage verteilt die Fotos der Seite neu - beim Wechsel bleiben
// Fotos, Reihenfolge, Ausschnitt und Unterschriften erhalten. Vorschau (DOM) und Export (Canvas) rechnen mit
// denselben Rahmen in Seiteneinheiten (layout.js: PAGE, PHOTO_AREA).
//
// computeLayout(...) liefert { frames, slots, line }:
// - frames: ein Rahmen je Foto { x, y, width, height, captionY, captionHeight } plus je Vorlage
//   rotation + polaroid (Polaroid) bzw. timeline (Zeitstrahl)
// - slots: freie Plätze einer festen Vorlage (Raster, Groß + klein) - nur im Editor als Platzhalter sichtbar
// - line: die Mittellinie des Zeitstrahls, sonst null
import { CAPTION_HEIGHT, GAP, PAGE, PHOTO_AREA, computeFrames, framesForRows } from './layout.js'

export const LAYOUTS = Object.freeze([
  { id: 'auto', label: 'Automatisch', hint: 'Passt sich der Zahl der Fotos an' },
  { id: 'grid-2', label: 'Raster 2×2', hint: 'Vier gleich große Felder' },
  { id: 'grid-3', label: 'Raster 3×3', hint: 'Neun gleich große Felder' },
  { id: 'hero', label: 'Groß + klein', hint: 'Ein großes Foto, darunter kleine' },
  { id: 'polaroid', label: 'Polaroid', hint: 'Schräge Fotos mit weißem Rand' },
  { id: 'timeline', label: 'Zeitstrahl', hint: 'Fotos entlang einer Linie mit Datum' }
])

export const DEFAULT_LAYOUT = 'auto'
const BY_ID = new Map(LAYOUTS.map((layout) => [layout.id, layout]))

export const isLayoutId = (id) => typeof id === 'string' && BY_ID.has(id)
export const layoutOf = (id) => BY_ID.get(id) || BY_ID.get(DEFAULT_LAYOUT)

const empty = (frames, extra = {}) => ({ frames, slots: [], line: null, ...extra })

// Raster mit cols Spalten: mindestens cols × cols Felder, bei mehr Fotos weitere Reihen.
function gridLayout(cols, count, options) {
  const rowCount = Math.max(cols, Math.ceil(count / cols))
  const cells = framesForRows(Array(rowCount).fill(cols), Array(rowCount).fill(1), options)
  return empty(cells.slice(0, count), { slots: cells.slice(count) })
}

// m Plätze möglichst gleichmäßig auf Reihen mit höchstens max Spalten verteilen (5 → [3, 2], 4 → [2, 2]).
function balancedRows(m, max) {
  const rowCount = Math.ceil(m / max)
  const base = Math.floor(m / rowCount)
  const extra = m % rowCount
  return Array.from({ length: rowCount }, (_, i) => base + (i < extra ? 1 : 0))
}

const HERO_MIN_SMALL = 3

// Groß + klein: ein großes Foto über die ganze Breite, darunter mindestens drei kleine Plätze.
function heroLayout(count, options) {
  const smallRows = balancedRows(Math.max(count - 1, HERO_MIN_SMALL), 3)
  const heroWeight = Math.max(1.4, 2.6 - 0.4 * smallRows.length)
  const cells = framesForRows([1, ...smallRows], [heroWeight, ...smallRows.map(() => 1)], options)
  return empty(cells.slice(0, count), { slots: cells.slice(count) })
}

// Polaroid: quadratisches Foto, schmaler weißer Rand, unten breiter (dort steht die Unterschrift),
// jede Karte leicht gedreht. Die Drehung ist fest je Platz, damit Vorschau und Export übereinstimmen.
export const POLAROID = Object.freeze({ border: 0.06, bottom: 0.26, pad: 0.06 })
const POLAROID_ANGLES = [-3.5, 2.5, -1.5, 3, -2.5, 1.5, -3, 2, -2]
const polaroidCols = (count) => (count <= 1 ? 1 : count <= 4 ? 2 : 3)
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

function polaroidLayout(count, { area = PHOTO_AREA, gap = GAP } = {}) {
  if (count <= 0) return empty([])
  const cols = polaroidCols(count)
  const rows = Math.ceil(count / cols)
  const cellW = (area.width - gap * (cols - 1)) / cols
  const cellH = (area.height - gap * (rows - 1)) / rows
  const pad = POLAROID.pad * Math.min(cellW, cellH)
  const widthFactor = 1 + 2 * POLAROID.border
  const heightFactor = 1 + POLAROID.border + POLAROID.bottom
  const side = Math.min((cellW - 2 * pad) / widthFactor, (cellH - 2 * pad) / heightFactor)
  const border = side * POLAROID.border
  const bottom = side * POLAROID.bottom

  const frames = []
  for (let i = 0; i < count; i += 1) {
    const row = Math.floor(i / cols)
    const inRow = Math.min(cols, count - row * cols)
    // Eine angefangene letzte Reihe wird mittig gesetzt
    const shift = ((cols - inRow) * (cellW + gap)) / 2
    const cellX = area.x + shift + (i % cols) * (cellW + gap)
    const cellY = area.y + row * (cellH + gap)
    const card = {
      x: cellX + (cellW - side * widthFactor) / 2,
      y: cellY + (cellH - side * heightFactor) / 2,
      width: side * widthFactor,
      height: side * heightFactor,
      border,
      captionHeight: bottom,
      captionFont: clamp(side * 0.075, 18, 44)
    }
    frames.push({
      x: card.x + border,
      y: card.y + border,
      width: side,
      height: side,
      captionY: card.y + border + side,
      captionHeight: 0,
      rotation: POLAROID_ANGLES[i % POLAROID_ANGLES.length],
      polaroid: card
    })
  }
  return empty(frames)
}

// Zeitstrahl: senkrechte Linie in der Seitenmitte, Fotos abwechselnd links und rechts, versetzt von oben nach
// unten. Über jedem Foto steht das Datum, ein Punkt auf der Linie markiert es.
export const TIMELINE = Object.freeze({ halfGap: 44, dateHeight: 40, maxPhotoHeight: 380, maxAspect: 1.5, dotRadius: 9 })

function timelineLayout(count, { area = PHOTO_AREA, gap = GAP, withCaptions = false } = {}) {
  const lineX = PAGE.width / 2
  const line = { x: lineX, y1: area.y + TIMELINE.dateHeight / 2, y2: area.y + area.height }
  if (count <= 0) return empty([], { line })
  const caption = withCaptions ? CAPTION_HEIGHT : 0
  const columnWidth = area.width / 2 - TIMELINE.halfGap
  const maxItem = TIMELINE.dateHeight + TIMELINE.maxPhotoHeight + caption
  // Gleiche Seite (i und i + 2) darf sich nicht überlappen: 2 · Schritt ≥ Höhe + Abstand
  const fit = count === 1 ? area.height : (2 * area.height - (count - 1) * gap) / (count + 1)
  const itemHeight = Math.min(fit, maxItem)
  const step = count === 1 ? 0 : (area.height - itemHeight) / (count - 1)
  const photoHeight = Math.max(1, itemHeight - TIMELINE.dateHeight - caption)
  const photoWidth = Math.min(columnWidth, photoHeight * TIMELINE.maxAspect)

  const frames = Array.from({ length: count }, (_, i) => {
    const side = i % 2 === 0 ? 'left' : 'right'
    const top = area.y + i * step
    const x = side === 'left' ? lineX - TIMELINE.halfGap - photoWidth : lineX + TIMELINE.halfGap
    const y = top + TIMELINE.dateHeight
    return {
      x,
      y,
      width: photoWidth,
      height: photoHeight,
      captionY: y + photoHeight,
      captionHeight: caption,
      timeline: {
        side,
        dateY: top,
        dotY: top + TIMELINE.dateHeight / 2,
        // Datum und Unterschrift richten sich zur Linie hin aus
        align: side === 'left' ? 'right' : 'left'
      }
    }
  })
  return empty(frames, { line })
}

export function computeLayout(layoutId, count, { withCaptions = false } = {}) {
  const options = { area: PHOTO_AREA, gap: GAP, withCaptions }
  switch (layoutOf(layoutId).id) {
    case 'grid-2':
      return gridLayout(2, count, options)
    case 'grid-3':
      return gridLayout(3, count, options)
    case 'hero':
      return heroLayout(count, options)
    case 'polaroid':
      return polaroidLayout(count, options)
    case 'timeline':
      return timelineLayout(count, options)
    default:
      return empty(computeFrames(count, options))
  }
}

// Unterschriften unter den Fotos? Polaroids tragen sie in der Karte, alle anderen reservieren eine Zeile.
export const captionsBelow = (layoutId) => layoutOf(layoutId).id !== 'polaroid'

export const hasCaptions = (page) => page.photos.some((photo) => photo.caption.trim())

// Geometrie einer Seite - dieselbe Rechnung für Vorschau (CollagePageView) und Export (render.js).
export function pageGeometry(page) {
  return computeLayout(page.layout, page.photos.length, { withCaptions: captionsBelow(page.layout) && hasCaptions(page) })
}

// Zeigerbewegung (Bildschirm) in die Achsen eines um deg gedrehten Fotos umrechnen (Ausschnitt verschieben).
export function toLocalDelta(dx, dy, deg = 0) {
  const rad = (deg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return { dx: dx * cos + dy * sin, dy: -dx * sin + dy * cos }
}
