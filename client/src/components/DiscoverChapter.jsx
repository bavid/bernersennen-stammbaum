import Icon from './Icon.jsx'

// Bausteine für die Kapitel im Reiter "Entdecken" (DiscoverPage, DiscoverSections, SupportBlock).

// Ein Kapitel: eigener Landmark-Abschnitt (aria-labelledby) mit großer Überschrift und Kapitelnummer.
export default function DiscoverChapter({ id, number, title, lede, children }) {
  const headingId = `${id}-title`
  return (
    <section className="discover-chapter" id={id} aria-labelledby={headingId}>
      <header className="discover-chapter-head">
        <span className="discover-chapter-number" aria-hidden="true">
          {number}
        </span>
        <div>
          <h2 id={headingId}>{title}</h2>
          {lede && <p className="discover-chapter-lede">{lede}</p>}
        </div>
      </header>
      {children}
    </section>
  )
}

// Leerzustand eines Kapitels - kurzer Hinweis, meist mit Link zur Partnerliste.
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

// Unterüberschrift innerhalb eines Kapitels, z. B. "Weiter weg".
export function DiscoverSubheading({ children }) {
  return <h3 className="discover-subheading">{children}</h3>
}
