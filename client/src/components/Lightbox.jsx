import { useCallback, useEffect, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import useSwipe from '../hooks/useSwipe.js'
import { t } from '../lib/i18n/index.js'

// Ein Foto groß. Mit photos (z. B. alle Fotos einer Erinnerung) lässt sich darin blättern: wischen, Pfeiltasten oder
// die Knöpfe links/rechts; an den Enden geht es nicht weiter. Antippen oder Escape schließt.
export default function Lightbox({ src, photos, onClose }) {
  if (!src) return null
  // key: ein neues src von außen beginnt wieder bei diesem Foto.
  return <LightboxView key={src} src={src} photos={photos} onClose={onClose} />
}

function LightboxView({ src, photos, onClose }) {
  const gallery = photos?.includes(src) ? photos : [src]
  const [index, setIndex] = useState(() => gallery.indexOf(src))
  const imageRef = useRef(null)
  const closeRef = useRef(null)
  const count = gallery.length
  // Wird die Liste kürzer (Foto gelöscht, während die Lightbox offen ist), bleibt die Stelle gültig.
  const position = Math.min(index, count - 1)
  const current = gallery[position]
  const prevUrl = gallery[position - 1]
  const nextUrl = gallery[position + 1]

  const go = useCallback(
    (step) => setIndex((value) => Math.min(count - 1, Math.max(0, Math.min(value, count - 1) + step))),
    [count]
  )

  // Fokus in die Lightbox (auf „Schließen“) und beim Schließen zurück zum Foto, das sie geöffnet hat.
  useEffect(() => {
    const opener = document.activeElement
    closeRef.current?.focus({ preventScroll: true })
    return () => opener?.focus?.({ preventScroll: true })
  }, [])

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      // Mit Alt/Strg/Cmd sind die Pfeile Browser-Befehle (z. B. Alt+← = zurück).
      if (event.altKey || event.ctrlKey || event.metaKey) return
      if (event.key === 'ArrowLeft') go(-1)
      if (event.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, go])

  // Nachbarfotos vorladen, damit das nächste Wischen nicht auf das Bild warten muss.
  useEffect(() => {
    for (const url of [prevUrl, nextUrl]) {
      if (url) new Image().src = url
    }
  }, [prevUrl, nextUrl])

  const swipe = useSwipe({
    onSwipeLeft: () => go(1),
    onSwipeRight: () => go(-1),
    // Direkt am DOM statt über State: das Foto folgt dem Finger, ohne bei jeder Bewegung neu zu zeichnen.
    onDrag: (dx) => moveImage(imageRef.current, count > 1 ? dx : 0, false),
    // Wischen zu einem Nachbarfoto: sofort zurücksetzen, sonst käme es von der falschen Seite. Sonst (angetippt,
    // abgebrochen oder am Ende der Fotos) sichtbar zurückgleiten - so merkt man, dass es nicht weitergeht.
    onRelease: (swiped, dx) => {
      const switches = swiped && Boolean(dx < 0 ? nextUrl : prevUrl)
      moveImage(imageRef.current, 0, !switches)
    },
  })

  // Tab bleibt in der Lightbox (aria-modal): vom letzten Knopf zurück zum ersten und umgekehrt.
  function trapFocus(event) {
    if (event.key !== 'Tab') return
    const buttons = [...event.currentTarget.querySelectorAll('button')]
    const edge = event.shiftKey ? buttons[0] : buttons.at(-1)
    if (document.activeElement !== edge) return
    event.preventDefault()
    ;(event.shiftKey ? buttons.at(-1) : buttons[0]).focus()
  }

  const step = (delta) => (event) => {
    event.stopPropagation()
    go(delta)
  }

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={t('Foto')} onClick={onClose} onKeyDown={trapFocus} {...swipe}>
      <img ref={imageRef} src={current} alt="" draggable="false" />
      <button ref={closeRef} type="button" className="icon-btn" aria-label={t('Schließen')} onClick={onClose}>
        <Icon name="close" />
      </button>
      {prevUrl && (
        <button type="button" className="lightbox-nav lightbox-prev" aria-label={t('Vorheriges Foto')} onClick={step(-1)}>
          <Icon name="chevronLeft" />
        </button>
      )}
      {nextUrl && (
        <button type="button" className="lightbox-nav lightbox-next" aria-label={t('Nächstes Foto')} onClick={step(1)}>
          <Icon name="chevronRight" />
        </button>
      )}
      {count > 1 && (
        <p className="lightbox-count" aria-live="polite">
          <span aria-hidden="true">
            {position + 1} / {count}
          </span>
          <span className="visually-hidden">{t('Foto {i} von {n}', { i: position + 1, n: count })}</span>
        </p>
      )}
    </div>
  )
}

// Verschiebt das Foto waagerecht; animate = mit der CSS-Übergangszeit (lightbox.css), sonst sofort.
function moveImage(image, dx, animate) {
  if (!image) return
  image.style.transition = animate ? '' : 'none'
  image.style.transform = dx ? `translateX(${dx}px)` : ''
}
