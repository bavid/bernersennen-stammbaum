import { useCallback, useEffect, useRef, useState } from 'react'

const MENU_ITEM_SELECTOR = '[role="menuitem"]'

// Nächster Menüpunkt für eine Taste: Pfeile wandern (am Ende wieder vorn), Pos1/Ende springen; null für andere Tasten.
function targetIndex(key, index, count) {
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  if (key === 'ArrowDown') return (index + 1 + count) % count
  if (key === 'ArrowUp') return (index - 1 + count) % count
  return null
}

// Ausklappmenü nach dem Muster "Menu Button" (WAI-ARIA APG): ein Knopf (triggerRef, aria-haspopup/aria-expanded) öffnet
// eine Liste mit role="menuitem"-Einträgen unter rootRef. Beim Öffnen bekommt der erste Eintrag (firstItemRef) den Fokus;
// Pfeile, Pos1 und Ende wandern; Escape schließt und gibt den Fokus an den Knopf zurück; Tab schließt nur und lässt den
// Fokus wie gewohnt weiterziehen; ein Klick außerhalb schließt. Pfeil runter/hoch auf dem Knopf öffnet das Menü.
// Für das Konto-Menü (AccountMenu); der nicht mehr eingebundene Bereichswechsler (ContextSwitcher) nutzt es bis Schritt 5.
export default function useMenu() {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const firstItemRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    function handlePointerDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open])

  useEffect(() => {
    if (open) firstItemRef.current?.focus()
  }, [open])

  // Schließen und den Fokus zurück an den Knopf - sonst fiele er mit dem verschwundenen Menü auf <body>.
  const close = useCallback(() => {
    setOpen(false)
    triggerRef.current?.focus()
  }, [])

  const toggle = useCallback(() => setOpen((value) => !value), [])

  function onMenuKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return
    }
    if (event.key === 'Tab') {
      setOpen(false)
      return
    }
    const items = [...(rootRef.current?.querySelectorAll(MENU_ITEM_SELECTOR) || [])]
    const next = items.length > 0 ? targetIndex(event.key, items.indexOf(document.activeElement), items.length) : null
    if (next === null) return
    event.preventDefault()
    items[next]?.focus()
  }

  function onTriggerKeyDown(event) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    setOpen(true)
  }

  return { open, setOpen, toggle, close, rootRef, triggerRef, firstItemRef, onMenuKeyDown, onTriggerKeyDown }
}
