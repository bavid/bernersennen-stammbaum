import { useRef } from 'react'
import { PAGE, dragFocus } from '../../lib/collage/layout.js'
import { TIMELINE, toLocalDelta } from '../../lib/collage/layouts.js'
import { CONNECTOR, DATE_FONT_SIZE, DOT_RING, LINE_WIDTH } from '../../lib/collage/renderDesign.js'
import { formatDateShort } from '../../lib/dates.js'

// Bausteine der Vorschau - dieselben Maße wie der Export (lib/collage/render.js, renderDesign.js).
export const pct = (value, total) => `${(value / total) * 100}%`
export const cqw = (units) => `${(units / PAGE.width) * 100}cqw`

export function frameStyle(frame) {
  return {
    left: pct(frame.x, PAGE.width),
    top: pct(frame.y, PAGE.height),
    width: pct(frame.width, PAGE.width),
    height: pct(frame.height, PAGE.height)
  }
}

// Bild wie im Export: cover + Fokuspunkt + Zoom um den Fokuspunkt (mathematisch identisch)
function imageStyle(photo) {
  const origin = `${photo.focusX * 100}% ${photo.focusY * 100}%`
  return { objectPosition: origin, transformOrigin: origin, transform: `scale(${photo.zoom})` }
}

// Ein Foto im Rahmen. Ziehen verschiebt den Ausschnitt - bei gedrehten Polaroids in den Achsen des Fotos.
export function PhotoFrame({ photo, style, rotation = 0, interactive, selected, onSelect, onChange }) {
  const drag = useRef(null)

  function handlePointerDown(event) {
    if (!interactive || event.button !== 0 || event.isPrimary === false) return
    onSelect(photo.id)
    const element = event.currentTarget
    const img = element.querySelector('img')
    if (!img?.naturalWidth) return
    element.setPointerCapture(event.pointerId)
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      photo,
      image: { width: img.naturalWidth, height: img.naturalHeight },
      // Layout-Maße ohne Drehung (getBoundingClientRect wäre bei gedrehten Karten zu groß)
      frame: { x: 0, y: 0, width: element.offsetWidth, height: element.offsetHeight }
    }
  }

  function handlePointerMove(event) {
    const state = drag.current
    if (!state || event.pointerId !== state.pointerId) return
    const { dx, dy } = toLocalDelta(event.clientX - state.startX, event.clientY - state.startY, rotation)
    onChange(photo.id, dragFocus(state.photo, state.image, state.frame, dx, dy))
  }

  function endDrag() {
    drag.current = null
  }

  function handleKeyDown(event) {
    if (!interactive || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault() // Leertaste soll nicht die Seite scrollen
    onSelect(photo.id)
  }

  return (
    <div
      className={`cframe ${selected ? 'is-selected' : ''} ${interactive ? 'is-interactive' : ''}`}
      style={style}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? `Foto${photo.caption.trim() ? ` „${photo.caption.trim()}“` : ''} auswählen` : undefined}
      onKeyDown={handleKeyDown}
    >
      <img src={photo.url} alt="" draggable={false} style={imageStyle(photo)} />
      {selected && <span className="cframe-hint">Ziehen zum Verschieben</span>}
    </div>
  )
}

// Polaroid: weiße, leicht gedrehte Karte; das Foto sitzt oben, die Unterschrift im breiten unteren Rand.
export function PolaroidCard({ frame, photo, ...frameProps }) {
  const card = frame.polaroid
  const inner = {
    left: pct(card.border, card.width),
    top: pct(card.border, card.height),
    width: pct(frame.width, card.width),
    height: pct(frame.height, card.height)
  }
  return (
    <div className="cpolaroid" style={{ ...frameStyle(card), transform: `rotate(${frame.rotation}deg)` }}>
      <PhotoFrame photo={photo} style={inner} rotation={frame.rotation} {...frameProps} />
      <div
        className="cpolaroid-caption"
        style={{
          top: pct(card.border + frame.height, card.height),
          height: pct(card.captionHeight, card.height),
          fontSize: cqw(card.captionFont),
          // Optische Größe wie im Export (Canvas misst in Seiteneinheiten)
          fontVariationSettings: `'opsz' ${Math.round(card.captionFont)}`
        }}
      >
        <span>{photo.caption.trim()}</span>
      </div>
    </div>
  )
}

export function FrameCaption({ frame, text }) {
  const align = frame.timeline?.align || 'left'
  return (
    <div
      className={`cpage-caption ${align === 'right' ? 'is-right' : ''}`}
      style={{
        left: pct(frame.x, PAGE.width),
        top: pct(frame.captionY, PAGE.height),
        width: pct(frame.width, PAGE.width),
        height: pct(frame.captionHeight, PAGE.height)
      }}
    >
      <span>{text}</span>
    </div>
  )
}

const DOT_OUTER = TIMELINE.dotRadius + DOT_RING / 2 // Punkt plus halber Ring (Export: arc r=9, stroke 4)

export function TimelineLine({ line }) {
  return (
    <div
      className="ctl-line"
      aria-hidden="true"
      style={{
        left: pct(line.x - LINE_WIDTH / 2, PAGE.width),
        top: pct(line.y1, PAGE.height),
        width: pct(LINE_WIDTH, PAGE.width),
        height: pct(line.y2 - line.y1, PAGE.height)
      }}
    />
  )
}

export function TimelineMark({ frame, photo, lineX }) {
  const { side, dotY, dateY, align } = frame.timeline
  const connectorX = side === 'left' ? lineX - CONNECTOR.to : lineX + CONNECTOR.from
  const date = formatDateShort(photo.date)
  return (
    <>
      <span
        className="ctl-connector"
        aria-hidden="true"
        style={{
          left: pct(connectorX, PAGE.width),
          top: pct(dotY - CONNECTOR.width / 2, PAGE.height),
          width: pct(CONNECTOR.to - CONNECTOR.from, PAGE.width),
          height: pct(CONNECTOR.width, PAGE.height)
        }}
      />
      <span
        className="ctl-dot"
        aria-hidden="true"
        style={{ left: pct(lineX - DOT_OUTER, PAGE.width), top: pct(dotY - DOT_OUTER, PAGE.height), width: pct(DOT_OUTER * 2, PAGE.width), height: pct(DOT_OUTER * 2, PAGE.height) }}
      />
      {date && (
        <div
          className={`ctl-date ${align === 'right' ? 'is-right' : ''}`}
          style={{ left: pct(frame.x, PAGE.width), top: pct(dateY, PAGE.height), width: pct(frame.width, PAGE.width), height: pct(TIMELINE.dateHeight, PAGE.height), fontSize: cqw(DATE_FONT_SIZE) }}
        >
          {date}
        </div>
      )}
    </>
  )
}

// Freier Platz einer festen Vorlage - nur im Editor, nie im Export.
export function EmptySlot({ slot }) {
  return (
    <div className="cslot" style={frameStyle(slot)} aria-hidden="true">
      <span>Platz für ein Foto</span>
    </div>
  )
}
