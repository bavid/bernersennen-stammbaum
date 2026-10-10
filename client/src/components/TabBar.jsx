import { useEffect, useRef, useState } from 'react'

// Abstand, mit dem ein angeschnittener Reiter ins Bild rückt - der Nachbar bleibt als Hinweis sichtbar.
const SCROLL_PEEK = 24

// Tastatur in der Reiter-Leiste: Pfeile wechseln zum Nachbarn (am Ende wieder vorn), Pos1/Ende springen.
function nextIndex(key, index, last) {
  if (key === 'ArrowRight') return index === last ? 0 : index + 1
  if (key === 'ArrowLeft') return index === 0 ? last : index - 1
  if (key === 'Home') return 0
  if (key === 'End') return last
  return null
}

// Den gewählten Reiter waagerecht ins Bild holen - nur die Leiste scrollt, nie die Seite (auch beim ersten
// Laden mit einem Reiter aus der Adresse am Handy).
function revealTab(list, button) {
  if (!list || !button) return
  const listRect = list.getBoundingClientRect()
  const rect = button.getBoundingClientRect()
  if (rect.left < listRect.left) list.scrollLeft -= listRect.left - rect.left + SCROLL_PEEK
  else if (rect.right > listRect.right) list.scrollLeft += rect.right - listRect.right + SCROLL_PEEK
}

// Audit (Portal am Handy): 609 px Reiter in 381 px Leiste - „Wir waren hier“ lag unsichtbar rechts außen. Ob links
// oder rechts noch Reiter verborgen sind; die Kanten blenden dann weich aus (tabs.css), das zeigt: hier geht's weiter.
const EDGE_SLACK = 2

export function overflowEdges(list) {
  if (!list) return { start: false, end: false }
  const { scrollLeft, scrollWidth, clientWidth } = list
  return { start: scrollLeft > EDGE_SLACK, end: scrollWidth - clientWidth - scrollLeft > EDGE_SLACK }
}

// Hält die Kanten-Merker aktuell: beim Scrollen und wenn sich die Breite der Leiste ändert.
function useOverflowEdges(list) {
  const [edges, setEdges] = useState({ start: false, end: false })

  useEffect(() => {
    const el = list.current
    if (!el) return undefined
    const update = () =>
      setEdges((prev) => {
        const next = overflowEdges(el)
        return prev.start === next.start && prev.end === next.end ? prev : next
      })
    update()
    el.addEventListener('scroll', update, { passive: true })
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null
    observer?.observe(el)
    window.addEventListener('resize', update)
    return () => {
      el.removeEventListener('scroll', update)
      observer?.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [list])

  return edges
}

function hasCount(value) {
  return value !== undefined && value !== null
}

// Reiter-Leiste (Phase U, Entdecken und Admin): echte Tabliste (role="tablist", aria-selected, nur der aktive
// Reiter in der Tab-Reihenfolge) mit optionalem Zähler je Reiter; Pfeiltasten wählen sofort (automatische
// Aktivierung). Am Handy scrollt die Leiste waagerecht, der gewählte Reiter rückt dabei ins Bild.
// - idPrefix: Reiter-Ids `${idPrefix}-${key}` (für aria-labelledby der Panels)
// - panelId: Id des Panels - ein String (ein gemeinsames Panel) oder eine Funktion key => Id (ein Panel je Reiter)
// - counts: { [key]: Zahl } - ein Reiter ohne Eintrag (undefined/null) bleibt ohne Zähler; null = noch nichts geladen
// - countText: (Zahl, key) => vorgelesener Text zum Zähler, z. B. "3 Einträge" oder "2 offen" (key: je Reiter eigene Wörter)
export default function TabBar({ tabs, current, counts, label, idPrefix, panelId, countText, className = '', onSelect }) {
  const list = useRef(null)
  const buttons = useRef({})
  const edges = useOverflowEdges(list)
  // Mit den Zählern werden die Reiter breiter - dann noch einmal nachrücken (nicht bei jedem Rendern, sonst
  // spränge die Leiste zurück, während jemand sie von Hand verschiebt). Audit V7a: am Inhalt der Zähler gemessen -
  // der Admin reicht von Anfang an ein (leeres) Objekt, die Zahlen kommen erst danach.
  const countsKey = counts
    ? Object.entries(counts)
        .filter(([, value]) => hasCount(value))
        .map(([key, value]) => `${key}:${value}`)
        .join(',')
    : ''

  useEffect(() => {
    revealTab(list.current, buttons.current[current])
    // Audit V7a: mit der Webschrift werden die Reiter breiter - beim ersten Laden stand der gewählte Reiter danach halb
    // (Admin „Server“, „Protokoll“ am Handy) außerhalb der Leiste. Darum nach dem Laden der Schriften noch einmal.
    let active = true
    document.fonts?.ready.then(() => active && revealTab(list.current, buttons.current[current]))
    return () => {
      active = false
    }
  }, [current, countsKey])

  function handleKeyDown(event) {
    // Alt+Pfeil ist "Zurück" im Browser, Strg/Cmd-Kombinationen gehören dem System.
    if (event.altKey || event.ctrlKey || event.metaKey) return
    // Vom fokussierten Reiter aus zählen, nicht vom gewählten: der Wechsel läuft über die Adresse (React-Router
    // als Transition) - bei schnellem Tippen ist der neue Reiter schon fokussiert, aber noch nicht gerendert.
    const focused = tabs.findIndex((tab) => buttons.current[tab.key] === event.target)
    const index = focused >= 0 ? focused : tabs.findIndex((tab) => tab.key === current)
    const next = nextIndex(event.key, index, tabs.length - 1)
    if (next === null) return
    event.preventDefault()
    const key = tabs[next].key
    // Zweites Argument: der Wechsel kam per Tastatur - wer den Reiter im Verlauf führt (Portal), ersetzt dann den Eintrag
    // statt je Pfeiltaste einen neuen anzulegen.
    onSelect(key, { keyboard: true })
    buttons.current[key]?.focus()
  }

  return (
    <div
      ref={list}
      className={`tab-bar ${className}`.trim()}
      role="tablist"
      aria-label={label}
      data-more-start={edges.start || undefined}
      data-more-end={edges.end || undefined}
      onKeyDown={handleKeyDown}
    >
      {tabs.map((tab) => {
        const selected = tab.key === current
        const count = counts?.[tab.key]
        return (
          <button
            key={tab.key}
            ref={(el) => {
              buttons.current[tab.key] = el
            }}
            type="button"
            role="tab"
            id={`${idPrefix}-${tab.key}`}
            className="tab-bar-tab"
            aria-selected={selected}
            aria-controls={typeof panelId === 'function' ? panelId(tab.key) : panelId}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(tab.key)}
          >
            {tab.label}
            {hasCount(count) && (
              <>
                <span className="tab-bar-count" aria-hidden="true">
                  {count}
                </span>
                <span className="visually-hidden"> ({countText(count, tab.key)})</span>
              </>
            )}
          </button>
        )
      })}
    </div>
  )
}
