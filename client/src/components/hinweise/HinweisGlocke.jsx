import { useEffect, useId, useRef, useState } from 'react'
import Icon from '../Icon.jsx'
import Modal from '../Modal.jsx'
import HinweisPanel from './HinweisPanel.jsx'
import { useGlocke } from './HinweiseProvider.jsx'
import useMediaQuery from '../../hooks/useMediaQuery.js'
import { badgeText, bellLabel, startLineText } from '../../lib/glocke.js'
import '../../styles/glocke.css'
import { t } from '../../lib/i18n/index.js'

// Am Handy (wie layout.css) kommt das Fenster als Blatt von unten, am Desktop klappt es unter der Glocke auf.
const NARROW_QUERY = '(max-width: 720px)'
// Wer das Fenster öffnen kann (Glocke, Zeile auf Start): ein Klick darauf schließt es nicht als „Klick daneben“.
const OPENER_SELECTOR = '[data-hinweise-opener]'

// Desktop: ein Fenster (role="dialog", nicht modal) unter der Glocke. Beim Öffnen bekommt es den Fokus; Escape (überall auf
// der Seite, solange es offen ist) und ein Klick daneben schließen es.
function Popover({ id, onClose, children }) {
  const panelRef = useRef(null)
  const onCloseRef = useRef(onClose)
  const headingId = useId()

  useEffect(() => {
    onCloseRef.current = onClose
  })

  // Nur beim Öffnen - nicht bei jedem neuen Rendern (sonst spränge der Fokus aus der Liste zurück aufs Fenster).
  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true })
    function handlePointerDown(event) {
      if (panelRef.current?.contains(event.target) || event.target.closest?.(OPENER_SELECTOR)) return
      onCloseRef.current()
    }
    function handleKeyDown(event) {
      // Escape in einem Dialog darin (z. B. „Kontaktwunsch annehmen“) schließt nur diesen Dialog.
      if (event.key !== 'Escape' || event.target.closest?.('dialog[open]')) return
      event.preventDefault()
      onCloseRef.current()
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  return (
    <div id={id} ref={panelRef} className="hinweis-popover" role="dialog" aria-labelledby={headingId} tabIndex={-1}>
      <div className="hinweis-popover-head">
        <h2 id={headingId}>{t('Hinweise')}</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label={t('Schließen')}>
          <Icon name="close" />
        </button>
      </div>
      <div className="hinweis-popover-body">{children}</div>
    </div>
  )
}

// Glocke im Kopf (App.jsx AppHeader, neben der Lupe) für Haushalte: Badge mit der Zahl offener Hinweise, das Fenster mit
// der Liste (HinweisPanel). Kommen neue Hinweise dazu (die Zahl steigt), sagt es eine höfliche Live-Region einmal an - nicht
// bei jedem Nachfragen. Beim Schließen geht der Fokus dorthin zurück, wo das Fenster geöffnet wurde (sonst an die Glocke) -
// nicht, wenn ein Link darin auf eine andere Seite führt.
export default function HinweisGlocke() {
  const glocke = useGlocke()
  const narrow = useMediaQuery(NARROW_QUERY)
  const panelId = useId()
  const bellRef = useRef(null)
  const wasOpen = useRef(false)
  const previousTotal = useRef(glocke?.total ?? 0)
  const [announcement, setAnnouncement] = useState('')
  const total = glocke?.total ?? 0
  const open = Boolean(glocke?.open)
  const opener = glocke?.opener
  const restoreFocus = glocke?.restoreFocus

  useEffect(() => {
    if (total > previousTotal.current) setAnnouncement(startLineText(total))
    else if (total < previousTotal.current) setAnnouncement('')
    previousTotal.current = total
  }, [total])

  // Nach dem Schließen (das Modal hat seinen <dialog> in seinem eigenen Effekt schon geschlossen - Kinder zuerst).
  useEffect(() => {
    if (wasOpen.current && !open && restoreFocus?.current !== false) {
      const target = opener?.current?.isConnected ? opener.current : bellRef.current
      target?.focus()
    }
    wasOpen.current = open
  }, [open, opener, restoreFocus])

  if (!glocke?.enabled) return null
  const { openPanel, closePanel } = glocke
  const close = () => closePanel()
  const panel = <HinweisPanel glocke={glocke} onNavigate={() => closePanel({ restoreFocus: false })} />

  return (
    <div className="hinweis-glocke">
      <button
        ref={bellRef}
        type="button"
        className="hinweis-glocke-knopf"
        data-hinweise-opener=""
        aria-label={bellLabel(total)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open && !narrow ? panelId : undefined}
        title={t('Hinweise')}
        onClick={(event) => (open ? close() : openPanel(event))}
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
        <Modal open={open} title={t('Hinweise')} onClose={close} className="modal-sheet modal-hinweise">
          {open && panel}
        </Modal>
      ) : (
        open && (
          <Popover id={panelId} onClose={close}>
            {panel}
          </Popover>
        )
      )}
    </div>
  )
}
