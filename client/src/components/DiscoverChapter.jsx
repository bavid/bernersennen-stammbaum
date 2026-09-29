import Icon from './Icon.jsx'

// Bausteine für die Bereiche im Reiter "Entdecken" (DiscoverPage, DiscoverSections, SupportBlock).

// Ein Bereich: eigener Landmark-Abschnitt (aria-labelledby) mit Überschrift, Kurztext und - unter "Alle",
// wenn es mehr gibt als gezeigt - "Alle anzeigen" rechts daneben (wechselt den Reiter).
export default function DiscoverChapter({ id, title, lede, showAll, children }) {
  const headingId = `${id}-title`
  return (
    <section className="discover-chapter" id={id} aria-labelledby={headingId}>
      <header className="discover-chapter-head">
        <div className="discover-chapter-titles">
          <h2 id={headingId}>{title}</h2>
          {lede && <p className="discover-chapter-lede">{lede}</p>}
        </div>
        {showAll && (
          <button type="button" className="discover-show-all" onClick={showAll.onClick}>
            Alle anzeigen
            <span className="visually-hidden">: {title}</span>
            <span className="discover-show-all-count">{showAll.count}</span>
            <Icon name="arrowRight" />
          </button>
        )}
      </header>
      {children}
    </section>
  )
}

// Leerzustand eines Bereichs - kurzer Hinweis, meist mit Link zur Partnerliste.
export function DiscoverEmpty({ icon = 'mapPin', children }) {
  return (
    <div className="discover-empty">
      <Icon name={icon} />
      <p>{children}</p>
    </div>
  )
}

// Umkreis-Fallback: fallback.<abschnitt> = true heißt, im Radius lagen zu wenige Einträge und der
// Server hat die nächsten weiteren angehängt (ausserhalb: true, siehe "Weiter weg").
export function FallbackNote() {
  return (
    <p className="discover-fallback-note" role="note">
      <Icon name="locate" />
      In eurer Nähe gibt es nur wenige – hier die nächsten weiteren.
    </p>
  )
}

// Unterüberschrift innerhalb eines Bereichs, z. B. "Weiter weg".
export function DiscoverSubheading({ children }) {
  return <h3 className="discover-subheading">{children}</h3>
}
