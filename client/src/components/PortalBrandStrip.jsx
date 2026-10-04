import ThemeMark from './ThemeMark.jsx'
import { InternalLink } from './PreviewLink.jsx'
import { useTheme } from '../themes/ThemeProvider.jsx'

// Anker des Anfrage-Formulars "Noch keinen Gutschein?" auf der Startseite (LoginVoucherRequest).
export const VOUCHER_REQUEST_PATH = '/#gutschein-anfragen'

// Dezenter Fuß des Partner-Portals (Phase U): das Portal gehört dem Partner, darunter steht nur leise, wo es
// wohnt - mit dem Weg zur Startseite und zum Gutschein. In der Kundensicht bleiben die Links sichtbar, aber
// deaktiviert (InternalLink).
export default function PortalBrandStrip() {
  const { theme } = useTheme()
  return (
    <aside className="portal-brand-strip" aria-label={`Über ${theme.appName}`}>
      <ThemeMark size={28} />
      <p>
        Mit <strong>{theme.appName}</strong> – eine Chronik für deine Tiere
      </p>
      <nav className="portal-brand-links" aria-label={`Mehr über ${theme.appName}`}>
        <InternalLink to="/">Mehr erfahren</InternalLink>
        <InternalLink to={VOUCHER_REQUEST_PATH}>Einladungscode anfragen</InternalLink>
      </nav>
    </aside>
  )
}
