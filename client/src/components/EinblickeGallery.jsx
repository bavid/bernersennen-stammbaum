import { useCallback, useEffect, useRef, useState } from 'react'
import EinblickViewer, { einblickAlt } from './EinblickViewer.jsx'
import PortalSection from './PortalSection.jsx'
import { formatDateLong } from '../lib/dates.js'
import { isAllowedMedia } from '../lib/discover.js'
import { useIsPreview } from '../lib/preview.js'

// Feste Maße im Seitenverhältnis 4:3 (CSS aspect-ratio) - der Platz steht schon vor dem Laden fest.
const TILE_WIDTH = 400
const TILE_HEIGHT = 300

// Sektion "Einblicke" auf dem Portal (/p/:slug, Phase P1): Fotos mit Datum und Text, neueste zuerst (so
// liefert sie der Server). Ein Klick öffnet die große Ansicht (EinblickViewer); nach dem Schließen kehrt
// der Fokus zum angeklickten Foto zurück. Nur öffentliche Fotos (/public-media), in der Kundensicht auch
// die eigenen über /uploads - alles andere wird nicht angezeigt.
export default function EinblickeGallery({ einblicke }) {
  const preview = useIsPreview()
  const [openIndex, setOpenIndex] = useState(null)
  const lastTrigger = useRef(null)
  const wasOpen = useRef(false)
  const items = (Array.isArray(einblicke) ? einblicke : []).filter(
    (einblick) => einblick && typeof einblick === 'object' && isAllowedMedia(einblick.fotoUrl, { preview })
  )

  // Fokus zurück, sobald der Dialog zu ist (Effekte der Kinder - Modal schließt den <dialog> - laufen zuerst).
  useEffect(() => {
    if (openIndex !== null) {
      wasOpen.current = true
      return
    }
    if (wasOpen.current) {
      wasOpen.current = false
      lastTrigger.current?.focus()
    }
  }, [openIndex])

  const handleClose = useCallback(() => setOpenIndex(null), [])

  if (items.length === 0) return null

  function handleOpen(index, trigger) {
    lastTrigger.current = trigger
    setOpenIndex(index)
  }

  return (
    <PortalSection id="portal-einblicke" title="Einblicke" className="partner-portal-einblicke">
      <ul className="einblicke-gallery">
        {items.map((einblick, index) => (
          <li key={einblick.id ?? `${einblick.fotoUrl}-${index}`}>
            <figure className="einblick-tile">
              <button
                type="button"
                className="einblick-tile-open"
                aria-haspopup="dialog"
                onClick={(event) => handleOpen(index, event.currentTarget)}
              >
                <img src={einblick.fotoUrl} alt={einblickAlt(einblick)} width={TILE_WIDTH} height={TILE_HEIGHT} loading="lazy" />
              </button>
              <figcaption>
                <time dateTime={einblick.datum}>{formatDateLong(einblick.datum)}</time>
                {einblick.text && <p className="einblick-tile-text">{einblick.text}</p>}
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
      <EinblickViewer items={items} index={openIndex} onIndexChange={setOpenIndex} onClose={handleClose} />
    </PortalSection>
  )
}
