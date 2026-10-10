// Das Suchplakat (lib/vermisst.js buildPoster) als Bild zum Teilen - gezeichnet wie die Grüße-Karte, alles auf dem Gerät.
// Feste Papierfarben (styles/vermisst.css), Schriften und Foto-Laden aus lib/grusskarteCanvas.js.
import { loadImage, waitForFonts, wrapLines } from './grusskarteCanvas.js'
import { REGISTRIES } from './vermisst.js'
import { t } from './i18n/index.js'

export const POSTER_WIDTH = 1080
export const POSTER_HEIGHT = 1350
const PAD = 70
const TEXT_W = POSTER_WIDTH - 2 * PAD
const PHOTO = Object.freeze({ x: PAD, y: 190, w: TEXT_W, h: 560 })
const COLORS = Object.freeze({ paper: '#ffffff', ink: '#1c1511', muted: '#5b4f45', alarm: '#b3261e', line: '#e4dcd2' })
const SERIF = "'Fraunces Variable', Georgia, serif"
const SANS = "'Figtree Variable', system-ui, sans-serif"

function drawCover(ctx, img, { x, y, w, h }) {
  const scale = Math.max(w / img.width, h / img.height)
  const sw = w / scale
  const sh = h / scale
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h)
}

function text(ctx, value, x, y, font, color = COLORS.ink, align = 'left') {
  ctx.font = font
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.fillText(value, x, y)
}

function drawBody(ctx, poster) {
  let y = PHOTO.y + PHOTO.h + 90
  text(ctx, poster.name, POSTER_WIDTH / 2, y, `600 72px ${SERIF}`, COLORS.ink, 'center')
  ctx.font = `400 32px ${SANS}`
  const facts = poster.facts.map(([, value]) => value).join(' · ')
  for (const line of wrapLines(ctx, facts, TEXT_W, 2)) text(ctx, line, POSTER_WIDTH / 2, (y += 50), ctx.font, COLORS.muted, 'center')
  const seen = [poster.seenDate, poster.seenPlace].filter(Boolean).join(' · ')
  if (seen) text(ctx, `${t('Zuletzt gesehen am')}: ${seen}`, PAD, (y += 70), `600 32px ${SANS}`)
  if (poster.chip) text(ctx, `${t('Chipnummer')}: ${poster.chip}`, PAD, (y += 46), `400 30px ${SANS}`)
  if (poster.contact) text(ctx, `${t('Bitte meldet euch unter')}: ${poster.contact}`, PAD, (y += 60), `700 38px ${SANS}`, COLORS.alarm)
}

export function drawPoster(ctx, poster, img) {
  ctx.fillStyle = COLORS.paper
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT)
  text(ctx, t('VERMISST'), POSTER_WIDTH / 2, 150, `800 130px ${SANS}`, COLORS.alarm, 'center')
  if (img) drawCover(ctx, img, PHOTO)
  else {
    ctx.fillStyle = COLORS.line
    ctx.fillRect(PHOTO.x, PHOTO.y, PHOTO.w, PHOTO.h)
  }
  drawBody(ctx, poster)
  const registries = REGISTRIES.map((registry) => `${registry.name}: ${registry.url}`).join('   ·   ')
  text(ctx, registries, POSTER_WIDTH / 2, POSTER_HEIGHT - 50, `600 28px ${SANS}`, COLORS.muted, 'center')
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Bild konnte nicht erstellt werden'))), 'image/png')
  })
}

// PNG-Blob des Plakats; ist das Foto nicht lesbar (gesperrte Fläche), entsteht das Bild ohne Foto.
export async function renderPoster(poster, { doc = globalThis.document, ImageImpl = globalThis.Image } = {}) {
  await waitForFonts(doc)
  const img = await loadImage(poster.photo, ImageImpl)
  const canvas = doc.createElement('canvas')
  canvas.width = POSTER_WIDTH
  canvas.height = POSTER_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Zeichenfläche nicht verfügbar')
  drawPoster(ctx, poster, img)
  try {
    return await canvasToBlob(canvas)
  } catch (error) {
    if (!img) throw error
    drawPoster(ctx, poster, null)
    return canvasToBlob(canvas)
  }
}
