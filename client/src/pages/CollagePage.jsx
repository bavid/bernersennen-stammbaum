import { useEffect, useRef, useState } from 'react'
import { api } from '../api'

const CANVAS_WIDTH = 1240
const CANVAS_HEIGHT = 1754 // A4-Verhältnis bei 150dpi

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

function drawPhotoGrid(ctx, images, x, y, width, height) {
  if (!images.length) return
  const columns = images.length > 2 ? 2 : images.length
  const rows = Math.ceil(images.length / columns)
  const gap = 16
  const cellWidth = (width - gap * (columns - 1)) / columns
  const cellHeight = (height - gap * (rows - 1)) / rows

  images.forEach((img, index) => {
    const col = index % columns
    const row = Math.floor(index / columns)
    const cellX = x + col * (cellWidth + gap)
    const cellY = y + row * (cellHeight + gap)

    const scale = Math.max(cellWidth / img.width, cellHeight / img.height)
    const drawWidth = img.width * scale
    const drawHeight = img.height * scale

    ctx.save()
    ctx.beginPath()
    ctx.rect(cellX, cellY, cellWidth, cellHeight)
    ctx.clip()
    ctx.drawImage(
      img,
      cellX + (cellWidth - drawWidth) / 2,
      cellY + (cellHeight - drawHeight) / 2,
      drawWidth,
      drawHeight
    )
    ctx.restore()
  })
}

export default function CollagePage() {
  const [dogs, setDogs] = useState([])
  const [selectedDogId, setSelectedDogId] = useState('')
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
      const [dog, entries] = await Promise.all([
        api.getDog(selectedDogId),
        api.listTimeline(selectedDogId)
      ])

      const photoUrls = [
        dog.foto_url,
        ...entries.flatMap((entry) => entry.foto_urls)
      ]
        .filter(Boolean)
        .slice(0, 6)

      const images = await Promise.all(photoUrls.map(loadImage))

      const canvas = canvasRef.current
      canvas.width = CANVAS_WIDTH
      canvas.height = CANVAS_HEIGHT
      const ctx = canvas.getContext('2d')

      ctx.fillStyle = '#f6efe4'
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

      ctx.fillStyle = '#9c3d20'
      ctx.fillRect(0, 0, CANVAS_WIDTH, 12)

      ctx.fillStyle = '#1c140f'
      ctx.textAlign = 'center'
      ctx.font = 'bold 84px Georgia, serif'
      ctx.fillText(dog.name, CANVAS_WIDTH / 2, 160)

      const geburtsjahr = dog.geburtsdatum ? new Date(dog.geburtsdatum).getFullYear() : null
      const subtitleParts = [dog.geschlecht === 'ruede' ? 'Rüde' : 'Hündin']
      if (geburtsjahr) subtitleParts.push(`geb. ${geburtsjahr}`)
      ctx.fillStyle = '#6f6154'
      ctx.font = '36px Georgia, serif'
      ctx.fillText(subtitleParts.join(' · '), CANVAS_WIDTH / 2, 210)

      drawPhotoGrid(ctx, images, 80, 280, CANVAS_WIDTH - 160, 1180)

      const motherName = dog.mother?.name || dog.mother_freitext || 'unbekannt'
      const fatherName = dog.father?.name || dog.father_freitext || 'unbekannt'
      ctx.textAlign = 'left'
      ctx.fillStyle = '#1c140f'
      ctx.font = 'bold 32px Georgia, serif'
      ctx.fillText('Eltern', 80, 1540)
      ctx.font = '28px Georgia, serif'
      ctx.fillStyle = '#3a2f24'
      ctx.fillText(`Mutter: ${motherName}`, 80, 1585)
      ctx.fillText(`Vater: ${fatherName}`, 80, 1625)

      ctx.textAlign = 'right'
      ctx.fillStyle = '#6f6154'
      ctx.font = '24px Georgia, serif'
      ctx.fillText('Familienchronik', CANVAS_WIDTH - 80, 1690)
    } catch (err) {
      setError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  function handleDownload() {
    const canvas = canvasRef.current
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const dogName = dogs.find((d) => d.id === Number(selectedDogId))?.name || 'collage'
      a.href = url
      a.download = `${dogName}-collage.png`
      a.click()
      URL.revokeObjectURL(url)
    }, 'image/png')
  }

  return (
    <div>
      <div className="page-header">
        <div className="eyebrow">Zum Ausdrucken</div>
        <h1>Collage-Generator</h1>
        <p>Wähle einen Hund, erstelle eine druckbare Collage aus seinen Fotos und lade sie herunter.</p>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 'var(--space-4)' }}>{error}</div>}

      <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="form-row-inline" style={{ alignItems: 'flex-end' }}>
          <div className="form-row">
            <label htmlFor="dogSelect">Hund</label>
            <select id="dogSelect" value={selectedDogId} onChange={(e) => setSelectedDogId(e.target.value)}>
              <option value="">– Hund wählen –</option>
              {dogs.map((dog) => (
                <option key={dog.id} value={dog.id}>
                  {dog.name}
                </option>
              ))}
            </select>
          </div>
          <button className="btn btn-primary" onClick={handleGenerate} disabled={!selectedDogId || generating}>
            {generating ? 'Erstelle...' : 'Collage erstellen'}
          </button>
          <button className="btn btn-ghost" onClick={handleDownload} disabled={!selectedDogId}>
            Als PNG herunterladen
          </button>
        </div>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', maxWidth: '32rem', display: 'block', margin: '0 auto', borderRadius: 'var(--radius-md)' }}
        />
      </div>
    </div>
  )
}
