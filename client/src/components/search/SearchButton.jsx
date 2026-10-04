import { useCallback, useEffect, useRef, useState } from 'react'
import Icon from '../Icon.jsx'
import Modal from '../Modal.jsx'
import SearchPanel from './SearchPanel.jsx'
import useSearchShortcut from '../../hooks/useSearchShortcut.js'
import '../../styles/search.css'

// Lupe im Kopf (App.jsx AppHeader; am Desktop neben dem Konto-Menü, am Handy oben rechts) und Strg/⌘+K: öffnet die Suche
// als ruhigen Dialog (Modal). Beim Schließen geht der Fokus dorthin zurück, wo er vorher war - sonst an die Lupe.
export default function SearchButton({ family, onInvite }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef(null)
  const returnFocus = useRef(null)
  const restoreFocus = useRef(false)

  const openSearch = useCallback(() => {
    const current = document.activeElement
    returnFocus.current = current instanceof HTMLElement && current !== document.body ? current : null
    setOpen(true)
  }, [])

  const close = useCallback(() => {
    restoreFocus.current = true
    setOpen(false)
  }, [])

  useSearchShortcut(openSearch)

  // Nach dem Schließen (das Modal hat seinen <dialog> in seinem eigenen Effekt schon geschlossen - Kinder zuerst).
  useEffect(() => {
    if (open || !restoreFocus.current) return
    restoreFocus.current = false
    const target = returnFocus.current?.isConnected ? returnFocus.current : triggerRef.current
    target?.focus()
  }, [open])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="search-trigger"
        aria-label="Suchen"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-keyshortcuts="Control+K Meta+K"
        title="Suchen (Strg + K)"
        onClick={openSearch}
      >
        <Icon name="search" />
      </button>
      <Modal open={open} title="Suchen" onClose={close} className="modal-search">
        <SearchPanel family={family} onClose={close} onInvite={onInvite} />
      </Modal>
    </>
  )
}
