import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CHAPTER_TITLES, nextChapter, overlayPath, placePopover } from '../../lib/tour.js'
import { useT } from '../../lib/i18n/index.js'

const viewportOf = () => ({ width: window.innerWidth, height: window.innerHeight })

function useViewport() {
  const [viewport, setViewport] = useState(viewportOf)
  useEffect(() => {
    const onResize = () => setViewport(viewportOf())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return viewport
}

// Ein Kapitel als Knopf: Titel und darunter, was drinsteckt. Gezeigte Kapitel tragen ✓ und treten zurück.
function ChapterButton({ chapter, isDone, isNext, onPick, buttonRef }) {
  const t = useT()
  const title = t(CHAPTER_TITLES[chapter.key])
  return (
    <li>
      <button
        ref={buttonRef}
        type="button"
        className={`tour-choice-btn${isNext ? ' is-next' : ''}${isDone ? ' is-done' : ''}`}
        aria-label={isDone ? t('{title} (schon gesehen)', { title }) : undefined}
        onClick={() => onPick(chapter.key)}
      >
        <span className="tour-choice-title">
          {isDone && <span aria-hidden="true">✓ </span>}
          {title}
        </span>
        {chapter.hint && <span className="tour-choice-hint">{t(chapter.hint)}</span>}
      </button>
    </li>
  )
}

// Nach einem Kapitel: „Wie geht’s weiter?“ - die übrigen Kapitel als ruhige Auswahl, das nächste in fester Reihenfolge
// hervorgehoben (und fokussiert), dazu „Fertig“. Am Handy ein Blatt unten, breit in der Mitte. Escape beendet (TourProvider).
export default function TourChoice({ chapters, done, onPick, onEnd }) {
  const t = useT()
  const titleId = useId()
  const viewport = useViewport()
  const defaultRef = useRef(null)
  const choices = chapters.slice(1)
  const next = nextChapter(choices, done)
  const place = placePopover(null, viewport)

  useEffect(() => {
    defaultRef.current?.focus({ preventScroll: true })
  }, [])

  const placeClass = place.mode === 'sheet' ? `tour-pop-sheet tour-pop-${place.edge}` : `tour-pop-${place.mode}`
  return createPortal(
    <div className="tour-layer">
      <svg className="tour-dim" width={viewport.width} height={viewport.height} aria-hidden="true">
        <path d={overlayPath(viewport, null)} />
      </svg>
      <section className={`tour-pop tour-choice ${placeClass}`} role="dialog" aria-modal="false" aria-labelledby={titleId}>
        <h2 id={titleId} className="tour-title">
          {t('Wie geht’s weiter?')}
        </h2>
        <p className="tour-text">
          {next ? t('Was möchtet ihr als Nächstes sehen?') : t('Ihr habt alles gesehen – schön, dass ihr dabei seid.')}
        </p>
        <ul className="tour-choice-list">
          {choices.map((chapter) => (
            <ChapterButton
              key={chapter.key}
              chapter={chapter}
              isDone={done.includes(chapter.key)}
              isNext={chapter === next}
              onPick={onPick}
              buttonRef={chapter === next ? defaultRef : undefined}
            />
          ))}
        </ul>
        <div className="tour-actions">
          {/* Button (ui) reicht keinen ref durch - hier ein schlichter Knopf mit denselben Klassen. */}
          <button ref={next ? undefined : defaultRef} type="button" className={`btn ${next ? 'btn-ghost' : 'btn-primary'} btn-compact`} onClick={onEnd}>
            {t('Fertig')}
          </button>
        </div>
      </section>
    </div>,
    document.body
  )
}
