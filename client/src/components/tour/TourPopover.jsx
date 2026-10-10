import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '../ui/index.js'
import { CHAPTER_TITLES, overlayPath, placePopover, spotRect } from '../../lib/tour.js'
import { useT } from '../../lib/i18n/index.js'

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
const viewportOf = () => ({ width: window.innerWidth, height: window.innerHeight })

// Lage des Ziels - bei Scrollen und Größenänderung neu (je Bild höchstens einmal).
function useTargetRect(target) {
  const [rect, setRect] = useState(null)
  const [viewport, setViewport] = useState(viewportOf)
  useEffect(() => {
    let frame = 0
    const measure = () => {
      frame = 0
      setViewport(viewportOf())
      setRect(target ? target.getBoundingClientRect() : null)
    }
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure)
    }
    target?.scrollIntoView?.({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' })
    measure()
    window.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule)
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
    }
  }, [target])
  return { rect, viewport }
}

function popoverStyle(place) {
  return place.mode === 'float' ? { top: `${place.top}px`, left: `${place.left}px` } : undefined
}

function Actions({ step, index, total, asking, onBack, onNext, onAsk }) {
  const t = useT()
  const last = index === total - 1
  return (
    <div className="tour-actions">
      <Button variant="ghost" size="sm" onClick={onBack} disabled={index === 0}>
        {t('Zurück')}
      </Button>
      {asking && (
        <Button variant="ghost" size="sm" onClick={onAsk}>
          {t(step.ask.action)}
        </Button>
      )}
      <Button size="sm" onClick={onNext} data-tour-next="">
        {last ? t('Fertig') : t('Weiter')}
      </Button>
    </div>
  )
}

// Lichtkegel und Sprechblase eines Schritts: abgedunkelte Fläche mit abgerundetem Ausschnitt um das Ziel (sperrt die
// App nicht - pointer-events: none), daneben bzw. am Handy als Blatt die Sprechblase. Der Fokus geht bei jedem Schritt
// in die Sprechblase; Pfeiltasten blättern, Escape beendet (TourProvider).
export default function TourPopover({ step, index, total, target, asking, isDemo, canAct, onBack, onNext, onEnd, onAsk }) {
  const t = useT()
  const titleId = useId()
  const textId = useId()
  const ref = useRef(null)
  const [height, setHeight] = useState(220)
  const { rect, viewport } = useTargetRect(target)
  const spot = rect ? spotRect(rect) : null
  const place = placePopover(rect, viewport, height)
  const title = asking ? step.ask.title : step.title
  const text = asking ? step.ask.text : step.text

  useLayoutEffect(() => {
    if (ref.current?.offsetHeight) setHeight(ref.current.offsetHeight)
  }, [index, asking])

  useEffect(() => {
    ref.current?.focus({ preventScroll: true })
  }, [index])

  function handleKeyDown(event) {
    if (event.key === 'ArrowRight') onNext()
    if (event.key === 'ArrowLeft' && index > 0) onBack()
  }

  const placeClass = place.mode === 'sheet' ? `tour-pop-sheet tour-pop-${place.edge}` : `tour-pop-${place.mode}`
  return createPortal(
    <div className="tour-layer">
      <svg className="tour-dim" width={viewport.width} height={viewport.height} aria-hidden="true">
        <path d={overlayPath(viewport, spot)} fillRule="evenodd" />
        {spot && <rect className="tour-ring" x={spot.x} y={spot.y} width={spot.width} height={spot.height} rx="14" />}
      </svg>
      <section
        ref={ref}
        className={`tour-pop ${placeClass}`}
        style={popoverStyle(place)}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        aria-describedby={textId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <p className="tour-kicker">
          {t(CHAPTER_TITLES[step.chapter])} · {t('Schritt {n} von {total}', { n: index + 1, total })}
        </p>
        <h2 id={titleId} className="tour-title">
          {t(title)}
        </h2>
        <p id={textId} className="tour-text">
          {t(text)}
        </p>
        {isDemo && index === 0 && <p className="tour-note">{t('In der Demo dürft ihr alles ansehen und ausprobieren – gespeichert wird nichts.')}</p>}
        <Actions step={step} index={index} total={total} asking={asking && canAct} onBack={onBack} onNext={onNext} onAsk={onAsk} />
        <button type="button" className="link-button tour-end" onClick={onEnd}>
          {t('Beenden')}
        </button>
      </section>
    </div>,
    document.body
  )
}
