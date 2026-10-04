import Icon from './Icon.jsx'
import ThemeMark from './ThemeMark.jsx'
import { useTheme } from '../themes/ThemeProvider.jsx'

// Die Beispiel-Kundin der Kundensicht - dieselbe Familie wie die Demo ("Zuhause am Deich").
export const EXAMPLE_CUSTOMER_NAME = 'Zuhause am Deich'

// Untere Leiste eines Haushalts (lib/navItems.js, Phase W: Start · Tiere · Familien · Entdecken + Menü) - hier nur als
// Bild: "Entdecken" aktiv. Tiere und Familien heißen wie im Auftritt.
function customerNav(words) {
  return [
    { icon: 'home', label: 'Start' },
    { icon: 'paw', label: words.animals },
    { icon: 'users', label: words.groups },
    { icon: 'compass', label: 'Entdecken', active: true },
    { icon: 'menu', label: 'Menü' }
  ]
}

// Rahmen der Kundensicht (Phase P1): deutet die App einer Kundin an - kleiner Kopf mit ihrem Namen, der Inhalt und
// die untere Leiste eines Haushalts. Seit den Portal-Reitern ohne eigenen Scrollbereich: am Desktop ein handybreiter
// Rahmen, der mit seinem Inhalt wächst (die Seite scrollt, die Leiste bleibt unten im Bild stehen); am Handy gar kein
// Rahmen-im-Rahmen, sondern volle Breite mit einer schmalen Zeile "Vorschau" (customer-view.css). Die Leiste ist reine
// Dekoration: aria-hidden, nichts darin ist fokussierbar. showNav (Audit V7a): das Portal ist eine öffentliche Seite
// ohne diese Leiste - dort stünde sonst "Entdecken" aktiv unter dem Portal.
export default function PreviewFrame({ label, children, showNav = true }) {
  const { words } = useTheme()
  return (
    <div className="preview-frame">
      <div className="preview-frame-device">
        <div className="preview-frame-header">
          <ThemeMark size={26} />
          <span className="preview-frame-customer">
            {EXAMPLE_CUSTOMER_NAME} <span className="preview-frame-example">(Beispiel)</span>
          </span>
          <span className="preview-frame-label">Vorschau</span>
        </div>
        <div className="preview-frame-screen" role="region" aria-label={label}>
          {children}
        </div>
        {showNav && (
          <div className="preview-frame-nav" aria-hidden="true">
            {customerNav(words).map((item) => (
              <span key={item.label} className={item.active ? 'is-active' : undefined}>
                <Icon name={item.icon} />
                {item.label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
