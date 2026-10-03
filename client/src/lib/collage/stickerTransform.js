// Sticker auf einer Collage-Seite: { id, sticker, x, y, size, rotation }
// - x, y: Mittelpunkt relativ zur Seite (0–1 von Breite bzw. Höhe)
// - size: Kantenlänge relativ zur Seitenbreite, rotation: Grad im Uhrzeigersinn (-180, 180]
// Alle Helfer sind unveränderlich (neues Objekt statt Änderung).
import { newId } from './pages.js'

export const STICKER_SIZE = Object.freeze({ min: 0.04, max: 0.5, default: 0.14 })
const KEY_STEP = 0.01
const KEY_STEP_LARGE = 0.05
const SCALE_STEP = 1.1
const ROTATE_STEP = 15
const CASCADE_STEP = 0.04
const CASCADE_LENGTH = 5

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const finiteOr = (value, fallback) => (Number.isFinite(Number(value)) && value !== null && value !== '' ? Number(value) : fallback)

export function normalizeAngle(deg) {
  const value = Number(deg)
  if (!Number.isFinite(value)) return 0
  let angle = value % 360
  if (angle <= -180) angle += 360
  if (angle > 180) angle -= 360
  return angle === 0 ? 0 : angle
}

export function clampSticker(sticker) {
  return {
    ...sticker,
    x: clamp(finiteOr(sticker.x, 0.5), 0, 1),
    y: clamp(finiteOr(sticker.y, 0.5), 0, 1),
    size: clamp(finiteOr(sticker.size, STICKER_SIZE.default), STICKER_SIZE.min, STICKER_SIZE.max),
    rotation: normalizeAngle(finiteOr(sticker.rotation, 0))
  }
}

// Neue Sticker liegen mittig, jeder weitere ein Stück schräg versetzt (damit sie sich nicht genau überdecken).
export function newSticker(stickerId, index = 0, id = newId('sticker')) {
  const offset = (index % CASCADE_LENGTH) * CASCADE_STEP
  return { id, sticker: stickerId, x: 0.42 + offset, y: 0.4 + offset, size: STICKER_SIZE.default, rotation: 0 }
}

export function moveSticker(sticker, dx, dy) {
  return clampSticker({ ...sticker, x: sticker.x + dx, y: sticker.y + dy })
}

export function scaleSticker(sticker, factor) {
  return clampSticker({ ...sticker, size: sticker.size * factor })
}

export function rotateSticker(sticker, deg) {
  return clampSticker({ ...sticker, rotation: sticker.rotation + deg })
}

// Tastatur am ausgewählten Sticker: Pfeile verschieben (Umschalt = große Schritte), +/- Größe, R drehen
// (Umschalt+R zurück), Entf/Rücktaste löschen, Escape hebt die Auswahl auf. Andere Tasten: null.
export function stickerKeyAction(sticker, { key, shiftKey = false, ctrlKey = false, metaKey = false, altKey = false }) {
  if (ctrlKey || metaKey || altKey) return null
  const step = shiftKey ? KEY_STEP_LARGE : KEY_STEP
  const update = (next) => ({ type: 'update', sticker: next })
  switch (key) {
    case 'ArrowLeft':
      return update(moveSticker(sticker, -step, 0))
    case 'ArrowRight':
      return update(moveSticker(sticker, step, 0))
    case 'ArrowUp':
      return update(moveSticker(sticker, 0, -step))
    case 'ArrowDown':
      return update(moveSticker(sticker, 0, step))
    case '+':
    case '=':
      return update(scaleSticker(sticker, SCALE_STEP))
    case '-':
    case '_':
      return update(scaleSticker(sticker, 1 / SCALE_STEP))
    case 'r':
    case 'R':
      return update(rotateSticker(sticker, shiftKey ? -ROTATE_STEP : ROTATE_STEP))
    case 'Delete':
    case 'Backspace':
      return { type: 'remove' }
    case 'Escape':
      return { type: 'deselect' }
    default:
      return null
  }
}

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
const angleOf = (center, point) => (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI

// Größen-Griff: die Größe wächst im Verhältnis des Abstands zur Mitte (alle Punkte in denselben Einheiten).
export function resizeByDrag(startSize, center, startPoint, point) {
  const startDistance = distance(startPoint, center)
  if (startDistance < 1) return startSize
  return clamp((startSize * distance(point, center)) / startDistance, STICKER_SIZE.min, STICKER_SIZE.max)
}

// Maße des Dreh-Griffs in px (collage-design.css: 1.6rem groß, 10px über der Sticker-Kante)
export const ROTATE_HANDLE = Object.freeze({ radius: 13, gap: 23 })

// Der Dreh-Griff sitzt über dem Sticker und dreht sich mit. Ragte er dort aus der Seite (overflow: hidden
// schnitte ihn ab), kommt er unter den Sticker - sofern er dort Platz hat. page: gemessene Seite in px.
export function rotateHandleBelow(sticker, page, handle = ROTATE_HANDLE) {
  if (!(page.width > 0 && page.height > 0)) return false
  const reach = (sticker.size * page.width) / 2 + handle.gap
  const rad = (sticker.rotation * Math.PI) / 180
  const cx = sticker.x * page.width
  const cy = sticker.y * page.height
  const fits = (dir) => {
    const x = cx + dir * reach * Math.sin(rad)
    const y = cy - dir * reach * Math.cos(rad)
    return x >= handle.radius && x <= page.width - handle.radius && y >= handle.radius && y <= page.height - handle.radius
  }
  return !fits(1) && fits(-1)
}

// Der Größen-Griff sitzt an einer Ecke (dreht sich mit). Unten rechts, außer er ragte dort aus der Seite - dann
// die nächste Ecke, die passt: erst gespiegelt (links bzw. oben), zuletzt diagonal. page: gemessene Seite in px.
const CORNERS = [
  ['br', 1, 1],
  ['bl', -1, 1],
  ['tr', 1, -1],
  ['tl', -1, -1]
]

export function resizeHandleCorner(sticker, page, handle = ROTATE_HANDLE) {
  if (!(page.width > 0 && page.height > 0)) return 'br'
  const half = (sticker.size * page.width) / 2
  const rad = (sticker.rotation * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const cx = sticker.x * page.width
  const cy = sticker.y * page.height
  const fits = ([, sx, sy]) => {
    const x = cx + half * (sx * cos - sy * sin)
    const y = cy + half * (sx * sin + sy * cos)
    return x >= handle.radius && x <= page.width - handle.radius && y >= handle.radius && y <= page.height - handle.radius
  }
  return (CORNERS.find(fits) || CORNERS[0])[0]
}

// Dreh-Griff: Startwinkel plus der Winkel, um den der Zeiger um die Mitte gewandert ist.
export function rotateByDrag(startRotation, center, startPoint, point) {
  return normalizeAngle(startRotation + angleOf(center, point) - angleOf(center, startPoint))
}
