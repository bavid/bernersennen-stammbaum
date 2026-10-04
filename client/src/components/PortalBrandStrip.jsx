import ThemeMark from './ThemeMark.jsx'
import { InternalLink } from './PreviewLink.jsx'
import { useTheme } from '../themes/ThemeProvider.jsx'

// Dezenter Fuß des Partner-Portals (Phase U, Feedback-Runde): das Portal gehört dem Partner - darunter nur EIN leiser
// Link zur Startseite der Plattform ("Was ist Familie auf Pfoten?"), wo man auch die Demo findet. Keine Demo-Knöpfe,
// kein "Einladungscode anfragen" mehr auf dem Portal. Nur ohne Sitzung und in der Kundensicht (dort deaktiviert,
// InternalLink) - angemeldet steht das Portal in der normalen Hülle der App mit deren Fuß (PartnerPortalPage inApp).
export default function PortalBrandStrip() {
  const { theme } = useTheme()
  return (
    <p className="portal-brand-strip">
      <ThemeMark size={22} />
      <InternalLink to="/">Was ist {theme.appName}?</InternalLink>
    </p>
  )
}
