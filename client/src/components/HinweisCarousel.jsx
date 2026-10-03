import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import { STUFE } from '../lib/hinweise.js'

const ICONS = { [STUFE.info]: 'info', [STUFE.wartung]: 'wrench', [STUFE.wichtig]: 'alert' }
// Die Stufe steckt in der Farbe - als Wort für alle, die sie nicht sehen (am Desktop auch sichtbar, außer bei "info").
const STUFE_WORDS = { [STUFE.info]: 'Info', [STUFE.wartung]: 'Wartung', [STUFE.wichtig]: 'Wichtig' }

function Pager({ index, count, onStep }) {
  return (
    <div className="hinweis-pager" role="group" aria-label="Hinweise blättern">
      <button type="button" className="hinweis-btn" aria-label="Vorheriger Hinweis" title="Zurück" onClick={() => onStep(-1)}>
        <Icon name="chevronLeft" />
      </button>
      <span className="hinweis-count">
        <span aria-hidden="true">
          {index + 1} / {count}
        </span>
        <span className="visually-hidden">
          Hinweis {index + 1} von {count}
        </span>
      </span>
      <button type="button" className="hinweis-btn" aria-label="Nächster Hinweis" title="Weiter" onClick={() => onStep(1)}>
        <Icon name="chevronRight" />
      </button>
    </div>
  )
}

function DismissButton({ preview, onClick }) {
  return (
    <button
      type="button"
      className="hinweis-btn"
      aria-label="Hinweis ausblenden"
      title={preview ? 'Nur Vorschau' : 'Hinweis ausblenden'}
      disabled={preview}
      onClick={onClick}
    >
      <Icon name="close" />
    </button>
  )
}

// Ist der Titel in seiner einen Zeile abgeschnitten (Auslassungspunkte)? Dann klappt „Mehr“ ihn auch ohne Text auf.
function useIsTruncated(ref, text) {
  const [truncated, setTruncated] = useState(false)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return undefined
    const check = () => setTruncated(element.scrollWidth > element.clientWidth + 1)
    check()
    if (typeof ResizeObserver !== 'function') return undefined
    const observer = new ResizeObserver(check)
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref, text])
  return truncated
}

// Das Band selbst (Phase N Task 5), ohne Laden und Merken - das macht HinweisBand; der Admin zeigt es als Vorschau
// (preview: eigene Beschriftung, × ohne Wirkung). hinweise: [{ id, titel, text, stufe }], mindestens einer.
// Calm-down-Runde: eine schmale Zeile (TopStrip) - Symbol, Titel in einer Zeile, „Mehr“ öffnet Titel und Text in einem
// kleinen Fenster darunter (überlagert die Seite, schiebt nichts), × blendet aus. Mehrere: Zurück/Weiter (im Kreis) und
// "1 / 3", nie von selbst. compact (TopStrip mit Demo-/Besuchs-Hinweis daneben): am Handy nur ein Symbol-Knopf, das
// Fenster trägt dann auch Blättern und ×. Angesagt wird nur ein Wechsel (Blättern, Wegklicken) - beim Laden der Seite
// bleibt der Screenreader still. Titel und Text sind reiner Text.
export default function HinweisCarousel({ hinweise, onDismiss, preview = false, compact = false }) {
  const [index, setIndex] = useState(0)
  const [open, setOpen] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const popoverId = useId()
  const rootRef = useRef(null)
  const titleRef = useRef(null)
  const openerRef = useRef(null)

  const count = hinweise.length
  const currentIndex = Math.min(index, Math.max(count - 1, 0))
  const hinweis = hinweise[currentIndex]
  const truncated = useIsTruncated(titleRef, hinweis?.titel)

  // Offenes Fenster: Escape schließt (Fokus zurück auf den Knopf), ein Klick daneben auch.
  useEffect(() => {
    if (!open) return undefined
    function handlePointerDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false)
    }
    function handleKeyDown(event) {
      if (event.key !== 'Escape') return
      setOpen(false)
      openerRef.current?.focus()
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  if (count === 0) return null
  const stufe = STUFE_WORDS[hinweis.stufe] ? hinweis.stufe : STUFE.info
  const hasText = Boolean(hinweis.text)
  const canExpand = hasText || truncated

  function toggle(event) {
    openerRef.current = event.currentTarget
    setOpen(!open)
  }

  // Blättern im Fenster selbst (compact) lässt es offen, Blättern in der Zeile klappt es zu.
  function step(delta, keepOpen = false) {
    const next = (currentIndex + delta + count) % count
    setIndex(next)
    if (!keepOpen) setOpen(false)
    setAnnouncement(`Hinweis ${next + 1} von ${count}: ${hinweise[next].titel}`)
  }

  function dismiss() {
    setOpen(false)
    setAnnouncement('Hinweis ausgeblendet.')
    onDismiss?.(hinweis.id)
  }

  const classes = ['hinweis-band', `hinweis-${stufe}`, hasText && 'has-text', open && 'is-expanded', compact && 'is-compact']
  const triggerLabel = count > 1 ? `${count} Hinweise, zuerst: ${hinweis.titel}` : `Hinweis: ${hinweis.titel}`
  return (
    <div
      ref={rootRef}
      className={classes.filter(Boolean).join(' ')}
      role="region"
      aria-label={preview ? 'Vorschau des Hinweis-Bands' : 'Hinweise'}
    >
      <div className="hinweis-band-inner">
        {compact && (
          <button
            type="button"
            className="hinweis-btn hinweis-trigger"
            aria-expanded={open}
            aria-controls={popoverId}
            aria-label={triggerLabel}
            title={hinweis.titel}
            onClick={toggle}
          >
            <Icon name={ICONS[stufe]} />
            {count > 1 && (
              <span className="hinweis-trigger-count" aria-hidden="true">
                {count}
              </span>
            )}
          </button>
        )}
        <span className="hinweis-icon" aria-hidden="true">
          <Icon name={ICONS[stufe]} />
        </span>
        <p className="hinweis-titel">
          {stufe === STUFE.info ? (
            <span className="visually-hidden">Info: </span>
          ) : (
            <span className="hinweis-stufe">{STUFE_WORDS[stufe]}</span>
          )}
          <span ref={titleRef} className="hinweis-titel-text" title={hinweis.titel}>
            {hinweis.titel}
          </span>
        </p>
        <div className="hinweis-actions">
          {canExpand && (
            <button
              type="button"
              className="hinweis-btn hinweis-more"
              aria-expanded={open}
              aria-controls={popoverId}
              onClick={toggle}
            >
              <Icon name="chevronDown" className={open ? 'is-flipped' : ''} />
              <span className="hinweis-btn-label">{open ? 'Weniger' : 'Mehr'}</span>
            </button>
          )}
          {count > 1 && <Pager index={currentIndex} count={count} onStep={(delta) => step(delta)} />}
          <DismissButton preview={preview} onClick={dismiss} />
        </div>
      </div>
      <div className="hinweis-pop" id={popoverId} hidden={!open}>
        <p className="hinweis-pop-titel">{hinweis.titel}</p>
        {hasText && <p className="hinweis-text">{hinweis.text}</p>}
        {compact && (
          <div className="hinweis-pop-actions">
            {count > 1 && <Pager index={currentIndex} count={count} onStep={(delta) => step(delta, true)} />}
            <DismissButton preview={preview} onClick={dismiss} />
          </div>
        )}
      </div>
      <p className="visually-hidden" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </div>
  )
}
