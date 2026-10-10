import ThemeMark from './ThemeMark.jsx'
import { InternalLink } from './PreviewLink.jsx'
import { useTheme } from '../themes/ThemeProvider.jsx'
import { t } from '../lib/i18n/index.js'

// Dezenter Fuß des Partner-Portals und des Steckbriefs (Phase U, Feedback-Runde): beide gehören dem Partner - darunter
// nur EIN leiser Link zur Startseite der Plattform ("Was ist Familie auf Pfoten?"), wo man auch die Demo findet. Keine
// Demo-Knöpfe, kein "Einladungscode anfragen" mehr. Nur ohne Sitzung und (Portal) in der Kundensicht (dort deaktiviert,
// InternalLink) - angemeldet stehen beide in der normalen Hülle der App mit deren Fuß (inApp).
export default function PortalBrandStrip() {
  const { theme } = useTheme()
  return (
    <p className="portal-brand-strip">
      <ThemeMark size={22} />
      <InternalLink to="/">{t('Was ist {name}?', { name: theme.appName })}</InternalLink>
    </p>
  )
}
