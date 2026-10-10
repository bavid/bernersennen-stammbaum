import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '../ui/index.js'
import Icon from '../Icon.jsx'
import { CHAPTER_TITLES, TOUR_SCOPE } from '../../lib/tour.js'
import { useT } from '../../lib/i18n/index.js'

// Kapitel-Sprünge („Oder direkt zu: …“) - hinter dem ersten, das „Kurz das Wichtigste“ schon abdeckt.
export function ChapterLinks({ chapters, onStart, skipFirst = true }) {
  const t = useT()
  const shown = skipFirst ? chapters.slice(1) : chapters
  if (shown.length === 0) return null
  return (
    <p className="tour-chapters">
      {t('Oder direkt zu:')}{' '}
      {shown.map((chapter, index) => (
        <span key={chapter.key}>
          {index > 0 && <span aria-hidden="true"> · </span>}
          <button type="button" className="link-button" onClick={() => onStart({ scope: TOUR_SCOPE.kurz, chapterKey: chapter.key })}>
            {t(CHAPTER_TITLES[chapter.key])}
          </button>
        </span>
      ))}
    </p>
  )
}

// Die Frage nach dem Rundgang: ruhiges Blatt unten (am Handy über der Leiste), nicht modal - die App bleibt bedienbar.
// Ein Tipp auf „Schließen“ (oder Escape) genügt; „Nicht mehr zeigen“ fragt nie wieder.
export default function TourPrompt({ chapters, isDemo, onStart, onClose, onNever }) {
  const t = useT()
  const titleId = useId()
  const ref = useRef(null)

  useEffect(() => {
    ref.current?.focus({ preventScroll: true })
  }, [])

  function handleKeyDown(event) {
    if (event.key === 'Escape') onClose()
  }

  return createPortal(
    <section ref={ref} className="tour-prompt" role="dialog" aria-modal="false" aria-labelledby={titleId} tabIndex={-1} onKeyDown={handleKeyDown}>
      <button type="button" className="icon-btn tour-prompt-close" onClick={onClose} aria-label={t('Schließen')}>
        <Icon name="close" />
      </button>
      <h2 id={titleId} className="tour-title">
        {t('Möchtet ihr einen kurzen Rundgang?')}
      </h2>
      <p className="tour-text">
        {isDemo
          ? t('Wir zeigen euch in 2 Minuten, was hier geht – Schritt für Schritt, direkt in der Demo.')
          : t('Wir zeigen euch in 2 Minuten, wo was ist – Schritt für Schritt.')}
      </p>
      <div className="tour-actions tour-prompt-actions">
        <Button onClick={() => onStart({ scope: TOUR_SCOPE.kurz })}>{t('Kurz das Wichtigste')}</Button>
        <Button variant="ghost" onClick={() => onStart({ scope: TOUR_SCOPE.alles })}>
          {t('Alles zeigen')}
        </Button>
      </div>
      <ChapterLinks chapters={chapters} onStart={onStart} />
      <p className="tour-prompt-foot">
        <button type="button" className="link-button" onClick={onClose}>
          {t('Schließen')}
        </button>
        <span aria-hidden="true"> · </span>
        <button type="button" className="link-button" onClick={onNever}>
          {t('Nicht mehr zeigen')}
        </button>
      </p>
    </section>,
    document.body
  )
}
