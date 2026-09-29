import Icon from './Icon.jsx'
import ThemeMark from './ThemeMark.jsx'

// Die Beispiel-Kundin der Kundensicht - dieselbe Familie wie die Demo ("Zuhause am Deich").
export const EXAMPLE_CUSTOMER_NAME = 'Zuhause am Deich'

// Untere Leiste eines Haushalts (lib/navItems.js NAV_ITEMS_HOME) - hier nur als Bild: "Entdecken" aktiv.
const CUSTOMER_NAV = [
  { icon: 'route', label: 'Wegbegleiter' },
  { icon: 'tree', label: 'Stammbaum' },
  { icon: 'pin', label: 'Pinnwand' },
  { icon: 'compass', label: 'Entdecken', active: true },
  { icon: 'collage', label: 'Collage' }
]

// Rahmen der Kundensicht (Phase P1): deutet die App einer Kundin an - kleiner Kopf mit ihrem Namen,
// Inhalt, der in sich scrollt, und die untere Leiste eines Haushalts. Am Desktop handybreit und mittig,
// am Handy volle Breite. Die Leiste ist reine Dekoration: aria-hidden, nichts darin ist fokussierbar.
export default function PreviewFrame({ label, children }) {
  return (
    <div className="preview-frame">
      <div className="preview-frame-device">
        <div className="preview-frame-header">
          <ThemeMark size={26} />
          <span className="preview-frame-customer">
            {EXAMPLE_CUSTOMER_NAME} <span className="preview-frame-example">(Beispiel)</span>
          </span>
        </div>
        {/* Eigener Scrollbereich - per Tastatur erreichbar, damit er sich auch ohne Maus scrollen lässt. */}
        <div className="preview-frame-screen" role="region" aria-label={label} tabIndex={0}>
          {children}
        </div>
        <div className="preview-frame-nav" aria-hidden="true">
          {CUSTOMER_NAV.map((item) => (
            <span key={item.label} className={item.active ? 'is-active' : undefined}>
              <Icon name={item.icon} />
              {item.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
