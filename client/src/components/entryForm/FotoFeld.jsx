import { useEffect, useId, useRef, useState } from 'react'
import Icon from '../Icon.jsx'
import Polaroid from '../Polaroid.jsx'
import usePhotoUpload from '../../hooks/usePhotoUpload.js'
import { useIsAdminView, useIsDemo } from '../../lib/demo.js'

function move(list, from, to) {
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

// Kleine Knöpfe unter einem Foto: nach vorne, nach hinten, entfernen.
function FotoKnoepfe({ index, count, onMove, onRemove }) {
  const n = index + 1
  return (
    <div className="foto-feld-tools">
      <button type="button" className="icon-btn" data-move="vor" aria-label={`Foto ${n} nach vorne`} disabled={index === 0} onClick={() => onMove(index, -1)}>
        <Icon name="chevronLeft" />
      </button>
      <button type="button" className="icon-btn" data-move="zurueck" aria-label={`Foto ${n} nach hinten`} disabled={index === count - 1} onClick={() => onMove(index, 1)}>
        <Icon name="chevronRight" />
      </button>
      <button type="button" className="icon-btn" aria-label={`Foto ${n} entfernen`} onClick={() => onRemove(index)}>
        <Icon name="close" />
      </button>
    </div>
  )
}

// Fotos zuerst (Erinnerung festhalten): eine große, freundliche Fläche „Fotos hinzufügen“ zum Tippen oder Hineinziehen, die
// Fotos danach als Polaroids - mit Knöpfen zum Umstellen (das erste ist das Bild im Feed) und Entfernen. Lädt sofort hoch
// (hooks/usePhotoUpload.js). Schreibgeschützt (Demo, Admin-Ansicht): kein Upload.
export default function FotoFeld({ value, onChange, onBusyChange, onError }) {
  const inputId = useId()
  const hintId = useId()
  const isDemo = useIsDemo()
  const isAdminView = useIsAdminView()
  const [dragging, setDragging] = useState(false)
  const [focusTarget, setFocusTarget] = useState(null)
  const listRef = useRef(null)
  // Die Liste, wie sie gerade ist - ein Upload dauert; wer währenddessen ein Foto entfernt oder umstellt, behält das.
  const latest = useRef(value)
  useEffect(() => {
    latest.current = value
  })
  const { busy, upload } = usePhotoUpload({ onUploaded: (urls) => onChange([...latest.current, ...urls]), onError, onBusyChange })

  // Nach dem Umstellen bleibt der Fokus beim selben Foto (React verschiebt das Element - der Fokus ginge sonst verloren).
  useEffect(() => {
    if (!focusTarget) return
    const item = [...(listRef.current?.querySelectorAll('[data-url]') || [])].find((el) => el.dataset.url === focusTarget.url)
    const preferred = item?.querySelector(`[data-move="${focusTarget.dir}"]`)
    ;(preferred && !preferred.disabled ? preferred : item?.querySelector('[data-move]:not(:disabled)'))?.focus()
    setFocusTarget(null)
  }, [focusTarget])

  function handleMove(index, step) {
    setFocusTarget({ url: value[index], dir: step < 0 ? 'vor' : 'zurueck' })
    onChange(move(value, index, index + step))
  }

  function handleDrop(event) {
    event.preventDefault()
    setDragging(false)
    if (!isDemo && !busy) upload(event.dataTransfer?.files)
  }

  function handleFiles(event) {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    upload(files)
  }

  const empty = value.length === 0
  const label = busy ? 'Lädt …' : empty ? 'Fotos hinzufügen' : 'Weitere Fotos'

  return (
    <div className={`foto-feld${empty ? ' is-empty' : ''}`}>
      {!empty && (
        <ul className="foto-feld-list" role="list" aria-label="Fotos" ref={listRef}>
          {value.map((url, index) => (
            <li key={url} className="foto-feld-item" data-url={url}>
              <Polaroid src={url} index={index} width={132} height={99} />
              {!isDemo && <FotoKnoepfe index={index} count={value.length} onMove={handleMove} onRemove={(i) => onChange(value.filter((_, j) => j !== i))} />}
            </li>
          ))}
        </ul>
      )}
      {value.length > 1 && <p className="field-hint foto-feld-order-hint">Das erste Foto steht vorne im Feed.</p>}
      {isDemo ? (
        <p className="foto-feld-add is-disabled">
          <Icon name="camera" />
          <span>{isAdminView ? 'Admin-Ansicht: keine Fotos' : 'Demo: keine Fotos'}</span>
        </p>
      ) : (
        <label
          className={`foto-feld-add${dragging ? ' is-dragging' : ''}${busy ? ' is-busy' : ''}`}
          htmlFor={inputId}
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <Icon name="camera" />
          <span className="foto-feld-label" aria-live="polite">
            {label}
          </span>
          {empty && (
            <span className="foto-feld-hint" id={hintId}>
              Tippen oder Fotos hierher ziehen
            </span>
          )}
          <input
            id={inputId}
            className="visually-hidden"
            type="file"
            accept="image/*"
            multiple
            onChange={handleFiles}
            disabled={busy}
            aria-describedby={empty ? hintId : undefined}
          />
        </label>
      )}
    </div>
  )
}
