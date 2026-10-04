import { useEffect, useRef } from 'react'

const TYPING_SELECTOR = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])'

// Tippt jemand gerade in ein Feld? Dann gehört Strg+K dem Feld (z. B. "Link einfügen" in manchen Editoren), nicht der Suche.
export function isTypingTarget(target) {
  return Boolean(target?.isContentEditable || target?.closest?.(TYPING_SELECTOR))
}

export function isSearchShortcut(event) {
  return (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && String(event.key).toLowerCase() === 'k'
}

// Strg+K (am Mac ⌘+K) öffnet die Suche - der EINE Tasten-Listener dafür, gebunden an den Suchknopf im Kopf
// (components/search/SearchButton.jsx), solange der steht. Nicht in Feldern und nicht über einem anderen offenen Dialog.
export default function useSearchShortcut(onOpen) {
  const handler = useRef(onOpen)

  useEffect(() => {
    handler.current = onOpen
  }, [onOpen])

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.defaultPrevented || event.repeat || !isSearchShortcut(event) || isTypingTarget(event.target)) return
      if (document.querySelector('dialog[open]')) return
      event.preventDefault()
      handler.current()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])
}
