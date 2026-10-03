import { useId, useState } from 'react'
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

// Das Band selbst (Phase N Task 5), ohne Laden und Merken - das macht HinweisBand; der Admin zeigt es als Vorschau
// (preview: eigene Beschriftung, × ohne Wirkung). hinweise: [{ id, titel, text, stufe }], mindestens einer.
// Mehrere: Karussell mit Zurück/Weiter (im Kreis) und "1 / 3", nie von selbst. Angesagt wird nur ein Wechsel (Blättern,
// Wegklicken) - beim Laden der Seite bleibt der Screenreader still. Titel und Text sind reiner Text.
export default function HinweisCarousel({ hinweise, onDismiss, preview = false }) {
  const [index, setIndex] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const textId = useId()

  const count = hinweise.length
  if (count === 0) return null
  const currentIndex = Math.min(index, count - 1)
  const hinweis = hinweise[currentIndex]
  const stufe = STUFE_WORDS[hinweis.stufe] ? hinweis.stufe : STUFE.info
  const hasText = Boolean(hinweis.text)

  function step(delta) {
    const next = (currentIndex + delta + count) % count
    setIndex(next)
    setExpanded(false)
    setAnnouncement(`Hinweis ${next + 1} von ${count}: ${hinweise[next].titel}`)
  }

  function dismiss() {
    setExpanded(false)
    setAnnouncement('Hinweis ausgeblendet.')
    onDismiss?.(hinweis.id)
  }

  const classes = ['hinweis-band', `hinweis-${stufe}`, hasText && 'has-text', expanded && 'is-expanded'].filter(Boolean)
  return (
    <div className={classes.join(' ')} role="region" aria-label={preview ? 'Vorschau des Hinweis-Bands' : 'Hinweise'}>
      <div className="hinweis-band-inner">
        <span className="hinweis-icon" aria-hidden="true">
          <Icon name={ICONS[stufe]} />
        </span>
        <p className="hinweis-titel">
          {stufe === STUFE.info ? (
            <span className="visually-hidden">Info: </span>
          ) : (
            <span className="hinweis-stufe">{STUFE_WORDS[stufe]}</span>
          )}
          <span className="hinweis-titel-text">{hinweis.titel}</span>
        </p>
        <div className="hinweis-actions">
          {hasText && (
            <button
              type="button"
              className="hinweis-btn hinweis-more"
              aria-expanded={expanded}
              aria-controls={textId}
              onClick={() => setExpanded(!expanded)}
            >
              <Icon name="chevronDown" className={expanded ? 'is-flipped' : ''} />
              <span className="hinweis-btn-label">{expanded ? 'Weniger' : 'Mehr'}</span>
            </button>
          )}
          {count > 1 && <Pager index={currentIndex} count={count} onStep={step} />}
          <button
            type="button"
            className="hinweis-btn"
            aria-label="Hinweis ausblenden"
            title={preview ? 'Nur Vorschau' : 'Hinweis ausblenden'}
            disabled={preview}
            onClick={dismiss}
          >
            <Icon name="close" />
          </button>
        </div>
        {hasText && (
          <p className="hinweis-text" id={textId} hidden={!expanded}>
            {hinweis.text}
          </p>
        )}
      </div>
      <p className="visually-hidden" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </div>
  )
}
