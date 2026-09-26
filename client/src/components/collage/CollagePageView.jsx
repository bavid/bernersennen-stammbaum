import { useEffect, useMemo, useRef, useState } from 'react'
import { CAPTION_HEIGHT, MARGIN, PAGE, computeFrames, dragFocus } from '../../lib/collage/layout.js'
import { hasCaptions, titleFontSize } from '../../lib/collage/render.js'

const pct = (value, total) => `${(value / total) * 100}%`

function frameStyle(frame) {
  return {
    left: pct(frame.x, PAGE.width),
    top: pct(frame.y, PAGE.height),
    width: pct(frame.width, PAGE.width),
    height: pct(frame.height, PAGE.height)
  }
}

function captionStyle(frame) {
  return {
    left: pct(frame.x, PAGE.width),
    top: pct(frame.captionY, PAGE.height),
    width: pct(frame.width, PAGE.width),
    height: pct(CAPTION_HEIGHT, PAGE.height)
  }
}

// Bild wie im Export: cover + Fokuspunkt + Zoom um den Fokuspunkt (mathematisch identisch)
function imageStyle(photo) {
  const origin = `${photo.focusX * 100}% ${photo.focusY * 100}%`
  return { objectPosition: origin, transformOrigin: origin, transform: `scale(${photo.zoom})` }
}

function Frame({ photo, frame, interactive, selected, onSelect, onChange }) {
  const drag = useRef(null)

  function handlePointerDown(event) {
    if (!interactive) return
    onSelect(photo.id)
    const img = event.currentTarget.querySelector('img')
    if (!img?.naturalWidth) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const rect = event.currentTarget.getBoundingClientRect()
    drag.current = {
      startX: event.clientX,
      startY: event.clientY,
      photo,
      image: { width: img.naturalWidth, height: img.naturalHeight },
      frame: { x: 0, y: 0, width: rect.width, height: rect.height }
    }
  }

  function handlePointerMove(event) {
    const state = drag.current
    if (!state) return
    const focus = dragFocus(state.photo, state.image, state.frame, event.clientX - state.startX, event.clientY - state.startY)
    onChange(photo.id, focus)
  }

  function endDrag() {
    drag.current = null
  }

  return (
    <div
      className={`cframe ${selected ? 'is-selected' : ''} ${interactive ? 'is-interactive' : ''}`}
      style={frameStyle(frame)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? `Foto ${photo.caption || ''} auswählen` : undefined}
      onKeyDown={(event) => interactive && (event.key === 'Enter' || event.key === ' ') && onSelect(photo.id)}
    >
      <img src={photo.url} alt="" draggable={false} style={imageStyle(photo)} />
      {selected && <span className="cframe-hint">Ziehen zum Verschieben</span>}
    </div>
  )
}

// Eine Collage-Seite. interactive=false für Vorschaubilder in der Seitenleiste.
// Neu messen, sobald die Schriften geladen sind (vorher misst der Browser mit der Ersatzschrift)
function useFontsReady() {
  const [ready, setReady] = useState(() => document.fonts?.status === 'loaded')
  useEffect(() => {
    if (!ready) document.fonts?.ready.then(() => setReady(true))
  }, [ready])
  return ready
}

export default function CollagePageView({ page, interactive = false, selectedPhotoId, onSelectPhoto, onPhotoChange }) {
  const withCaptions = hasCaptions(page)
  const frames = computeFrames(page.photos.length, { withCaptions })
  const fontsReady = useFontsReady()
  const titleSize = useMemo(() => titleFontSize(page.title), [page.title, fontsReady])

  return (
    <div className={`cpage ${interactive ? 'is-interactive' : ''}`}>
      <div className="cpage-tricolor cpage-tricolor-top" />
      <div
        className="cpage-title"
        style={{
          left: pct(MARGIN, PAGE.width),
          right: pct(MARGIN, PAGE.width),
          fontSize: `${(titleSize / PAGE.width) * 100}cqw`,
          // Optische Größe wie im Export (dort = Schriftgröße in Seiteneinheiten), sonst würde die
          // kleine Vorschau breitere Buchstaben rendern und der Titel nicht mehr passen
          fontVariationSettings: `'opsz' ${titleSize}`
        }}
      >
        {page.title}
      </div>
      <div className="cpage-subtitle" style={{ left: pct(MARGIN, PAGE.width), right: pct(MARGIN, PAGE.width) }}>
        {page.subtitle}
      </div>

      {page.photos.map((photo, i) => (
        <Frame
          key={photo.id}
          photo={photo}
          frame={frames[i]}
          interactive={interactive}
          selected={selectedPhotoId === photo.id}
          onSelect={onSelectPhoto}
          onChange={onPhotoChange}
        />
      ))}
      {withCaptions &&
        page.photos.map((photo, i) => (
          <div key={`${photo.id}-caption`} className="cpage-caption" style={captionStyle(frames[i])}>
            {photo.caption}
          </div>
        ))}
      {page.photos.length === 0 && <div className="cpage-empty">Noch keine Fotos auf dieser Seite</div>}

      <div className="cpage-footer" style={{ left: pct(MARGIN, PAGE.width), right: pct(MARGIN, PAGE.width) }}>
        <span>{page.footer}</span>
        <span className="cpage-brand">Familienchronik</span>
      </div>
      <div className="cpage-tricolor cpage-tricolor-bottom" />
    </div>
  )
}
