import { useEffect, useRef } from 'react'

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
// Laden mit ?bereich=unterstuetzen am Handy).
function revealTab(list, button) {
  if (!list || !button) return
  const listRect = list.getBoundingClientRect()
  const rect = button.getBoundingClientRect()
  if (rect.left < listRect.left) list.scrollLeft -= listRect.left - rect.left + SCROLL_PEEK
  else if (rect.right > listRect.right) list.scrollLeft += rect.right - listRect.right + SCROLL_PEEK
}

function entriesLabel(count) {
  return count === 1 ? '1 Eintrag' : `${count} Einträge`
}

// Reiter-Leiste in "Entdecken" (Phase U): echte Tabliste (role="tablist", aria-selected, nur der aktive Reiter
// in der Tab-Reihenfolge) mit Zähler je Reiter; Pfeiltasten wählen sofort (automatische Aktivierung). Am Handy
// scrollt die Leiste waagerecht, der gewählte Reiter rückt dabei ins Bild. counts ist null, solange nichts
// geladen ist - dann ohne Zähler.
export default function DiscoverTabs({ tabs, current, counts, panelId, onSelect }) {
  const list = useRef(null)
  const buttons = useRef({})
  // Mit den Zählern werden die Reiter breiter - dann noch einmal nachrücken (nicht bei jedem Rendern, sonst
  // spränge die Leiste zurück, während jemand sie von Hand verschiebt).
  const hasCounts = Boolean(counts)

  useEffect(() => {
    revealTab(list.current, buttons.current[current])
  }, [current, hasCounts])

  function handleKeyDown(event) {
    // Alt+Pfeil ist "Zurück" im Browser, Strg/Cmd-Kombinationen gehören dem System.
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const index = tabs.findIndex((tab) => tab.key === current)
    const next = nextIndex(event.key, index, tabs.length - 1)
    if (next === null) return
    event.preventDefault()
    const key = tabs[next].key
    onSelect(key)
    buttons.current[key]?.focus()
  }

  return (
    <div ref={list} className="discover-tabs" role="tablist" aria-label="Bereiche" onKeyDown={handleKeyDown}>
      {tabs.map((tab) => {
        const selected = tab.key === current
        return (
          <button
            key={tab.key}
            ref={(el) => {
              buttons.current[tab.key] = el
            }}
            type="button"
            role="tab"
            id={`discover-tab-${tab.key}`}
            className="discover-tab"
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(tab.key)}
          >
            {tab.label}
            {counts && (
              <>
                <span className="discover-tab-count" aria-hidden="true">
                  {counts[tab.key]}
                </span>
                <span className="visually-hidden"> ({entriesLabel(counts[tab.key])})</span>
              </>
            )}
          </button>
        )
      })}
    </div>
  )
}
