// Export-Zeichnen der Gestaltung (Phase V6): Hintergrund, Polaroid-Karten, Zeitstrahl und Sticker - in
// Seiteneinheiten, mit denselben Maßen wie die Vorschau (collage-design.css, CollageFrames.jsx, StickerLayer.jsx).
import { formatDateShort } from '../dates.js'
import { PAGE } from './layout.js'
import { TIMELINE } from './layouts.js'

export const DISPLAY_FONT = "'Fraunces Variable', Georgia, serif"
export const BODY_FONT = "'Manrope Variable', 'Segoe UI', sans-serif"
export const POLAROID_PAPER = '#fffdf8'
export const POLAROID_INK = '#3a2e25'
// Gemeinsame Maße für Vorschau (CollageFrames.jsx, collage-design.css) und Export - parity.test.js vergleicht
// die Werte im CSS mit diesen Konstanten.
// Schatten der Polaroid-Karten - wie box-shadow in collage-design.css (0 0.5cqw 1.6cqw)
export const SHADOW = Object.freeze({ color: 'rgba(28, 21, 17, 0.24)', offsetY: PAGE.width * 0.005, blur: PAGE.width * 0.016 })
export const LINE_WIDTH = 4
const LINE_ALPHA = 0.45
export const DOT_RING = 4
export const CONNECTOR = Object.freeze({ from: TIMELINE.dotRadius, to: TIMELINE.halfGap - 8, width: 2 })
export const DATE_FONT_SIZE = 24

export function ellipsize(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text
  let cut = text
  while (cut.length && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1)
  return `${cut.trimEnd()}…`
}

// Papierfarbe, darauf die Muster-Kachel (falls vorhanden) lückenlos ab (0, 0) - wie background-repeat im CSS.
export function drawBackground(ctx, bg, tile) {
  ctx.fillStyle = bg.paper
  ctx.fillRect(0, 0, PAGE.width, PAGE.height)
  if (!tile) return
  const size = bg.tile.size
  for (let y = 0; y < PAGE.height; y += size) {
    for (let x = 0; x < PAGE.width; x += size) ctx.drawImage(tile, x, y, size, size)
  }
}

function withRotation(ctx, cx, cy, deg, draw) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate((deg * Math.PI) / 180)
  ctx.translate(-cx, -cy)
  draw()
  ctx.restore()
}

// Polaroid: weiße Karte mit Schatten, quadratisches Foto, Unterschrift mittig im breiten unteren Rand.
// scale: Export-Maßstab - Canvas-Schatten werden nicht mit der Transformation skaliert.
export function drawPolaroid(ctx, { frame, photo, drawImageInFrame, scale }) {
  const card = frame.polaroid
  withRotation(ctx, card.x + card.width / 2, card.y + card.height / 2, frame.rotation, () => {
    ctx.save()
    ctx.shadowColor = SHADOW.color
    ctx.shadowBlur = SHADOW.blur * scale
    ctx.shadowOffsetY = SHADOW.offsetY * scale
    ctx.fillStyle = POLAROID_PAPER
    ctx.fillRect(card.x, card.y, card.width, card.height)
    ctx.restore()

    ctx.save()
    ctx.beginPath()
    ctx.rect(frame.x, frame.y, frame.width, frame.height)
    ctx.clip()
    drawImageInFrame()
    ctx.restore()

    const caption = photo.caption.trim()
    if (!caption) return
    ctx.font = `500 ${card.captionFont}px ${DISPLAY_FONT}`
    ctx.fillStyle = POLAROID_INK
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(ellipsize(ctx, caption, frame.width), card.x + card.width / 2, frame.y + frame.height + card.captionHeight / 2)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
  })
}

export function drawTimelineLine(ctx, line, bg) {
  if (!line) return
  ctx.save()
  ctx.globalAlpha = LINE_ALPHA
  ctx.fillStyle = bg.accent
  ctx.fillRect(line.x - LINE_WIDTH / 2, line.y1, LINE_WIDTH, line.y2 - line.y1)
  ctx.restore()
}

// Punkt auf der Linie, kurzer Verbinder und das Datum über dem Foto (zur Linie hin ausgerichtet).
export function drawTimelineMark(ctx, frame, photo, lineX, bg) {
  const { side, dotY, dateY, align } = frame.timeline
  const dir = side === 'left' ? -1 : 1
  ctx.save()
  ctx.fillStyle = bg.accent
  ctx.fillRect(Math.min(lineX + dir * CONNECTOR.from, lineX + dir * CONNECTOR.to), dotY - CONNECTOR.width / 2, CONNECTOR.to - CONNECTOR.from, CONNECTOR.width)
  ctx.beginPath()
  ctx.arc(lineX, dotY, TIMELINE.dotRadius, 0, Math.PI * 2)
  ctx.fill()
  ctx.lineWidth = DOT_RING
  ctx.strokeStyle = bg.paper
  ctx.stroke()

  const date = formatDateShort(photo.date)
  if (date) {
    ctx.font = `700 ${DATE_FONT_SIZE}px ${BODY_FONT}`
    ctx.textAlign = align
    ctx.textBaseline = 'middle'
    ctx.fillText(date, align === 'right' ? frame.x + frame.width : frame.x, dateY + TIMELINE.dateHeight / 2)
  }
  ctx.restore()
}

// Sticker zuletzt, über allem: Mittelpunkt (x, y relativ zur Seite), Kantenlänge relativ zur Seitenbreite.
export function drawStickers(ctx, stickers, images) {
  stickers.forEach((sticker, i) => {
    const size = sticker.size * PAGE.width
    const cx = sticker.x * PAGE.width
    const cy = sticker.y * PAGE.height
    withRotation(ctx, cx, cy, sticker.rotation, () => ctx.drawImage(images[i], cx - size / 2, cy - size / 2, size, size))
  })
}
