import { useEffect, useId, useRef, useState } from 'react'
import Icon from '../Icon.jsx'
import Modal from '../Modal.jsx'
import HinweisPanel from './HinweisPanel.jsx'
import { useGlocke } from './HinweiseProvider.jsx'
import useMediaQuery from '../../hooks/useMediaQuery.js'
import { badgeText, bellLabel, startLineText } from '../../lib/glocke.js'
import '../../styles/glocke.css'

// Am Handy (wie layout.css) kommt das Fenster als Blatt von unten, am Desktop klappt es unter der Glocke auf.
const NARROW_QUERY = '(max-width: 720px)'

// Desktop: ein Fenster (role="dialog", nicht modal) unter der Glocke. Beim Öffnen bekommt es den Fokus, Escape und ein
// Klick daneben schließen es.
function Popover({ id, rootRef, onClose, children }) {
  const panelRef = useRef(null)
  const headingId = useId()

  useEffect(() => {
    panelRef.current?.focus()
    function handlePointerDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) onClose()
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [rootRef, onClose])

  function handleKeyDown(event) {
    if (event.key !== 'Escape') return
    event.preventDefault()
    onClose()
  }

  return (
    <div id={id} ref={panelRef} className="hinweis-popover" role="dialog" aria-labelledby={headingId} tabIndex={-1} onKeyDown={handleKeyDown}>
      <div className="hinweis-popover-head">
        <h2 id={headingId}>Hinweise</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Schließen">
          <Icon name="close" />
        </button>
      </div>
      <div className="hinweis-popover-body">{children}</div>
    </div>
  )
}

// Glocke im Kopf (App.jsx AppHeader, neben der Lupe) für Haushalte: Badge mit der Zahl offener Hinweise, das Fenster mit
// der Liste (HinweisPanel). Kommen neue Hinweise dazu (die Zahl steigt), sagt es eine höfliche Live-Region einmal an - nicht
// bei jedem Nachfragen. Beim Schließen geht der Fokus dorthin zurück, wo das Fenster geöffnet wurde (sonst an die Glocke).
export default function HinweisGlocke() {
  const glocke = useGlocke()
  const narrow = useMediaQuery(NARROW_QUERY)
  const panelId = useId()
  const rootRef = useRef(null)
  const bellRef = useRef(null)
  const wasOpen = useRef(false)
  const previousTotal = useRef(glocke?.total ?? 0)
  const [announcement, setAnnouncement] = useState('')
  const total = glocke?.total ?? 0
  const open = Boolean(glocke?.open)
  const opener = glocke?.opener

  useEffect(() => {
    if (total > previousTotal.current) setAnnouncement(startLineText(total))
    previousTotal.current = total
  }, [total])

  // Nach dem Schließen (das Modal hat seinen <dialog> in seinem eigenen Effekt schon geschlossen - Kinder zuerst).
  useEffect(() => {
    if (wasOpen.current && !open) {
      const target = opener?.current?.isConnected ? opener.current : bellRef.current
      target?.focus()
    }
    wasOpen.current = open
  }, [open, opener])

  if (!glocke?.enabled) return null
  const { openPanel, closePanel } = glocke
  const panel = <HinweisPanel glocke={glocke} onClose={closePanel} />

  return (
    <div className="hinweis-glocke" ref={rootRef}>
      <button
        ref={bellRef}
        type="button"
        className="hinweis-glocke-knopf"
        aria-label={bellLabel(total)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open && !narrow ? panelId : undefined}
        title="Hinweise"
        onClick={open ? closePanel : openPanel}
      >
        <Icon name="bell" />
        {total > 0 && (
          <span className="hinweis-glocke-badge" aria-hidden="true">
            {badgeText(total)}
          </span>
        )}
      </button>
      <span className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </span>
      {narrow ? (
        <Modal open={open} title="Hinweise" onClose={closePanel} className="modal-sheet modal-hinweise">
          {open && panel}
        </Modal>
      ) : (
        open && (
          <Popover id={panelId} rootRef={rootRef} onClose={closePanel}>
            {panel}
          </Popover>
        )
      )}
    </div>
  )
}
