import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import Icon from '../components/Icon.jsx'
import { formatDateLong } from '../lib/dates.js'
import { sexLabel, shortName } from '../lib/timeline.js'

const CANVAS_WIDTH = 1240
const CANVAS_HEIGHT = 1754 // A4 bei 150 dpi
const MARGIN = 90
const MAX_PHOTOS = 6
const COLORS = { paper: '#f6efe4', ink: '#1c1511', muted: '#74665a', rust: '#a4431d', snow: '#fffaf2', tan: '#d49a5b' }
const DISPLAY_FONT = "'Fraunces Variable', Georgia, serif"
const BODY_FONT = "'Manrope Variable', 'Segoe UI', sans-serif"

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Ein Foto konnte nicht geladen werden'))
    img.src = url
  })
}

function drawCover(ctx, img, x, y, width, height, radius) {
  const scale = Math.max(width / img.width, height / img.height)
  const drawWidth = img.width * scale
  const drawHeight = img.height * scale
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(x, y, width, height, radius)
  ctx.clip()
  ctx.drawImage(img, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight)
  ctx.restore()
}

// Erstes Foto groß, der Rest als Raster darunter.
function drawPhotos(ctx, images, top, height) {
  if (!images.length) return
  const width = CANVAS_WIDTH - MARGIN * 2
  const gap = 20
  const [hero, ...rest] = images
  const heroHeight = rest.length ? height * 0.58 : height
  drawCover(ctx, hero, MARGIN, top, width, heroHeight, 18)
  if (!rest.length) return

  const columns = Math.min(rest.length, 3)
  const rows = Math.ceil(rest.length / columns)
  const cellWidth = (width - gap * (columns - 1)) / columns
  const cellHeight = (height - heroHeight - gap * rows) / rows
  rest.forEach((img, i) => {
    const col = i % columns
    const row = Math.floor(i / columns)
    drawCover(ctx, img, MARGIN + col * (cellWidth + gap), top + heroHeight + gap + row * (cellHeight + gap), cellWidth, cellHeight, 14)
  })
}

function drawTricolor(ctx, y) {
  const stripe = CANVAS_WIDTH / 3
  ;[COLORS.ink, COLORS.snow, COLORS.rust].forEach((color, i) => {
    ctx.fillStyle = color
    ctx.fillRect(i * stripe, y, stripe + 1, 16)
  })
}

async function renderCollage(canvas, dog, entries) {
  await Promise.all([document.fonts.load(`600 80px ${DISPLAY_FONT}`), document.fonts.load(`500 30px ${BODY_FONT}`)])
  const photoUrls = [dog.foto_url, ...entries.flatMap((entry) => entry.foto_urls)].filter(Boolean)
  const uniqueUrls = [...new Set(photoUrls)].slice(0, MAX_PHOTOS)
  const images = await Promise.all(uniqueUrls.map(loadImage))

  canvas.width = CANVAS_WIDTH
  canvas.height = CANVAS_HEIGHT
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = COLORS.paper
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
  drawTricolor(ctx, 0)

  ctx.fillStyle = COLORS.rust
  ctx.font = `700 24px ${BODY_FONT}`
  ctx.textAlign = 'left'
  ctx.fillText(`${sexLabel(dog.geschlecht).toUpperCase()} · ${dog.familyName.toUpperCase()}`, MARGIN, 120)

  ctx.fillStyle = COLORS.ink
  ctx.font = `600 104px ${DISPLAY_FONT}`
  ctx.fillText(shortName(dog.name), MARGIN, 230)

  ctx.fillStyle = COLORS.muted
  ctx.font = `500 30px ${BODY_FONT}`
  const subtitle = [dog.name !== shortName(dog.name) ? dog.name : null, dog.geburtsdatum ? `geboren am ${formatDateLong(dog.geburtsdatum)}` : null]
  ctx.fillText(subtitle.filter(Boolean).join('  ·  '), MARGIN, 285)

  drawPhotos(ctx, images, 340, 1150)

  const motherName = dog.mother?.name || dog.mother_freitext || 'unbekannt'
  const fatherName = dog.father?.name || dog.father_freitext || 'unbekannt'
  ctx.fillStyle = COLORS.rust
  ctx.font = `700 22px ${BODY_FONT}`
  ctx.fillText('MUTTER', MARGIN, 1560)
  ctx.fillText('VATER', CANVAS_WIDTH / 2, 1560)
  ctx.fillStyle = COLORS.ink
  ctx.font = `500 38px ${DISPLAY_FONT}`
  ctx.fillText(motherName, MARGIN, 1610)
  ctx.fillText(fatherName, CANVAS_WIDTH / 2, 1610)

  ctx.fillStyle = COLORS.muted
  ctx.font = `500 22px ${BODY_FONT}`
  ctx.textAlign = 'right'
  ctx.fillText('Familienchronik', CANVAS_WIDTH - MARGIN, 1690)
  drawTricolor(ctx, CANVAS_HEIGHT - 16)
}

export default function CollagePage() {
  const [dogs, setDogs] = useState([])
  const [selectedDogId, setSelectedDogId] = useState('')
  const [rendered, setRendered] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    api
      .listDogs()
      .then(setDogs)
      .catch((err) => setError(err.message))
  }, [])

  async function handleGenerate() {
    if (!selectedDogId) return
    setError(null)
    setGenerating(true)
    try {
      const [dog, entries] = await Promise.all([api.getDog(selectedDogId), api.listTimeline(selectedDogId)])
      await renderCollage(canvasRef.current, dog, entries)
      setRendered(dog)
    } catch (err) {
      setError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  function handleDownload() {
    canvasRef.current.toBlob((blob) => {
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${shortName(rendered.name)}-collage.png`
      link.click()
      URL.revokeObjectURL(url)
    }, 'image/png')
  }

  return (
    <div className="page">
      <header className="page-hero">
        <div>
          <span className="eyebrow">Zum Ausdrucken</span>
          <h1>Collage</h1>
          <p className="page-lede">
            Wähle einen Hund – wir setzen Porträt, Chronik-Fotos und Eltern auf ein A4-Blatt. Perfekt als Geschenk oder
            für die Wand.
          </p>
        </div>
      </header>

      {error && <div className="error-banner" role="alert">{error}</div>}

      <div className="collage-layout">
        <div className="card form-stack collage-controls">
          <div className="field">
            <label className="field-label" htmlFor="collage-dog">
              Hund
            </label>
            <select id="collage-dog" value={selectedDogId} onChange={(e) => setSelectedDogId(e.target.value)}>
              <option value="">– Hund wählen –</option>
              {dogs.map((dog) => (
                <option key={dog.id} value={dog.id}>
                  {dog.name}
                </option>
              ))}
            </select>
          </div>
          <button type="button" className="btn btn-primary" onClick={handleGenerate} disabled={!selectedDogId || generating}>
            <Icon name="image" />
            {generating ? 'Erstelle …' : 'Collage erstellen'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={handleDownload} disabled={!rendered || generating}>
            <Icon name="download" />
            Als PNG herunterladen
          </button>
        </div>

        <div className={`collage-preview ${rendered ? 'has-image' : ''}`}>
          <canvas ref={canvasRef} aria-label={rendered ? `Collage von ${rendered.name}` : undefined} />
          {!rendered && (
            <p className="muted">
              <Icon name="collage" />
              Hier erscheint die Vorschau.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
