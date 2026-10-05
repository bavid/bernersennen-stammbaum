import { useCallback, useEffect, useRef, useState } from 'react'

// Audit W: lange Listen zeigen zuerst nur `visible` Einträge, der Rest steht hinter einem Knopf „Weitere … (n)“ bzw. „Alle n …“
// (wie Start und Gruppenseite, ActivityFeed). items: die ganze Liste; visible: wie viele zuerst; fromEnd: die LETZTEN zeigen
// (Antworten eines Gesprächs - die neuesten sind die wichtigen). Rückgabe: shown (die sichtbaren), hidden (wie viele fehlen,
// 0 wenn alles offen), expanded, expand() - und focusRef: ein Ref für die Liste, nach dem Aufklappen bekommt das erste neu
// sichtbare fokussierbare Kind (`[tabindex], a, button` im Element Nummer `visible`) den Fokus, damit der verschwundene Knopf
// den Fokus nicht an <body> verliert.
export default function useShowMore(items, visible, { fromEnd = false } = {}) {
  const [expanded, setExpanded] = useState(false)
  const pending = useRef(false)
  const focusRef = useRef(null)
  const list = items ?? []
  const hidden = expanded ? 0 : Math.max(0, list.length - visible)
  const shown = hidden > 0 ? (fromEnd ? list.slice(list.length - visible) : list.slice(0, visible)) : list

  const expand = useCallback(() => {
    pending.current = true
    setExpanded(true)
  }, [])

  useEffect(() => {
    if (!expanded || !pending.current) return
    pending.current = false
    const children = focusRef.current?.children
    if (!children) return
    const first = fromEnd ? children[0] : children[visible]
    const target = first?.matches?.('a, button, [tabindex]') ? first : first?.querySelector?.('a, button, [tabindex]')
    target?.focus?.()
  }, [expanded, fromEnd, visible])

  return { shown, hidden, expanded, expand, focusRef }
}
