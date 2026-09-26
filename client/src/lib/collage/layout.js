// Seitengeometrie der Collage in festen Einheiten (A4 bei 150 dpi). Vorschau (DOM) und
// Export (Canvas) rechnen mit denselben Rahmen, damit beide exakt gleich aussehen.

export const PAGE = { width: 1240, height: 1754 }
export const MARGIN = 90
export const PHOTO_AREA = { x: MARGIN, y: 330, width: PAGE.width - MARGIN * 2, height: 1250 }
export const GAP = 22
export const CAPTION_HEIGHT = 46
export const MIN_ZOOM = 1
export const MAX_ZOOM = 3
const HERO_WEIGHT = 1.7

// Reihen je Anzahl: Ungerade Mengen beginnen mit einem großen Hauptbild.
function rowPattern(count) {
  const patterns = { 1: [1], 2: [1, 1], 3: [1, 2], 4: [2, 2], 5: [1, 2, 2], 6: [2, 2, 2], 7: [1, 3, 3], 8: [2, 3, 3], 9: [3, 3, 3] }
  if (patterns[count]) return patterns[count]
  const rows = []
  for (let left = count; left > 0; left -= 3) rows.push(Math.min(3, left))
  return rows
}

// Rahmen für count Fotos: [{ x, y, width, height, captionY }] in Seiteneinheiten.
export function computeFrames(count, { area = PHOTO_AREA, gap = GAP, withCaptions = false } = {}) {
  if (count <= 0) return []
  const rows = rowPattern(count)
  const caption = withCaptions ? CAPTION_HEIGHT : 0
  const weights = rows.map((cols, i) => (i === 0 && cols === 1 && rows.length > 1 ? HERO_WEIGHT : 1))
  const weightSum = weights.reduce((a, b) => a + b, 0)
  const freeHeight = area.height - gap * (rows.length - 1) - caption * rows.length

  const frames = []
  let y = area.y
  rows.forEach((cols, rowIndex) => {
    const height = (freeHeight * weights[rowIndex]) / weightSum
    const width = (area.width - gap * (cols - 1)) / cols
    for (let col = 0; col < cols; col += 1) {
      frames.push({ x: area.x + col * (width + gap), y, width, height, captionY: y + height })
    }
    y += height + caption + gap
  })
  return frames
}

// Wie object-fit: cover, aber mit Fokuspunkt (0..1) und Zoom (>= 1). Liefert das Zeichenrechteck.
export function coverPlacement(image, frame, { focusX = 0.5, focusY = 0.5, zoom = 1 } = {}) {
  const scale = Math.max(frame.width / image.width, frame.height / image.height) * zoom
  const width = image.width * scale
  const height = image.height * scale
  return {
    x: frame.x - (width - frame.width) * focusX,
    y: frame.y - (height - frame.height) * focusY,
    width,
    height
  }
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

// Ziehen um (dx, dy) Pixel verschiebt den Ausschnitt; frame und image in denselben Pixeln.
export function dragFocus(photo, image, frame, dx, dy) {
  const placed = coverPlacement(image, frame, photo)
  const overflowX = placed.width - frame.width
  const overflowY = placed.height - frame.height
  return {
    focusX: overflowX > 0 ? clamp((photo.focusX ?? 0.5) - dx / overflowX, 0, 1) : photo.focusX ?? 0.5,
    focusY: overflowY > 0 ? clamp((photo.focusY ?? 0.5) - dy / overflowY, 0, 1) : photo.focusY ?? 0.5
  }
}

export function clampZoom(zoom) {
  return clamp(Number(zoom) || 1, MIN_ZOOM, MAX_ZOOM)
}
