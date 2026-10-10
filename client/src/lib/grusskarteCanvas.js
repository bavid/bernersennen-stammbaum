// Zeichnet die Grüße-Karte (Modell aus lib/grusskarte.js) auf eine Zeichenfläche und liefert ein PNG. Alles bleibt auf
// dem Gerät. Farben fest im Look „B+ Familienalbum“ (Werte aus styles/palettes.css, helles Album) - die Karte sieht
// überall gleich aus, auch wenn die App gerade dunkel ist.
import { CARD_HEIGHT, CARD_WIDTH } from './grusskarte.js'
import { qrSvgPath } from './qr.js'
import { t } from './i18n/index.js'

const COLORS = Object.freeze({
  paper: '#fbf5ec',
  paperDeep: '#f3e8d9',
  polaroid: '#ffffff',
  ink: '#2e241d',
  inkSoft: '#4a3c31',
  terra: '#a64b2a',
  blush: '#f6e6d8',
  shadow: 'rgba(46, 36, 29, 0.22)'
})
const SERIF = "'Fraunces Variable', Georgia, serif"
const HAND = "'Caveat', 'Segoe Print', cursive"
const SANS = "'Figtree Variable', system-ui, sans-serif"
const FONT_LOADS = ['600 64px "Fraunces Variable"', '400 40px "Fraunces Variable"', '600 72px "Caveat"']

const POLAROID = Object.freeze({ x: 130, y: 90, w: 820, h: 800, pad: 34, captionH: 110, tilt: -0.025 })
const TEXT_X = 110
const TEXT_W = CARD_WIDTH - 2 * TEXT_X
const QR_SIZE = 168
const QR_QUIET = 14
const FOOTER_Y = CARD_HEIGHT - 70
const ELLIPSIS = '…'

// Schriften des Albums abwarten (sonst zeichnet die Fläche mit Ersatzschrift). Klappt das nicht: eben Ersatzschrift.
export async function waitForFonts(doc = globalThis.document) {
  const fonts = doc?.fonts
  if (!fonts) return
  try {
    await Promise.all(FONT_LOADS.map((spec) => fonts.load(spec).catch(() => null)))
    await fonts.ready
  } catch {
    // Ersatzschrift ist kein Fehler.
  }
}

// Foto laden; null, wenn es nicht geht (dann wird es eine Karte nur mit Text).
export function loadImage(url, ImageImpl = globalThis.Image) {
  if (!url || !ImageImpl) return Promise.resolve(null)
  return new Promise((resolve) => {
    const img = new ImageImpl()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

// Zeilen umbrechen, höchstens maxLines - die letzte bekommt bei Bedarf „…“.
export function wrapLines(ctx, text, maxWidth, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  const lines = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (ctx.measureText(next).width <= maxWidth || !current) {
      current = next
      continue
    }
    lines.push(current)
    current = word
  }
  if (current) lines.push(current)
  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  let last = kept[maxLines - 1]
  while (last && ctx.measureText(`${last}${ELLIPSIS}`).width > maxWidth) last = last.split(' ').slice(0, -1).join(' ')
  kept[maxLines - 1] = `${last || kept[maxLines - 1]}${ELLIPSIS}`
  return kept
}

// Ausschnitt wie object-fit: cover
function drawCover(ctx, img, x, y, w, h) {
  const scale = Math.max(w / img.width, h / img.height)
  const sw = w / scale
  const sh = h / scale
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h)
}

// Logo (wie components/PawMark.jsx) in einem Kreis mit Durchmesser size
function drawPawMark(ctx, x, y, size) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(size / 64, size / 64)
  ctx.beginPath()
  ctx.arc(32, 32, 31, 0, Math.PI * 2)
  ctx.fillStyle = COLORS.blush
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = COLORS.terra
  ctx.stroke()
  ctx.fillStyle = COLORS.ink
  for (const [cx, cy, rx, ry, deg] of [[16, 29.5, 4, 5, -26], [24.5, 18.5, 4.3, 5.4, -9], [39.5, 18.5, 4.3, 5.4, 9], [48, 29.5, 4, 5, 26]]) {
    ctx.beginPath()
    ctx.ellipse(cx, cy, rx, ry, (deg * Math.PI) / 180, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.beginPath()
  ctx.moveTo(32, 53)
  ctx.bezierCurveTo(22, 46, 18.8, 43, 18.8, 38.2)
  ctx.bezierCurveTo(18.8, 34.4, 21.7, 31.4, 25.2, 31.4)
  ctx.bezierCurveTo(27.9, 31.4, 30.1, 32.9, 32, 35.3)
  ctx.bezierCurveTo(33.9, 32.9, 36.1, 31.4, 38.8, 31.4)
  ctx.bezierCurveTo(42.3, 31.4, 45.2, 34.4, 45.2, 38.2)
  ctx.bezierCurveTo(45.2, 43, 42, 46, 32, 53)
  ctx.fillStyle = COLORS.terra
  ctx.fill()
  ctx.restore()
}

function drawPolaroid(ctx, model, img) {
  const { x, y, w, h, pad, captionH, tilt } = POLAROID
  ctx.save()
  ctx.translate(x + w / 2, y + h / 2)
  ctx.rotate(tilt)
  ctx.translate(-w / 2, -h / 2)
  ctx.shadowColor = COLORS.shadow
  ctx.shadowBlur = 36
  ctx.shadowOffsetY = 14
  ctx.fillStyle = COLORS.polaroid
  ctx.fillRect(0, 0, w, h)
  ctx.shadowColor = 'transparent'
  const photoW = w - 2 * pad
  const photoH = h - pad - captionH
  if (img) {
    drawCover(ctx, img, pad, pad, photoW, photoH)
  } else {
    // Ohne Foto: Albumpapier mit großem Logo
    ctx.fillStyle = COLORS.paperDeep
    ctx.fillRect(pad, pad, photoW, photoH)
    drawPawMark(ctx, pad + photoW / 2 - 130, pad + photoH / 2 - 130, 260)
  }
  ctx.fillStyle = COLORS.ink
  ctx.font = `600 72px ${HAND}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(model.dogName, w / 2, h - captionH / 2 - 4, photoW)
  ctx.restore()
}

function drawTexts(ctx, model) {
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  let y = POLAROID.y + POLAROID.h + 70
  ctx.fillStyle = COLORS.terra
  ctx.font = `600 30px ${SANS}`
  ctx.fillText(model.date.toUpperCase(), TEXT_X, y)
  y += 68
  ctx.fillStyle = COLORS.ink
  ctx.font = `600 54px ${SERIF}`
  for (const line of wrapLines(ctx, model.title, TEXT_W, 2)) {
    ctx.fillText(line, TEXT_X, y)
    y += 64
  }
  if (!model.line) return
  ctx.fillStyle = COLORS.inkSoft
  ctx.font = `italic 400 36px ${SERIF}`
  for (const line of wrapLines(ctx, model.line, TEXT_W - QR_SIZE - 40, 2)) {
    ctx.fillText(line, TEXT_X, y)
    y += 46
  }
}

function drawQr(ctx, text, x, y, size) {
  const { size: modules, path } = qrSvgPath(text)
  ctx.fillStyle = COLORS.polaroid
  ctx.fillRect(x - QR_QUIET, y - QR_QUIET, size + 2 * QR_QUIET, size + 2 * QR_QUIET)
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(size / modules, size / modules)
  ctx.fillStyle = COLORS.ink
  ctx.fill(new Path2D(path))
  ctx.restore()
}

function drawFooter(ctx, model) {
  drawPawMark(ctx, TEXT_X, FOOTER_Y - 38, 56)
  ctx.fillStyle = COLORS.ink
  ctx.font = `600 34px ${SERIF}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText('Familie auf Pfoten', TEXT_X + 72, FOOTER_Y - 10)
  const qrX = CARD_WIDTH - TEXT_X - QR_SIZE
  const qrY = FOOTER_Y - QR_SIZE - 6
  drawQr(ctx, model.qrUrl, qrX, qrY, QR_SIZE)
  ctx.fillStyle = COLORS.inkSoft
  ctx.font = `400 22px ${SANS}`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(model.host || t('Familie auf Pfoten'), qrX - 30, FOOTER_Y + 18)
}

// Alles zeichnen. img: geladenes Foto oder null.
export function drawCard(ctx, model, img) {
  ctx.fillStyle = COLORS.paper
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)
  ctx.strokeStyle = COLORS.paperDeep
  ctx.lineWidth = 16
  ctx.strokeRect(24, 24, CARD_WIDTH - 48, CARD_HEIGHT - 48)
  drawPolaroid(ctx, model, img)
  drawTexts(ctx, model)
  drawFooter(ctx, model)
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Bild konnte nicht erstellt werden'))), 'image/png')
  })
}

// Karte als PNG-Blob. Ein geladenes, aber nicht lesbares Foto (gesperrte Fläche) führt zur Karte nur mit Text.
// Liefert { blob, withPhoto }.
export async function renderCard(model, { doc = globalThis.document, ImageImpl = globalThis.Image } = {}) {
  await waitForFonts(doc)
  const img = await loadImage(model.photoUrl, ImageImpl)
  const canvas = doc.createElement('canvas')
  canvas.width = CARD_WIDTH
  canvas.height = CARD_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Zeichenfläche nicht verfügbar')
  drawCard(ctx, model, img)
  try {
    return { blob: await canvasToBlob(canvas), withPhoto: Boolean(img) }
  } catch (error) {
    if (!img) throw error
    drawCard(ctx, model, null)
    return { blob: await canvasToBlob(canvas), withPhoto: false }
  }
}
