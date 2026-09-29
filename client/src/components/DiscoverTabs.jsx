import { useEffect, useRef } from 'react'

// Tastatur in der Reiter-Leiste: Pfeile wechseln zum Nachbarn (am Ende wieder vorn), Pos1/Ende springen.
function nextIndex(key, index, last) {
  if (key === 'ArrowRight') return index === last ? 0 : index + 1
  if (key === 'ArrowLeft') return index === 0 ? last : index - 1
  if (key === 'Home') return 0
  if (key === 'End') return last
  return null
}

// Reiter-Leiste in "Entdecken" (Phase U): echte Tabliste (role="tablist", aria-selected, nur der aktive Reiter
// in der Tab-Reihenfolge) mit Zähler je Reiter; Pfeiltasten wählen sofort (automatische Aktivierung). Am Handy
// scrollt die Leiste waagerecht, der gewählte Reiter rückt dabei ins Bild. counts ist null, solange nichts
// geladen ist - dann ohne Zähler.
export default function DiscoverTabs({ tabs, current, counts, panelId, onSelect }) {
  const buttons = useRef({})
  const mounted = useRef(false)

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    buttons.current[current]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [current])

  function handleKeyDown(event) {
    const index = tabs.findIndex((tab) => tab.key === current)
    const next = nextIndex(event.key, index, tabs.length - 1)
    if (next === null) return
    event.preventDefault()
    const key = tabs[next].key
    onSelect(key)
    buttons.current[key]?.focus()
  }

  return (
    <div className="discover-tabs" role="tablist" aria-label="Bereiche" onKeyDown={handleKeyDown}>
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
            {counts && <span className="discover-tab-count">{counts[tab.key]}</span>}
          </button>
        )
      })}
    </div>
  )
}
