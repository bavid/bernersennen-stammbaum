import { useEffect } from 'react'
import Icon from './Icon.jsx'
import Modal from './Modal.jsx'
import { formatDateLong } from '../lib/dates.js'
import { t } from '../lib/i18n/index.js'

// Alternativtext eines Einblicks: sein Text, sonst "Einblick vom <Datum>" (Raster und große Ansicht).
export function einblickAlt(einblick) {
  const text = typeof einblick.text === 'string' ? einblick.text.trim() : ''
  return text || t('Einblick vom {datum}', { datum: formatDateLong(einblick.datum) })
}

// Große Ansicht eines Einblicks (EinblickeGallery) im gemeinsamen Modal (natives <dialog>: Fokusfalle,
// ESC und Hintergrund-Klick kommen vom Browser). Dazu Vor/Zurück per Knopf und Pfeiltasten - am Ende geht
// es wieder von vorn los, damit nie ein Knopf mitsamt Fokus deaktiviert wird. index: null = geschlossen.
export default function EinblickViewer({ items, index, onIndexChange, onClose }) {
  const count = items.length
  const isOpen = index !== null && index >= 0 && index < count
  const current = isOpen ? items[index] : null

  // Pfeiltasten am Fenster, damit sie unabhängig davon wirken, welcher Knopf im Dialog gerade den Fokus hat.
  // ESC schließt der Browser über das cancel-Ereignis des Dialogs (Modal) - hier zusätzlich, weil nicht jede
  // Umgebung es auslöst; ein doppeltes Schließen ist folgenlos.
  useEffect(() => {
    if (!isOpen) return undefined
    function handleKey(event) {
      if (event.key === 'ArrowRight' && count > 1) {
        event.preventDefault()
        onIndexChange((index + 1) % count)
      } else if (event.key === 'ArrowLeft' && count > 1) {
        event.preventDefault()
        onIndexChange((index - 1 + count) % count)
      } else if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen, index, count, onIndexChange, onClose])

  const dateLabel = current ? formatDateLong(current.datum) : ''

  return (
    <Modal open={isOpen} title={current ? t('Einblick vom {datum}', { datum: dateLabel }) : ''} onClose={onClose}>
      {current && (
        <div className="einblick-viewer">
          <img src={current.fotoUrl} alt={einblickAlt(current)} className="einblick-viewer-photo" />
          {current.text && <p className="einblick-viewer-text">{current.text}</p>}
          {count > 1 && (
            <div className="einblick-viewer-nav">
              <button type="button" className="btn btn-ghost" onClick={() => onIndexChange((index - 1 + count) % count)}>
                <Icon name="arrowLeft" />
                {t('Vorheriger')}
              </button>
              <span className="einblick-viewer-count" aria-live="polite">
                {t('{n} von {total}', { n: index + 1, total: count })}
              </span>
              <button type="button" className="btn btn-ghost" onClick={() => onIndexChange((index + 1) % count)}>
                {t('Nächster')}
                <Icon name="arrowRight" />
              </button>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
