import TabBar from './TabBar.jsx'

// Vorgelesen am Zähler: "(3 Treffer)" - wie in der Suche; „Eintrag“ hieß früher die Erinnerung.
function entriesLabel(count) {
  return `${count} Treffer`
}

// Reiter-Leiste in "Entdecken" (Phase U): die gemeinsame TabBar mit Zähler je Reiter ("3 Treffer") und einem
// gemeinsamen Panel. counts ist null, solange nichts geladen ist - dann ohne Zähler.
export default function DiscoverTabs({ tabs, current, counts, panelId, onSelect }) {
  return (
    <TabBar
      tabs={tabs}
      current={current}
      counts={counts}
      label="Bereiche"
      idPrefix="discover-tab"
      panelId={panelId}
      countText={entriesLabel}
      className="discover-tabs"
      onSelect={onSelect}
    />
  )
}
