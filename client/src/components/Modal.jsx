import { useEffect, useRef } from 'react'
import Icon from './Icon.jsx'

// Natives <dialog>: Fokusfalle, ESC und Backdrop gibt es vom Browser gratis. className (Phase W): zusätzliche Klasse,
// z. B. "modal-sheet" für das Menü-Blatt von unten am Handy. Ein Feld mit data-autofocus bekommt beim Öffnen den Fokus.
export default function Modal({ open, title, onClose, children, className = '' }) {
  const ref = useRef(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      // React setzt autoFocus beim Einfügen - da ist der Dialog noch zu. Ein Feld mit data-autofocus bekommt den Fokus
      // deshalb hier, sobald der Dialog offen ist (sonst landet er auf „Schließen“).
      dialog.querySelector('[data-autofocus]')?.focus()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  function handleBackdropClick(event) {
    if (event.target === ref.current) onClose()
  }

  return (
    <dialog
      ref={ref}
      className={`modal ${className}`.trim()}
      aria-labelledby="modal-title"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={handleBackdropClick}
    >
      {open && (
        <>
          <div className="modal-header">
            <h2 id="modal-title">{title}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Schließen">
              <Icon name="close" />
            </button>
          </div>
          <div className="modal-body">{children}</div>
        </>
      )}
    </dialog>
  )
}
