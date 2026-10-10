import { useId, useLayoutEffect, useRef, useState } from 'react'
import { PAGE } from '../../lib/collage/layout.js'
import { stickerLabels, stickerUrl } from '../../lib/collage/stickers.js'
import {
  moveSticker,
  resizeByDrag,
  resizeHandleCorner,
  rotateByDrag,
  rotateHandleBelow,
  stickerKeyAction
} from '../../lib/collage/stickerTransform.js'
import { t } from '../../lib/i18n/index.js'

// Sticker liegen über allem (wie im Export). Position: Mittelpunkt relativ zur Seite, Größe relativ zur Breite.
function stickerStyle(sticker) {
  return {
    left: `${sticker.x * 100}%`,
    top: `${sticker.y * 100}%`,
    width: `${sticker.size * 100}%`,
    transform: `translate(-50%, -50%) rotate(${sticker.rotation}deg)`
  }
}

// Zeigerposition in Seiteneinheiten (gleiche Einheiten auf beiden Achsen - für Abstand und Winkel)
function pagePoint(event, element) {
  const rect = element.closest('.cpage').getBoundingClientRect()
  return { x: ((event.clientX - rect.left) / rect.width) * PAGE.width, y: ((event.clientY - rect.top) / rect.height) * PAGE.height }
}

const focusPage = (element) => element?.closest('.cpage')?.focus({ preventScroll: true })

const DEFAULT_PLACEMENT = { rotateBelow: false, resizeCorner: 'br' }

// Griffe so setzen, dass .cpage (overflow: hidden) sie nicht abschneidet - neu gemessen nach jeder Änderung des
// Stickers und wenn sich die Seite in der Größe ändert (Fenster, Schriftgröße).
function useHandlePlacement(ref, sticker, selected) {
  const [placement, setPlacement] = useState(DEFAULT_PLACEMENT)
  const [pageSize, setPageSize] = useState(0)
  useLayoutEffect(() => {
    const pageElement = ref.current?.closest('.cpage')
    if (!selected || !pageElement) {
      setPlacement(DEFAULT_PLACEMENT)
      return
    }
    const rect = pageElement.getBoundingClientRect()
    setPlacement({ rotateBelow: rotateHandleBelow(sticker, rect), resizeCorner: resizeHandleCorner(sticker, rect) })
  }, [ref, selected, sticker, pageSize])
  useLayoutEffect(() => {
    const pageElement = ref.current?.closest('.cpage')
    if (!selected || !pageElement || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(([entry]) => setPageSize(entry.contentRect.width))
    observer.observe(pageElement)
    return () => observer.disconnect()
  }, [ref, selected])
  return placement
}

function InteractiveSticker({ sticker, label, selected, helpId, onSelect, onChange, onRemove }) {
  const drag = useRef(null)
  const element = useRef(null)
  const placement = useHandlePlacement(element, sticker, selected)

  const start = (mode) => (event) => {
    event.stopPropagation()
    // Nur die Haupttaste bzw. der erste Finger: ein zweiter Finger oder ein Rechtsklick startet nichts
    if (event.button !== 0 || event.isPrimary === false) return
    onSelect(sticker.id)
    const target = event.currentTarget
    target.setPointerCapture?.(event.pointerId)
    drag.current = { mode, sticker, element: target, pointerId: event.pointerId, start: pagePoint(event, target) }
  }

  function handlePointerMove(event) {
    const state = drag.current
    if (!state || event.pointerId !== state.pointerId) return
    const point = pagePoint(event, state.element)
    const center = { x: state.sticker.x * PAGE.width, y: state.sticker.y * PAGE.height }
    if (state.mode === 'move') {
      onChange(moveSticker(state.sticker, (point.x - state.start.x) / PAGE.width, (point.y - state.start.y) / PAGE.height))
    } else if (state.mode === 'resize') {
      onChange({ ...state.sticker, size: resizeByDrag(state.sticker.size, center, state.start, point) })
    } else {
      onChange({ ...state.sticker, rotation: rotateByDrag(state.sticker.rotation, center, state.start, point) })
    }
  }

  function endDrag(event) {
    if (drag.current && event.pointerId === drag.current.pointerId) drag.current = null
  }

  function handleKeyDown(event) {
    const action = stickerKeyAction(sticker, event)
    if (!action) return
    event.preventDefault()
    event.stopPropagation()
    if (action.type === 'update') onChange(action.sticker)
    // Escape und Löschen: Fokus zurück auf die Seite (nicht ins Leere, ohne zu scrollen)
    if (action.type === 'deselect') {
      focusPage(event.currentTarget)
      onSelect(null)
    }
    if (action.type === 'remove') {
      focusPage(event.currentTarget)
      onRemove(sticker.id)
    }
  }

  return (
    <div
      ref={element}
      className={`csticker is-interactive ${selected ? 'is-selected' : ''}`}
      style={stickerStyle(sticker)}
      role="button"
      tabIndex={0}
      aria-label={t('Sticker: {name}', { name: label })}
      aria-pressed={selected}
      aria-describedby={helpId}
      onPointerDown={start('move')}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onKeyDown={handleKeyDown}
      onFocus={() => !selected && onSelect(sticker.id)}
    >
      <img src={stickerUrl(sticker.sticker)} alt="" draggable={false} />
      {selected && (
        <>
          <span
            className={`csticker-handle csticker-rotate ${placement.rotateBelow ? 'is-below' : ''}`}
            onPointerDown={start('rotate')}
            title={t('Drehen')}
            aria-hidden="true"
          />
          <span
            className={`csticker-handle csticker-resize is-${placement.resizeCorner}`}
            onPointerDown={start('resize')}
            title={t('Größe ändern')}
            aria-hidden="true"
          />
        </>
      )}
    </div>
  )
}

export default function StickerLayer({ stickers = [], interactive = false, selectedId = null, onSelect, onChange, onRemove }) {
  const helpId = useId()
  if (!stickers.length) return null
  if (!interactive) {
    return stickers.map((sticker) => (
      <img key={sticker.id} className="csticker" style={stickerStyle(sticker)} src={stickerUrl(sticker.sticker)} alt="" aria-hidden="true" draggable={false} />
    ))
  }
  const labels = stickerLabels(stickers)
  return (
    <>
      {stickers.map((sticker, i) => (
        <InteractiveSticker
          key={sticker.id}
          sticker={sticker}
          label={labels[i]}
          selected={sticker.id === selectedId}
          helpId={helpId}
          onSelect={onSelect}
          onChange={onChange}
          onRemove={onRemove}
        />
      ))}
      <span id={helpId} className="visually-hidden">
        {t('Ziehen oder Pfeiltasten verschieben, Plus und Minus ändern die Größe, R dreht, Entf löscht, Escape beendet die Auswahl.')}
      </span>
    </>
  )
}
