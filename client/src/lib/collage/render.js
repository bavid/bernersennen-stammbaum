import { CAPTION_HEIGHT, MARGIN, PAGE, computeFrames, coverPlacement } from './layout.js'

// Zeichnet eine Collage-Seite auf ein Canvas – exakt die Geometrie der Vorschau.
export const EXPORT_SCALE = 2 // 2480 × 3508 px ≈ A4 bei 300 dpi

const COLORS = { paper: '#f6efe4', ink: '#1c1511', muted: '#74665a', rust: '#a4431d', snow: '#fffaf2', frame: '#ecdfcc' }
const DISPLAY_FONT = "'Fraunces Variable', Georgia, serif"
const BODY_FONT = "'Manrope Variable', 'Segoe UI', sans-serif"
const TITLE_SIZE = 96
const TRICOLOR_HEIGHT = 16

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
          reject(new Error('Ein Foto konnte nicht geladen werden'))
        }
        img.src = url
      })
    )
  }
  return imageCache.get(url)
}

function ellipsize(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text
  let cut = text
  while (cut.length && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1)
  return `${cut.trimEnd()}…`
}

function drawTricolor(ctx, y) {
  const stripe = PAGE.width / 3
  ;[COLORS.ink, COLORS.snow, COLORS.rust].forEach((color, i) => {
    ctx.fillStyle = color
    ctx.fillRect(i * stripe, y, stripe + 1, TRICOLOR_HEIGHT)
  })
}

function drawHeader(ctx, page) {
  let size = TITLE_SIZE
  ctx.font = `600 ${size}px ${DISPLAY_FONT}`
  while (size > 48 && ctx.measureText(page.title).width > PAGE.width - MARGIN * 2) {
    size -= 4
    ctx.font = `600 ${size}px ${DISPLAY_FONT}`
  }
  ctx.fillStyle = COLORS.ink
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(ellipsize(ctx, page.title, PAGE.width - MARGIN * 2), MARGIN, 200)

  ctx.font = `500 30px ${BODY_FONT}`
  ctx.fillStyle = COLORS.muted
  ctx.fillText(ellipsize(ctx, page.subtitle || '', PAGE.width - MARGIN * 2), MARGIN, 258)
}

function drawPhoto(ctx, img, frame, photo) {
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(frame.x, frame.y, frame.width, frame.height, 14)
  ctx.fillStyle = COLORS.frame
  ctx.fill()
  ctx.clip()
  const placed = coverPlacement({ width: img.naturalWidth, height: img.naturalHeight }, frame, photo)
  ctx.drawImage(img, placed.x, placed.y, placed.width, placed.height)
  ctx.restore()
}

function drawCaption(ctx, text, frame) {
  if (!text) return
  ctx.font = `600 22px ${BODY_FONT}`
  ctx.fillStyle = COLORS.ink
  ctx.textBaseline = 'middle'
  ctx.fillText(ellipsize(ctx, text, frame.width), frame.x, frame.captionY + CAPTION_HEIGHT / 2)
  ctx.textBaseline = 'alphabetic'
}

function drawFooter(ctx, page) {
  ctx.textAlign = 'left'
  ctx.font = `500 26px ${DISPLAY_FONT}`
  ctx.fillStyle = COLORS.ink
  ctx.fillText(ellipsize(ctx, page.footer || '', PAGE.width - MARGIN * 2 - 260), MARGIN, 1668)
  ctx.textAlign = 'right'
  ctx.font = `600 20px ${BODY_FONT}`
  ctx.fillStyle = COLORS.muted
  ctx.fillText('Familienchronik', PAGE.width - MARGIN, 1668)
  ctx.textAlign = 'left'
}

export function hasCaptions(page) {
  return page.photos.some((photo) => photo.caption.trim())
}

export async function renderPage(page, scale = EXPORT_SCALE) {
  await Promise.all([document.fonts.load(`600 80px ${DISPLAY_FONT}`), document.fonts.load(`500 30px ${BODY_FONT}`)])
  const images = await Promise.all(page.photos.map((photo) => loadImage(photo.url)))

  const canvas = document.createElement('canvas')
  canvas.width = PAGE.width * scale
  canvas.height = PAGE.height * scale
  const ctx = canvas.getContext('2d')
  ctx.scale(scale, scale)

  ctx.fillStyle = COLORS.paper
  ctx.fillRect(0, 0, PAGE.width, PAGE.height)
  drawTricolor(ctx, 0)
  drawHeader(ctx, page)

  const frames = computeFrames(page.photos.length, { withCaptions: hasCaptions(page) })
  page.photos.forEach((photo, i) => {
    drawPhoto(ctx, images[i], frames[i], photo)
    drawCaption(ctx, photo.caption.trim(), frames[i])
  })

  drawFooter(ctx, page)
  drawTricolor(ctx, PAGE.height - TRICOLOR_HEIGHT)
  return canvas
}

export function canvasToBlob(canvas) {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Export fehlgeschlagen'))), 'image/png')
  )
}
