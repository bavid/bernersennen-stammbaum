import { CAPTION_HEIGHT, MARGIN, PAGE, coverPlacement } from './layout.js'
import { hasCaptions, pageGeometry } from './layouts.js'
import { backgroundTileUrl, getBackground } from './backgrounds.js'
import { stickerUrl } from './stickers.js'
import {
  BODY_FONT,
  DISPLAY_FONT,
  drawBackground,
  drawPolaroid,
  drawStickers,
  drawTimelineLine,
  drawTimelineMark,
  ellipsize
} from './renderDesign.js'
import { getTheme } from '../../themes/index.js'

export { hasCaptions }

// Zeichnet eine Collage-Seite auf ein Canvas – exakt die Geometrie der Vorschau.
export const EXPORT_SCALE = 2 // 2480 × 3508 px ≈ A4 bei 300 dpi

// Fest, unabhängig vom Hintergrund: der Berner-Dreifarb-Streifen
const TRICOLOR = { ink: '#1c1511', snow: '#fffaf2', rust: '#a4431d' }
const TITLE_SIZE = 96
const TRICOLOR_HEIGHT = 16
const RULE_HEIGHT = 3
const PHOTO_RADIUS = 14

const imageCache = new Map()

function loadImage(url) {
  if (!imageCache.has(url)) {
    imageCache.set(
      url,
      new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => {
          imageCache.delete(url)
          reject(new Error('Ein Foto oder Sticker konnte nicht geladen werden'))
        }
        img.src = url
      })
    )
  }
  return imageCache.get(url)
}

function drawTricolor(ctx, y) {
  const stripe = PAGE.width / 3
  ;[TRICOLOR.ink, TRICOLOR.snow, TRICOLOR.rust].forEach((color, i) => {
    ctx.fillStyle = color
    ctx.fillRect(i * stripe, y, stripe + 1, TRICOLOR_HEIGHT)
  })
}

// Standard-Auftritt ohne Dreifarb-Streifen: ein schlichter Strich in der Akzentfarbe des Hintergrunds (.cpage-rule)
function drawRule(ctx, y, bg) {
  ctx.fillStyle = bg.accent
  ctx.fillRect(0, y, PAGE.width, RULE_HEIGHT)
}

const MIN_TITLE_SIZE = 48
let measureContext = null

// Größte Titelschrift (in Seiteneinheiten), bei der der Titel in eine Zeile passt –
// gemeinsam genutzt von Vorschau und Export, damit beide gleich umbrechen.
export function titleFontSize(title, ctx = null) {
  const context = ctx || (measureContext ??= document.createElement('canvas').getContext('2d'))
  let size = TITLE_SIZE
  context.font = `600 ${size}px ${DISPLAY_FONT}`
  while (size > MIN_TITLE_SIZE && context.measureText(title).width > PAGE.width - MARGIN * 2) {
    size -= 4
    context.font = `600 ${size}px ${DISPLAY_FONT}`
  }
  return size
}

function drawHeader(ctx, page, bg) {
  const size = titleFontSize(page.title, ctx)
  ctx.font = `600 ${size}px ${DISPLAY_FONT}`
  ctx.fillStyle = bg.ink
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(ellipsize(ctx, page.title, PAGE.width - MARGIN * 2), MARGIN, 200)

  ctx.font = `500 30px ${BODY_FONT}`
  ctx.fillStyle = bg.muted
  ctx.fillText(ellipsize(ctx, page.subtitle || '', PAGE.width - MARGIN * 2), MARGIN, 258)
}

function drawCover(ctx, img, frame, photo) {
  const placed = coverPlacement({ width: img.naturalWidth, height: img.naturalHeight }, frame, photo)
  ctx.drawImage(img, placed.x, placed.y, placed.width, placed.height)
}

function drawPhoto(ctx, img, frame, photo, bg) {
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(frame.x, frame.y, frame.width, frame.height, PHOTO_RADIUS)
  ctx.fillStyle = bg.frame
  ctx.fill()
  ctx.clip()
  drawCover(ctx, img, frame, photo)
  ctx.restore()
}

function drawCaption(ctx, text, frame, bg) {
  if (!text) return
  const align = frame.timeline?.align || 'left'
  ctx.font = `600 22px ${BODY_FONT}`
  ctx.fillStyle = bg.ink
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  ctx.fillText(ellipsize(ctx, text, frame.width), align === 'right' ? frame.x + frame.width : frame.x, frame.captionY + CAPTION_HEIGHT / 2)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}

function drawFooter(ctx, page, theme, bg) {
  ctx.textAlign = 'left'
  ctx.font = `500 26px ${DISPLAY_FONT}`
  ctx.fillStyle = bg.ink
  ctx.fillText(ellipsize(ctx, page.footer || '', PAGE.width - MARGIN * 2 - 260), MARGIN, 1668)
  ctx.textAlign = 'right'
  ctx.font = `600 20px ${BODY_FONT}`
  ctx.fillStyle = bg.muted
  ctx.fillText(theme.appName, PAGE.width - MARGIN, 1668)
  ctx.textAlign = 'left'
}

function drawEdge(ctx, theme, bg, edge) {
  if (theme.tricolor) drawTricolor(ctx, edge === 'top' ? 0 : PAGE.height - TRICOLOR_HEIGHT)
  else drawRule(ctx, edge === 'top' ? 0 : PAGE.height - RULE_HEIGHT, bg)
}

function drawFrames(ctx, page, geometry, images, bg, scale) {
  drawTimelineLine(ctx, geometry.line, bg)
  page.photos.forEach((photo, i) => {
    const frame = geometry.frames[i]
    if (frame.polaroid) {
      drawPolaroid(ctx, { frame, photo, scale, drawImageInFrame: () => drawCover(ctx, images[i], frame, photo) })
      return
    }
    drawPhoto(ctx, images[i], frame, photo, bg)
    drawCaption(ctx, photo.caption.trim(), frame, bg)
    if (frame.timeline) drawTimelineMark(ctx, frame, photo, geometry.line.x, bg)
  })
}

export async function renderPage(page, theme = getTheme('standard'), scale = EXPORT_SCALE) {
  const bg = getBackground(page.background)
  const stickers = page.stickers || []
  const tileUrl = backgroundTileUrl(bg)
  await Promise.all([document.fonts.load(`600 80px ${DISPLAY_FONT}`), document.fonts.load(`500 30px ${BODY_FONT}`)])
  const [images, stickerImages, tile] = await Promise.all([
    Promise.all(page.photos.map((photo) => loadImage(photo.url))),
    Promise.all(stickers.map((sticker) => loadImage(stickerUrl(sticker.sticker)))),
    tileUrl ? loadImage(tileUrl) : null
  ])

  const canvas = document.createElement('canvas')
  canvas.width = PAGE.width * scale
  canvas.height = PAGE.height * scale
  const ctx = canvas.getContext('2d')
  ctx.scale(scale, scale)

  drawBackground(ctx, bg, tile)
  drawEdge(ctx, theme, bg, 'top')
  drawHeader(ctx, page, bg)
  drawFrames(ctx, page, pageGeometry(page), images, bg, scale)
  drawFooter(ctx, page, theme, bg)
  drawEdge(ctx, theme, bg, 'bottom')
  drawStickers(ctx, stickers, stickerImages)
  return canvas
}

export function canvasToBlob(canvas) {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Export fehlgeschlagen'))), 'image/png')
  )
}
