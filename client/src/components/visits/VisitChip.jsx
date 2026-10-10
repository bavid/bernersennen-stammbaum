import { Link } from 'react-router-dom'
import { HOME_LABEL, START_ROUTE } from '../../lib/areas.js'
import Icon from '../Icon.jsx'
import { t } from '../../lib/i18n/index.js'

// Zu Besuch in einem anderen Zuhause (Phase V2; Phase W Schritt 2 statt des Bands in der Leiste oben): ein kleiner Chip
// im Kopf der Besuchsseiten (Gruppenseite und Tierseiten) - "Zu Besuch · Zurück zu Mein Zuhause". Der Link führt nur nach
// /start, den Wechsel macht dort das AreaGate (genau ein api.view). name: das besuchte Zuhause (für Screenreader).
export default function VisitChip({ name }) {
  return (
    <Link to={START_ROUTE} className="chip visit-chip" aria-label={t('Zu Besuch bei {name} – zurück zu {home}', { name, home: t(HOME_LABEL) })}>
      <Icon name="home" />
      <span>{t('Zu Besuch · Zurück zu {home}', { home: t(HOME_LABEL) })}</span>
    </Link>
  )
}
